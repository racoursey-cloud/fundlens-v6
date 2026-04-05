-- FundLens v6 — Seed the funds table with TerrAscend 401(k) plan funds
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

INSERT INTO funds (ticker, name, is_active) VALUES
  ('PRPFX',  'Permanent Portfolio Fund', true),
  ('WFPRX',  'Western Asset Core Plus Bond Fund', true),
  ('VFWAX',  'Vanguard FTSE All-World ex-US Index Fund', true),
  ('QFVRX',  'Quantified STF Fund', true),
  ('MADFX',  'BlackRock Advantage International Fund', true),
  ('VADFX',  'Victory Adaptive Allocation Fund', true),
  ('RNWGX',  'American Funds New World Fund', true),
  ('OIBIX',  'Invesco International Bond Fund', true),
  ('RTRIX',  'Neuberger Berman Real Estate Fund', true),
  ('DRRYX',  'Driehaus Small/Mid Cap Growth Fund', true),
  ('VWIGX',  'Vanguard International Growth Fund', true),
  ('TGEPX',  'Thornburg Growth Equity Fund', true),
  ('BPLBX',  'BrandywineGLOBAL High Yield Fund', true),
  ('CFSTX',  'Cornerstone Total Return Fund', true),
  ('MWTSX',  'MetWest Total Return Bond Fund', true),
  ('FXAIX',  'Fidelity 500 Index Fund', true),
  ('FDRXX',  'Fidelity Government Money Market Fund', true),
  ('ADAXX',  'Adaptive Money Market Fund', true),
  ('WEGRX',  'Westwood SmidCap Earnings Growth Fund', true),
  ('BGHIX',  'BlackRock High Yield Bond Fund', true),
  ('HRAUX',  'Harbor Small Cap Growth Fund', true),
  ('FSPGX',  'Fidelity Large Cap Growth Index Fund', true)
ON CONFLICT (ticker) DO UPDATE SET
  is_active = true,
  updated_at = now();
