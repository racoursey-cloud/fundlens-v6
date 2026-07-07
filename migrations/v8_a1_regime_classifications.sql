-- ============================================================================
-- FundLens v8 — A1 Task 3: regime_classifications — the regime-of-record home
--
-- Stays EMPTY until the race (charter §6 item 2) writes 'replay' rows and a
-- shipped winner writes 'record' rows — charter §2.5 law gets its home
-- before anyone needs it (A1 Task 3).
--
-- basis vocabulary:
--   record        — the regime-of-record: computed from data as published on
--                   the classification date, stored immutably (§2.5)
--   replay        — race/backtest output through the as-of interface
--   revised_study — recomputation on revised data, labeled as such (§2.5)
--
-- regime_label is plain text — the taxonomy belongs to Stage 2; no enum yet.
--
-- Ruling D2 (RATIFIED July 6, 2026): a trigger mechanically blocks UPDATE
-- and DELETE on basis='record' rows. "Stored immutably" is law, and law
-- deserves enforcement, not convention.
--
-- APPLY ORDER: 4th of 4 (no dependencies on the other new tables).
-- Run in the Supabase SQL Editor BEFORE merging the A1 code PR
-- (charter §3 migrations-before-merges; A0 precedent).
-- ============================================================================

CREATE TABLE IF NOT EXISTS regime_classifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classification_date DATE NOT NULL,
  regime_label        TEXT NOT NULL,
  basis               TEXT NOT NULL CHECK (basis IN ('record', 'replay', 'revised_study')),
  -- Contender or winner name (race vocabulary: A, B, C, D, or the shipped engine)
  engine              TEXT NOT NULL,
  -- Spec version or hash of the frozen rules that produced this row
  rules_version       TEXT NOT NULL,
  -- The as-published input values used — the row carries its own evidence
  inputs              JSONB NOT NULL,
  computed_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_regime_class_unique
  ON regime_classifications (classification_date, basis, engine, rules_version);

COMMENT ON TABLE regime_classifications IS
  'Regime-of-record + replay/study classifications; record rows are mechanically immutable per ruling D2 (A1 Task 3; charter §2.5, §4.2·4)';
COMMENT ON COLUMN regime_classifications.basis IS
  'record = immutable regime-of-record; replay = race/backtest via the as-of interface; revised_study = labeled recomputation on revised data (charter §2.5)';
COMMENT ON COLUMN regime_classifications.inputs IS
  'The as-published values the rules consumed — every classification carries its own audit evidence (charter §2.5)';

ALTER TABLE regime_classifications ENABLE ROW LEVEL SECURITY;

-- ── Ruling D2: mechanical immutability for basis='record' rows ──────────────
CREATE OR REPLACE FUNCTION regime_record_rows_are_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'regime_classifications rows with basis=''record'' are immutable — the app never relabels its own history (charter §2.5; A1 ruling D2)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER regime_record_immutability
  BEFORE UPDATE OR DELETE ON regime_classifications
  FOR EACH ROW
  WHEN (OLD.basis = 'record')
  EXECUTE FUNCTION regime_record_rows_are_immutable();
