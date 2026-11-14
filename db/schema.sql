-- Run this once in the Neon SQL Editor (Neon console -> your project -> SQL Editor).
-- It is safe to run again: nothing is dropped and existing rows are kept.

-- Lets the overlap rule below compare title ids inside a range index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS titles (
  id           serial PRIMARY KEY,
  name         text NOT NULL UNIQUE,      -- must match the names in src/lib/titles.js
  holder       text,                      -- set by an admin (assign / permanent)
  held_since   timestamptz,
  expires      timestamptz,               -- null = no end time
  is_permanent boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS reservations (
  id          serial PRIMARY KEY,
  title_id    integer NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  username    text NOT NULL CHECK (length(username) BETWEEN 1 AND 40),
  start_time  timestamptz NOT NULL,
  end_time    timestamptz NOT NULL,
  coordinates text NOT NULL DEFAULT '',
  notes       text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  -- Two requests for the same title can never overlap, even if submitted at the same instant.
  -- Ranges are [start, end), so back-to-back slots (10:00-11:00 then 11:00-12:00) are allowed.
  CONSTRAINT reservations_no_overlap
    EXCLUDE USING gist (title_id WITH =, tstzrange(start_time, end_time) WITH &&)
);
CREATE INDEX IF NOT EXISTS reservations_end_time_idx ON reservations (end_time);

-- Discord bot: which post belongs to each request, and whether its 5-minute reminder has gone out.
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS discord_message_id text;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reminded_at timestamptz;

-- Used to rate-limit request submissions and admin login attempts per IP.
CREATE TABLE IF NOT EXISTS rate_limits (
  key text NOT NULL,
  at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_limits_key_at_idx ON rate_limits (key, at);

-- Starting titles. Guardian of Harmony is held permanently by Siu Mai; the rest are free.
INSERT INTO titles (name, holder, held_since, is_permanent) VALUES
  ('Guardian of Harmony', 'Siu Mai', now(), true),
  ('Guardian of Water',   NULL, NULL, false),
  ('Guardian of Earth',   NULL, NULL, false),
  ('Guardian of Air',     NULL, NULL, false),
  ('Guardian of Fire',    NULL, NULL, false),
  ('Governor',            NULL, NULL, false),
  ('Architect',           NULL, NULL, false),
  ('Prefect',             NULL, NULL, false),
  ('General',             NULL, NULL, false)
ON CONFLICT (name) DO NOTHING;
