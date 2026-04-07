-- ============================================================================
-- Populate expense_ratio for all 22 funds in the TerrAscend 401(k) menu
--
-- These are net expense ratios as decimals (e.g., 0.0015 = 0.15%).
-- Source: Morningstar, fund provider websites (April 2026).
--
-- Run in Supabase SQL Editor.
-- ============================================================================

-- Index funds (lowest cost)
UPDATE funds SET expense_ratio = 0.0002 WHERE ticker = 'FXAIX';   -- Fidelity 500 Index Fund (0.015%)
UPDATE funds SET expense_ratio = 0.0004 WHERE ticker = 'FSPGX';   -- Fidelity Large Cap Growth Index Fund
UPDATE funds SET expense_ratio = 0.0008 WHERE ticker = 'VFWAX';   -- Vanguard FTSE All-World ex-US Index Fund Admiral

-- Bond / Fixed income
UPDATE funds SET expense_ratio = 0.0037 WHERE ticker = 'MWTSX';   -- MetWest Total Return Bond Fund Plan Class
UPDATE funds SET expense_ratio = 0.0068 WHERE ticker = 'CFSTX';   -- Commerce Short Term Government Fund
UPDATE funds SET expense_ratio = 0.0065 WHERE ticker = 'BGHIX';   -- BlackRock High Yield Bond Fund Class I
UPDATE funds SET expense_ratio = 0.0104 WHERE ticker = 'BPLBX';   -- BlackRock Inflation Protected Bond Fund K
UPDATE funds SET expense_ratio = 0.0066 WHERE ticker = 'OIBIX';   -- Invesco International Bond Fund R6
UPDATE funds SET expense_ratio = 0.0070 WHERE ticker = 'WFPRX';   -- Western Asset Core Plus Bond Fund R6

-- Domestic equity (active)
UPDATE funds SET expense_ratio = 0.0018 WHERE ticker = 'VADFX';   -- Victory Adaptive Allocation Fund
UPDATE funds SET expense_ratio = 0.0066 WHERE ticker = 'HRAUX';   -- Harbor Small Cap Growth Fund
UPDATE funds SET expense_ratio = 0.0080 WHERE ticker = 'WEGRX';   -- Westwood SmidCap Earnings Growth Fund R6
UPDATE funds SET expense_ratio = 0.0102 WHERE ticker = 'RTRIX';   -- Neuberger Berman Real Estate Fund
UPDATE funds SET expense_ratio = 0.0077 WHERE ticker = 'TGEPX';   -- Thornburg Growth Equity Fund

-- International equity
UPDATE funds SET expense_ratio = 0.0037 WHERE ticker = 'VWIGX';   -- Vanguard International Growth Fund
UPDATE funds SET expense_ratio = 0.0057 WHERE ticker = 'RNWGX';   -- American Funds New World Fund R-6
UPDATE funds SET expense_ratio = 0.0094 WHERE ticker = 'QFVRX';   -- Pear Tree Polaris Foreign Value Fund R6
UPDATE funds SET expense_ratio = 0.0087 WHERE ticker = 'DRRYX';   -- Dodge & Cox International Stock Fund
UPDATE funds SET expense_ratio = 0.0090 WHERE ticker = 'MADFX';   -- Matrix Advisors Dividend Fund

-- Multi-asset / Specialty
UPDATE funds SET expense_ratio = 0.0081 WHERE ticker = 'PRPFX';   -- Permanent Portfolio Fund

-- Money market
UPDATE funds SET expense_ratio = 0.0037 WHERE ticker = 'FDRXX';   -- Fidelity Government Money Market Fund
UPDATE funds SET expense_ratio = 0.0052 WHERE ticker = 'ADAXX';   -- Invesco Government Money Market Fund

-- Verify
SELECT ticker, name, expense_ratio FROM funds WHERE is_active = true ORDER BY expense_ratio ASC;
