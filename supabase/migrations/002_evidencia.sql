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
