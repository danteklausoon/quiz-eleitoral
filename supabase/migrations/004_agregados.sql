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
