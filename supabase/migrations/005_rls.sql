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
