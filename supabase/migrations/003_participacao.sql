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
