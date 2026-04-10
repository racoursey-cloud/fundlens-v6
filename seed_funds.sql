-- FundLens v6 — Seed the funds table with TerrAscend 401(k) plan funds
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

INSERT INTO funds (ticker, name, is_active) VALUES
  ('PRPFX',  'Permanent Portfolio Fund', true),
  ('WFPRX',  'Allspring Special Mid Cap Value Fund', true),
  ('VFWAX',  'Vanguard FTSE All-World ex-US Index Fund', true),
  ('QFVRX',  'Pear Tree Polaris Foreign Value Fund', true),
  ('MADFX',  'Matrix Advisors Dividend Fund', true),
  ('VADFX',  'Invesco Equally-Weighted S&P 500 Fund', true),
  ('RNWGX',  'American Funds New World Fund', true),
  ('OIBIX',  'Invesco International Bond Fund', true),
  ('RTRIX',  'Royce Small-Cap Total Return Fund', true),
  ('DRRYX',  'BNY Mellon Global Real Return Fund', true),
  ('VWIGX',  'Vanguard International Growth Fund', true),
  ('TGEPX',  'TCW Emerging Markets Income Fund', true),
  ('BPLBX',  'BlackRock Inflation Protected Bond Fund', true),
  ('CFSTX',  'Commerce Short Term Government Fund', true),
  ('MWTSX',  'MetWest Total Return Bond Fund', true),
  ('FXAIX',  'Fidelity 500 Index Fund', true),
  ('FDRXX',  'Fidelity Government Money Market Fund', true),
  ('ADAXX',  'Adaptive Money Market Fund', true),
  ('WEGRX',  'Allspring Emerging Growth Fund', true),
  ('BGHIX',  'BrandywineGLOBAL High Yield Fund', true),
  ('HRAUX',  'Carillon Eagle Mid Cap Growth Fund', true),
  ('FSPGX',  'Fidelity Large Cap Growth Index Fund', true)
ON CONFLICT (ticker) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  updated_at = now();
