-- =====================================================================
-- QUIZ ELEITORAL — TODAS AS MIGRATIONS EM UM ARQUIVO SÓ
--
-- Cole este arquivo inteiro no SQL Editor da Supabase e clique em Run.
-- Ele substitui os 5 arquivos de supabase/migrations/ — o conteúdo é
-- exatamente o mesmo, na ordem correta.
--
-- É seguro rodar mais de uma vez: tudo usa "if not exists" ou "or replace".
--
-- ANTES DE RODAR: habilite as extensões em Database > Extensions
--   · vector    (busca semântica nos documentos)
--   · pg_cron   (rotinas automáticas — pode deixar para depois)
-- =====================================================================


-- ####################################################################
-- #  001_conteudo.sql
-- ####################################################################

-- =====================================================================
-- 001 · DOMÍNIO 1 — CONTEÚDO
-- Motor de perguntas versionado. Leitura massiva, escrita rara.
-- Tudo aqui vai para o cache de borda.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Eleições como entidade reutilizável (2026, 2028, 2030...)
-- ---------------------------------------------------------------------
create table if not exists elections (
  id            smallint primary key,               -- 2026
  name          text     not null,
  round         smallint not null default 1,
  voting_date   date     not null,
  is_active     boolean  not null default false
);

comment on table elections is 'Uma linha por eleição. O id é o ano, para leitura humana.';

-- ---------------------------------------------------------------------
-- Temas e subtemas
-- ids curtos de propósito: entram no payload compacto de respostas
-- ---------------------------------------------------------------------
create table if not exists themes (
  id            smallint primary key,
  slug          text     unique not null,           -- 'seguranca'
  name          text     not null,
  description   text,
  icon          text,
  sort_order    smallint not null default 0,
  is_published  boolean  not null default false
);

create table if not exists subthemes (
  id            smallint primary key,
  theme_id      smallint not null references themes(id) on delete cascade,
  slug          text     not null,
  name          text     not null,
  unique (theme_id, slug)
);

-- ---------------------------------------------------------------------
-- MOTOR DE PERGUNTAS VERSIONADO
-- ---------------------------------------------------------------------
create table if not exists questions (
  id            integer  primary key generated always as identity,
  code          text     unique not null,           -- 'SEG-001' — estável entre versões
  theme_id      smallint not null references themes(id),
  subtheme_id   smallint references subthemes(id),
  version       smallint not null default 1,

  statement     text     not null,                  -- nível 1: a pergunta simples
  explanation   text,                               -- nível 2: "por que perguntamos isso?"

  answer_type   text     not null default 'yes_no_dk'
                check (answer_type in ('yes_no_dk','scale_5','multi_choice')),
  depth_level   smallint not null default 1,        -- 1 = básica, 2+ = aprofundamento
  weight        numeric(3,2) not null default 1.00,

  status        text     not null default 'draft'
                check (status in ('draft','review','published','retired')),
  valid_from    date,
  valid_until   date,

  -- Regra de neutralidade auditável: uma pergunta só é publicada com revisor
  neutrality_reviewed_by text,
  neutrality_reviewed_at timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint publicada_exige_revisao
    check (status <> 'published' or neutrality_reviewed_by is not null)
);

create index if not exists questions_publicadas_idx
  on questions (theme_id, depth_level) where status = 'published';

-- ---------------------------------------------------------------------
-- Histórico imutável de alterações em perguntas
-- ---------------------------------------------------------------------
create table if not exists question_revisions (
  id            bigint   primary key generated always as identity,
  question_id   integer  not null references questions(id) on delete cascade,
  version       smallint not null,
  snapshot      jsonb    not null,
  changed_by    text     not null,
  changed_at    timestamptz not null default now(),
  reason        text
);

create index if not exists question_revisions_q_idx
  on question_revisions (question_id, changed_at desc);

-- Grava a versão anterior automaticamente a cada UPDATE
create or replace function log_question_revision() returns trigger
language plpgsql as $$
begin
  if to_jsonb(old) is distinct from to_jsonb(new) then
    insert into question_revisions (question_id, version, snapshot, changed_by, reason)
    values (old.id, old.version, to_jsonb(old),
            coalesce(current_setting('app.actor', true), 'system'),
            'update automático');
    new.updated_at := now();
    new.version := old.version + 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_question_revision on questions;
create trigger trg_question_revision
  before update on questions
  for each row execute function log_question_revision();

-- ---------------------------------------------------------------------
-- Perguntas adaptativas: "se respondeu SIM na 1, mostre a 2"
-- ---------------------------------------------------------------------
create table if not exists question_dependencies (
  parent_question_id integer  not null references questions(id) on delete cascade,
  required_answer    smallint not null,             -- 1=SIM  0=NÃO  2=NÃO SEI
  child_question_id  integer  not null references questions(id) on delete cascade,
  primary key (parent_question_id, required_answer, child_question_id)
);

-- ---------------------------------------------------------------------
-- Área ENTENDA
-- ---------------------------------------------------------------------
create table if not exists explainers (
  id            integer primary key generated always as identity,
  slug          text    unique not null,
  title         text    not null,                   -- 'O que faz um senador?'
  body_md       text    not null,
  theme_id      smallint references themes(id),
  is_published  boolean not null default false
);

-- ####################################################################
-- #  002_evidencia.sql
-- ####################################################################

-- =====================================================================
-- 002 · DOMÍNIO 2 — EVIDÊNCIA
-- Candidatos, fontes, claims e posições.
-- Regra: nada entra sem origem verificável, nada é publicado sem revisor.
-- =====================================================================

create extension if not exists "vector";

create table if not exists parties (
  id            smallint primary key,
  tse_number    smallint unique,
  acronym       text     not null,
  name          text     not null
);

create table if not exists candidates (
  id            integer  primary key generated always as identity,
  election_id   smallint not null references elections(id),
  tse_id        text,                                -- id oficial do TSE
  legal_name    text     not null,
  ballot_name   text     not null,                   -- nome de urna
  office        text     not null
                check (office in ('presidente','governador','senador',
                                  'deputado_federal','deputado_estadual','deputado_distrital')),
  state         char(2),                             -- null para presidente
  party_id      smallint references parties(id),
  photo_path    text,
  registration_status text not null default 'pending'
                check (registration_status in ('pending','approved','rejected','withdrawn')),
  created_at    timestamptz not null default now(),
  unique (election_id, tse_id)
);

create index if not exists candidates_recorte_idx
  on candidates (election_id, office, state);

-- ---------------------------------------------------------------------
-- FONTES: o documento original é sempre a fonte da verdade
-- ---------------------------------------------------------------------
create table if not exists sources (
  id            integer  primary key generated always as identity,
  source_type   text     not null
                check (source_type in ('plano_governo','projeto_lei','votacao',
                                       'discurso','portal_oficial','requerimento','outro')),
  issuer        text     not null,                   -- 'TSE', 'Câmara dos Deputados'
  url           text     not null,
  title         text     not null,
  published_at  date,
  retrieved_at  timestamptz not null default now(),
  storage_path  text,                                -- cópia do arquivo no R2/Storage
  document_hash text     not null unique             -- SHA-256: prova de que não mudou
);

-- ---------------------------------------------------------------------
-- CLAIMS: afirmações extraídas dos documentos
-- ---------------------------------------------------------------------
create table if not exists claims (
  id            bigint   primary key generated always as identity,
  candidate_id  integer  not null references candidates(id) on delete cascade,
  source_id     integer  not null references sources(id),
  theme_id      smallint references themes(id),

  statement     text     not null,                   -- o trecho em linguagem simples
  verbatim      text,                                -- o trecho original, literal
  page_ref      text,                                -- 'p. 42' / artigo / minuto

  extracted_by  text     not null default 'ai' check (extracted_by in ('ai','human')),
  model_version text,

  status        text     not null default 'pending_review'
                check (status in ('pending_review','approved','rejected','disputed')),
  reviewed_by   text,
  reviewed_at   timestamptz,

  embedding     vector(1536),                        -- busca semântica (área VERIFIQUE)
  created_at    timestamptz not null default now(),

  constraint aprovado_exige_revisor
    check (status <> 'approved' or reviewed_by is not null)
);

create index if not exists claims_candidato_idx on claims (candidate_id, status);
create index if not exists claims_busca_idx
  on claims using gin (to_tsvector('portuguese', statement));
create index if not exists claims_embedding_idx
  on claims using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------------------------------------------------------------------
-- A PONTE: liga a resposta do usuário ao candidato
-- É esta tabela que o job noturno exporta como matriz para a borda.
-- ---------------------------------------------------------------------
create table if not exists candidate_positions (
  candidate_id  integer  not null references candidates(id) on delete cascade,
  question_id   integer  not null references questions(id) on delete cascade,

  stance        smallint not null check (stance between -1 and 1),   -- -1 contra · 0 neutro · 1 a favor
  confidence    numeric(3,2) not null check (confidence between 0 and 1),
  evidence_claim_ids bigint[] not null default '{}',                 -- "por que estou vendo isso?"

  derived_by    text     not null default 'ai' check (derived_by in ('ai','human')),
  reviewed_by   text,
  reviewed_at   timestamptz,
  is_published  boolean  not null default false,
  updated_at    timestamptz not null default now(),

  primary key (candidate_id, question_id),

  -- IA NÃO É A FONTE DA VERDADE: sem revisor humano, não vai ao ar.
  constraint publicada_exige_revisor
    check (not is_published or reviewed_by is not null),
  constraint publicada_exige_evidencia
    check (not is_published or array_length(evidence_claim_ids, 1) >= 1)
);

create index if not exists positions_publicadas_idx
  on candidate_positions (question_id) where is_published;

-- ---------------------------------------------------------------------
-- Histórico legislativo (Fase 3)
-- ---------------------------------------------------------------------
create table if not exists legislative_actions (
  id            bigint   primary key generated always as identity,
  candidate_id  integer  not null references candidates(id) on delete cascade,
  action_type   text     not null
                check (action_type in ('autoria','coautoria','relatoria',
                                       'voto','requerimento','comissao')),
  external_id   text,                                -- id do projeto na Câmara/Senado
  title         text,
  vote          text check (vote in ('sim','nao','abstencao','ausente','obstrucao')),
  occurred_at   date     not null,
  source_id     integer  not null references sources(id),
  theme_id      smallint references themes(id)
);

create index if not exists legislative_candidato_idx
  on legislative_actions (candidate_id, occurred_at desc);

-- ####################################################################
-- #  003_participacao.sql
-- ####################################################################

-- =====================================================================
-- 003 · DOMÍNIO 3 — PARTICIPAÇÃO
-- A tabela que precisa aguentar o pico.
-- Regras aplicadas aqui: 1 linha por sessão (não por resposta),
-- respostas em formato compacto, e particionamento por mês.
-- =====================================================================

create table if not exists quiz_sessions (
  id            uuid     not null default gen_random_uuid(),
  election_id   smallint not null,
  created_at    timestamptz not null default now(),

  -- Identidade mínima. user_id só existe se a pessoa optar por criar conta.
  user_id       uuid,                          -- FK para auth.users adicionada abaixo
  device_hash   text,                          -- sha256(ip + ua + sal_do_dia). NUNCA o IP em claro.

  -- Contexto declarado, opcional e grosseiro de propósito
  state         char(2),
  birth_decade  smallint,                      -- 1990, não a data de nascimento
  priority_themes smallint[],                  -- até 5 ids de tema

  -- Respostas no formato compacto:
  --   {"v":1,"a":[[12,1],[13,0],[14,2]]}
  --   1 = SIM   0 = NÃO   2 = NÃO SEI   3 = QUERO ENTENDER
  answers       jsonb    not null default '{"v":1,"a":[]}',
  answer_count  smallint not null default 0,
  completed     boolean  not null default false,

  -- Compartilhamento
  share_code    text,                          -- app.com.br/r/d8f73a
  result_snapshot jsonb,                       -- congelado no momento do compartilhamento

  -- Só entra nos números públicos se passou nas checagens de integridade
  is_counted    boolean  not null default false,

  -- LGPD: qual texto de consentimento a pessoa aceitou, e quando
  consent_version text,
  consented_at  timestamptz,

  primary key (id, created_at)
) partition by range (created_at);

comment on table quiz_sessions is
  'Append-only. Uma linha por sessão de quiz. Particionada por mês.';

-- FK para auth.users só existe dentro da Supabase.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'auth' and table_name = 'users') then
    execute 'alter table quiz_sessions
             add constraint quiz_sessions_user_fk
             foreign key (user_id) references auth.users(id) on delete set null';
  end if;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------
-- Partições. A rotina ensure_future_partitions() (migration 004)
-- cria as próximas automaticamente todo mês.
-- ---------------------------------------------------------------------
create table if not exists quiz_sessions_2026_08 partition of quiz_sessions
  for values from ('2026-08-01') to ('2026-09-01');
create table if not exists quiz_sessions_2026_09 partition of quiz_sessions
  for values from ('2026-09-01') to ('2026-10-01');
create table if not exists quiz_sessions_2026_10 partition of quiz_sessions
  for values from ('2026-10-01') to ('2026-11-01');
create table if not exists quiz_sessions_2026_11 partition of quiz_sessions
  for values from ('2026-11-01') to ('2026-12-01');

create unique index if not exists quiz_sessions_share_idx
  on quiz_sessions (share_code, created_at) where share_code is not null;
create index if not exists quiz_sessions_estado_idx
  on quiz_sessions (state, created_at) where is_counted;
create index if not exists quiz_sessions_user_idx
  on quiz_sessions (user_id, created_at) where user_id is not null;

-- ---------------------------------------------------------------------
-- Rate limiting leve por device_hash, sem precisar de Redis no início.
-- A janela é curta e a tabela é limpa pelo cron.
-- ---------------------------------------------------------------------
create table if not exists submission_log (
  device_hash   text        not null,
  created_at    timestamptz not null default now()
);

create index if not exists submission_log_idx on submission_log (device_hash, created_at desc);

-- ####################################################################
-- #  004_agregados.sql
-- ####################################################################

-- =====================================================================
-- 004 · DOMÍNIO 4 — AGREGADOS
-- Regra 5: agregado nunca é COUNT(*) ao vivo.
-- Estas tabelas são pequenas, recalculadas por cron e servidas do cache.
-- =====================================================================

create table if not exists stats_by_state (
  election_id        smallint not null,
  state              char(2)  not null,
  sessions_started   bigint   not null default 0,
  sessions_completed bigint   not null default 0,
  answers_total      bigint   not null default 0,
  updated_at         timestamptz not null default now(),
  primary key (election_id, state)
);

create table if not exists question_stats (
  question_id   integer primary key references questions(id) on delete cascade,
  yes_count     bigint  not null default 0,
  no_count      bigint  not null default 0,
  dk_count      bigint  not null default 0,
  updated_at    timestamptz not null default now()
);

-- Marca-d'água: até onde as sessões já foram contabilizadas.
-- Permite recálculo incremental — lê só o que entrou desde a última rodada.
create table if not exists stats_watermark (
  id                boolean primary key default true check (id),
  last_processed_at timestamptz not null default '2020-01-01'
);
insert into stats_watermark (id) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------
-- refresh_participation_stats()
-- Roda a cada 5 minutos. Só lê a fatia nova da tabela particionada.
-- ---------------------------------------------------------------------
create or replace function refresh_participation_stats() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_from timestamptz;
  v_to   timestamptz := now() - interval '10 seconds';  -- margem para escritas em voo
begin
  select last_processed_at into v_from from stats_watermark;
  if v_to <= v_from then return; end if;

  -- Participação por estado
  insert into stats_by_state as s
    (election_id, state, sessions_started, sessions_completed, answers_total)
  select q.election_id,
         coalesce(q.state, 'ZZ'),
         count(*),
         count(*) filter (where q.completed),
         coalesce(sum(q.answer_count), 0)
  from quiz_sessions q
  where q.created_at > v_from
    and q.created_at <= v_to
    and q.is_counted
  group by q.election_id, coalesce(q.state, 'ZZ')
  on conflict (election_id, state) do update
    set sessions_started   = s.sessions_started   + excluded.sessions_started,
        sessions_completed = s.sessions_completed + excluded.sessions_completed,
        answers_total      = s.answers_total      + excluded.answers_total,
        updated_at         = now();

  -- Distribuição de respostas por pergunta (expande o jsonb compacto)
  insert into question_stats as t (question_id, yes_count, no_count, dk_count)
  select (elem->>0)::int as question_id,
         count(*) filter (where (elem->>1)::int = 1),
         count(*) filter (where (elem->>1)::int = 0),
         count(*) filter (where (elem->>1)::int = 2)
  from quiz_sessions q
       cross join lateral jsonb_array_elements(q.answers -> 'a') as elem
  where q.created_at > v_from
    and q.created_at <= v_to
    and q.is_counted
    and exists (select 1 from questions qq where qq.id = (elem->>0)::int)
  group by 1
  on conflict (question_id) do update
    set yes_count  = t.yes_count + excluded.yes_count,
        no_count   = t.no_count  + excluded.no_count,
        dk_count   = t.dk_count  + excluded.dk_count,
        updated_at = now();

  update stats_watermark set last_processed_at = v_to;
end $$;

-- ---------------------------------------------------------------------
-- ensure_future_partitions()
-- Roda dia 1 de cada mês e cria as partições dos próximos meses.
-- ---------------------------------------------------------------------
create or replace function ensure_future_partitions(p_months int default 3) returns void
language plpgsql as $$
declare
  v_start date;
  v_end   date;
  v_name  text;
begin
  for i in 0..p_months loop
    v_start := date_trunc('month', current_date + (i || ' month')::interval)::date;
    v_end   := (v_start + interval '1 month')::date;
    v_name  := format('quiz_sessions_%s', to_char(v_start, 'YYYY_MM'));

    if not exists (select 1 from pg_class where relname = v_name) then
      execute format(
        'create table %I partition of quiz_sessions for values from (%L) to (%L)',
        v_name, v_start, v_end);

      -- CRÍTICO: RLS não é herdado pela partição.
      -- Sem esta linha, qualquer um lê as sessões consultando a partição direto.
      execute format('alter table %I enable row level security', v_name);

      raise notice 'partição criada: %', v_name;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- purge_submission_log() — a tabela de rate limit não precisa de memória longa
-- ---------------------------------------------------------------------
create or replace function purge_submission_log() returns void
language sql as $$
  delete from submission_log where created_at < now() - interval '24 hours';
$$;

-- ---------------------------------------------------------------------
-- AGENDAMENTO
-- Rode este bloco no SQL Editor da Supabase DEPOIS de habilitar a
-- extensão pg_cron em Database › Extensions.
-- ---------------------------------------------------------------------
-- select cron.schedule('refresh-stats',      '*/5 * * * *', $$ select refresh_participation_stats(); $$);
-- select cron.schedule('create-partitions',  '0 3 1 * *',   $$ select ensure_future_partitions();   $$);
-- select cron.schedule('purge-submissions',  '0 4 * * *',   $$ select purge_submission_log();       $$);

-- ####################################################################
-- #  005_rls.sql
-- ####################################################################

-- =====================================================================
-- 005 · SEGURANÇA — ROW LEVEL SECURITY
--
-- A chave `anon` fica exposta no navegador: isso é por design.
-- O que protege o banco é o RLS. Uma tabela sem RLS é uma tabela pública.
--
-- A role `service_role` (usada só no servidor) ignora RLS por definição —
-- por isso nenhuma política precisa ser escrita para ela.
-- =====================================================================

alter table elections            enable row level security;
alter table themes               enable row level security;
alter table subthemes            enable row level security;
alter table questions            enable row level security;
alter table question_revisions   enable row level security;
alter table question_dependencies enable row level security;
alter table explainers           enable row level security;

alter table parties              enable row level security;
alter table candidates           enable row level security;
alter table sources              enable row level security;
alter table claims               enable row level security;
alter table candidate_positions  enable row level security;
alter table legislative_actions  enable row level security;

alter table quiz_sessions        enable row level security;
alter table submission_log       enable row level security;
alter table stats_by_state       enable row level security;
alter table question_stats       enable row level security;
alter table stats_watermark      enable row level security;

-- ---------------------------------------------------------------------
-- CONTEÚDO — o público lê apenas o que está publicado
-- ---------------------------------------------------------------------
drop policy if exists "publico le eleicoes ativas" on elections;
create policy "publico le eleicoes ativas" on elections
  for select to anon, authenticated using (is_active);

drop policy if exists "publico le temas publicados" on themes;
create policy "publico le temas publicados" on themes
  for select to anon, authenticated using (is_published);

drop policy if exists "publico le subtemas" on subthemes;
create policy "publico le subtemas" on subthemes
  for select to anon, authenticated
  using (exists (select 1 from themes t where t.id = theme_id and t.is_published));

drop policy if exists "publico le perguntas publicadas" on questions;
create policy "publico le perguntas publicadas" on questions
  for select to anon, authenticated using (status = 'published');

drop policy if exists "publico le dependencias" on question_dependencies;
create policy "publico le dependencias" on question_dependencies
  for select to anon, authenticated using (true);

drop policy if exists "publico le explicadores" on explainers;
create policy "publico le explicadores" on explainers
  for select to anon, authenticated using (is_published);

-- ---------------------------------------------------------------------
-- EVIDÊNCIA — nada aparece sem revisão humana
-- ---------------------------------------------------------------------
drop policy if exists "publico le partidos" on parties;
create policy "publico le partidos" on parties
  for select to anon, authenticated using (true);

drop policy if exists "publico le candidatos deferidos" on candidates;
create policy "publico le candidatos deferidos" on candidates
  for select to anon, authenticated using (registration_status = 'approved');

drop policy if exists "publico le fontes" on sources;
create policy "publico le fontes" on sources
  for select to anon, authenticated using (true);

drop policy if exists "publico le claims aprovados" on claims;
create policy "publico le claims aprovados" on claims
  for select to anon, authenticated using (status = 'approved');

drop policy if exists "publico le posicoes revisadas" on candidate_positions;
create policy "publico le posicoes revisadas" on candidate_positions
  for select to anon, authenticated using (is_published);

drop policy if exists "publico le acoes legislativas" on legislative_actions;
create policy "publico le acoes legislativas" on legislative_actions
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- AGREGADOS — números públicos, leitura livre
-- ---------------------------------------------------------------------
drop policy if exists "publico le participacao" on stats_by_state;
create policy "publico le participacao" on stats_by_state
  for select to anon, authenticated using (true);

drop policy if exists "publico le estatisticas" on question_stats;
create policy "publico le estatisticas" on question_stats
  for select to anon, authenticated using (true);

-- stats_watermark, question_revisions, submission_log:
-- RLS ligado e NENHUMA política = ninguém acessa pela API pública.
-- Só o servidor (service_role) enxerga.

-- ---------------------------------------------------------------------
-- SESSÕES — o ponto mais sensível do banco
--
-- Repare no que NÃO existe aqui: nenhuma política de SELECT para `anon`.
-- Um anônimo não lê sessão nenhuma pela API pública, nem a própria.
-- O resultado compartilhado é servido por uma rota do servidor que
-- devolve apenas o result_snapshot a partir do share_code.
--
-- E nenhuma política de INSERT: a gravação passa obrigatoriamente pela
-- rota /api/sessao, que valida os dados antes de escrever.
-- ---------------------------------------------------------------------
drop policy if exists "usuario le apenas as proprias sessoes" on quiz_sessions;
create policy "usuario le apenas as proprias sessoes" on quiz_sessions
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "usuario apaga as proprias sessoes" on quiz_sessions;
create policy "usuario apaga as proprias sessoes" on quiz_sessions
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- ARMADILHA IMPORTANTE: RLS NÃO É HERDADO PELAS PARTIÇÕES.
--
-- Habilitar RLS em quiz_sessions protege quem consulta a tabela-mãe.
-- Quem consultar `quiz_sessions_2026_08` diretamente — e a API REST
-- expõe cada partição como uma tabela — passa por cima da política e
-- lê as respostas políticas de todo mundo.
--
-- Este bloco fecha as partições existentes. A função
-- ensure_future_partitions() faz o mesmo com as que forem criadas depois.
-- ---------------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select c.relname
    from pg_class c
    join pg_inherits i on i.inhrelid = c.oid
    join pg_class parent on parent.oid = i.inhparent
    where parent.relname = 'quiz_sessions' and c.relkind = 'r'
  loop
    execute format('alter table %I enable row level security', p.relname);
    raise notice 'RLS habilitado na partição %', p.relname;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- CONFERÊNCIA — rode as duas consultas abaixo depois de aplicar tudo.
-- A primeira deve voltar VAZIA. A segunda lista quem lê o quê.
-- ---------------------------------------------------------------------
-- select tablename from pg_tables
--   where schemaname = 'public' and rowsecurity = false;
--
-- select tablename, policyname, cmd, roles
--   from pg_policies where schemaname = 'public' order by tablename;

-- =====================================================================
-- CONFERÊNCIA FINAL — as duas consultas abaixo precisam voltar VAZIAS.
-- Se alguma trouxer linhas, o banco está exposto. Me avise antes de seguir.
-- =====================================================================

-- 1. Tabelas sem Row Level Security
select tablename as tabela_sem_rls
  from pg_tables where schemaname = 'public' and rowsecurity = false;

-- 2. Partições sem RLS (RLS não é herdado — esta é a armadilha)
select c.relname as particao_sem_rls
  from pg_class c
  join pg_inherits i on i.inhrelid = c.oid
  join pg_class p on p.oid = i.inhparent
 where p.relname = 'quiz_sessions' and c.relkind = 'r' and c.relrowsecurity = false;
