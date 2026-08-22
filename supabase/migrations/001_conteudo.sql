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
