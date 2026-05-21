-- =====================================================================
-- Mneme — Postgres bootstrap. Auto-applied by the gateway on first boot
-- via initDb(). Documented here for operator visibility.
-- =====================================================================

create extension if not exists vector;

-- Control table: one row per Mneme project. The gateway creates a dedicated
-- schema (agent_<handle>) for each project, with 4 opinionated tables.
create table if not exists _mneme_projects (
  id            bigserial primary key,
  owner_wallet  text unique not null,
  handle        text unique not null,
  schema_name   text unique not null,
  created_at    timestamptz default now()
);
create index if not exists _mneme_projects_handle_idx on _mneme_projects (handle);
