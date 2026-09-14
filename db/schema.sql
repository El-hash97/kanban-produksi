-- db/schema.sql
-- Run once against the Neon database backing the shared production board.
-- See docs/superpowers/specs/2026-09-14-neon-live-sync-design.md.

create table if not exists board_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

insert into board_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;
