/**
 * H1 / H1-F1 standalone guards proof (f3 delivery per the H1-F1 addendum).
 *
 * Proves, against the real exported functions: the h3 display guard (with
 * the f1 ≥6 currency-tail amendment), the h6 profile name-agreement rule
 * (with the fold cure), and the f2 cache-staleness verdict (with the f4
 * CINS country fallback). Run from the repo root:
 *
 *   npx tsx scripts/h1-guards-proof.ts
 *
 * Exits 0 on ALL PASS, 1 otherwise. Outside tsconfig's src include — never
 * part of the server build.
 */

import { isDisplayableTicker, cachedResolutionIsStale } from '../src/engine/cusip.js';
import { profileMatchesHoldingName } from '../src/engine/fmp.js';

let fail = 0;
const t = (desc: string, got: boolean, want: boolean) => {
  if (got !== want) fail++;
  console.log(`${got === want ? 'PASS' : 'FAIL'}  ${desc} → ${got} (want ${want})`);
};

console.log('— H1 h3: display guard —');
t('TVSLIN 6 09/01/26 (whitespace bond-ID)', isDisplayableTicker('TVSLIN 6 09/01/26', null), false);
t('JPM V1.04 02/04/27 (whitespace bond-ID)', isDisplayableTicker('JPM V1.04 02/04/27', null), false);
t('DGE.PA for GB', isDisplayableTicker('DGE.PA', 'GB'), false);
t('BAY.WA for DE', isDisplayableTicker('BAY.WA', 'DE'), false);
t('BMW.SW for DE', isDisplayableTicker('BMW.SW', 'DE'), false);
t('REN.AS for GB', isDisplayableTicker('REN.AS', 'GB'), false);
t('AAPL', isDisplayableTicker('AAPL', 'US'), true);
t('BRK.B (class share, US)', isDisplayableTicker('BRK.B', 'US'), true);
t('ASMLF (no suffix)', isDisplayableTicker('ASMLF', 'NL'), true);
t('TCEHY', isDisplayableTicker('TCEHY', 'KY'), true);
t('BASA.DE for DE (matching venue survives h3)', isDisplayableTicker('BASA.DE', 'DE'), true);
t('7203.T for JP (home line kept)', isDisplayableTicker('7203.T', 'JP'), true);
t('unknown country, suffix passes', isDisplayableTicker('DGE.PA', null), true);

console.log('\n— H1-F1 f1: currency tail at ≥6 —');
t('CICHF (China Construction Bank, 5 chars) passes', isDisplayableTicker('CICHF', null), true);
t('OVCHF passes', isDisplayableTicker('OVCHF', null), true);
t('UNCHF passes', isDisplayableTicker('UNCHF', null), true);
t('WTCHF passes', isDisplayableTicker('WTCHF', null), true);
t('TITUSD (6) rejects', isDisplayableTicker('TITUSD', null), false);
t('SQNEUR (6) rejects', isDisplayableTicker('SQNEUR', null), false);
t('TRI4EUR (7) rejects', isDisplayableTicker('TRI4EUR', null), false);
t('HONGBP (6) rejects', isDisplayableTicker('HONGBP', null), false);
t('CCL1EUR (7) rejects', isDisplayableTicker('CCL1EUR', null), false);
t('APLSUSD (7) rejects', isDisplayableTicker('APLSUSD', null), false);
t('PLZLUSD (7) rejects', isDisplayableTicker('PLZLUSD', null), false);

console.log('\n— H1 h6: profile name agreement —');
t('Fubon vs Fujitsu Limited', profileMatchesHoldingName('Fubon Financial Holding Co Ltd', 'Fujitsu Limited'), false);
t('TCC Group vs Taseko Mines', profileMatchesHoldingName('TCC Group Holdings Co Ltd', 'Taseko Mines Limited'), false);
t('Toyota vs Toyota Motor Corporation', profileMatchesHoldingName('Toyota Motor Corp', 'Toyota Motor Corporation'), true);
t('ASML vs ASML Holding N.V.', profileMatchesHoldingName('ASML Holding NV', 'ASML Holding N.V.'), true);
t('Nestle vs Nestlé S.A. (diacritics)', profileMatchesHoldingName('Nestle SA', 'Nestlé S.A.'), true);
t('Fujitsu vs Fujitsu Limited (prefix)', profileMatchesHoldingName('Fujitsu', 'Fujitsu Limited'), true);
t('null companyName fails open', profileMatchesHoldingName('Anything', null), true);

console.log('\n— H1 in-slice: non-decomposing folds —');
t('Ørsted vs Orsted A/S', profileMatchesHoldingName('Ørsted', 'Orsted A/S'), true);
t('Møller-Mærsk vs Moller - Maersk', profileMatchesHoldingName('A.P. Møller - Mærsk A/S', 'A.P. Moller - Maersk A/S'), true);
t('ß fold', profileMatchesHoldingName('Thyssenkrupp Straße AG', 'Thyssenkrupp Strasse AG'), true);
t('ł fold', profileMatchesHoldingName('Zakłady Orlen', 'Zaklady Orlen'), true);
t('đ fold', profileMatchesHoldingName('Đukanović Holdings', 'Dukanovic Holdings'), true);
t('folds do not create false matches', profileMatchesHoldingName('Ørsted', 'Taseko Mines Limited'), false);

console.log('\n— H1-F1 f2: cache staleness verdicts —');
t('ASMH row (name ASML Holding NV ADRhedged) → stale', cachedResolutionIsStale({ cusip: 'N07059202', ticker: 'ASMH', name: 'ASML Holding NV ADRhedged', resolved: true }), true);
t('Vanguard Market Liquidity Fund row → NOT stale', cachedResolutionIsStale({ cusip: '921935300', ticker: 'VMFXX', name: 'Vanguard Market Liquidity Fund', resolved: true }), false);
t('TRI4EUR cached ticker → stale', cachedResolutionIsStale({ cusip: 'ISIN:CA8849037095', ticker: 'TRI4EUR', name: 'Thomson Reuters Corp', resolved: true }), true);
t('TVS bond string cached → stale', cachedResolutionIsStale({ cusip: 'ISIN:IN0TVS000000', ticker: 'TVSLIN 6 09/01/26', name: 'TVS Motor Co', resolved: true }), true);
t('CICHF cached row → NOT stale', cachedResolutionIsStale({ cusip: 'ISIN:HK0000000000', ticker: 'CICHF', name: 'China Construction Bank', resolved: true }), false);
t('negative row never stale here', cachedResolutionIsStale({ cusip: 'X', ticker: null, name: 'Whatever ETP', resolved: false }), false);
t('ETN word-boundary marker → stale', cachedResolutionIsStale({ cusip: 'Y', ticker: 'ABCD', name: 'Some Issuer ETN 2x', resolved: true }), true);
t('ETF plain name NOT a marker', cachedResolutionIsStale({ cusip: 'Z', ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', resolved: true }), false);

console.log('\n— H1-F1 f4: CINS country fallback (the four escaped rows) —');
t('DGE.PA keyed G42089113 (G→GB) → stale', cachedResolutionIsStale({ cusip: 'G42089113', ticker: 'DGE.PA', name: 'Diageo plc', resolved: true }), true);
t('BAY.WA keyed D0712D163 (D→DE) → stale', cachedResolutionIsStale({ cusip: 'D0712D163', ticker: 'BAY.WA', name: 'Bayer AG', resolved: true }), true);
t('BMW.SW keyed D12096109 (D→DE) → stale', cachedResolutionIsStale({ cusip: 'D12096109', ticker: 'BMW.SW', name: 'Bayerische Motoren Werke AG', resolved: true }), true);
t('REN.AS keyed G7493L105 (G→GB) → stale', cachedResolutionIsStale({ cusip: 'G7493L105', ticker: 'REN.AS', name: 'RELX plc', resolved: true }), true);
t('regional letter (Y Asia) gives no country — home line NOT judged', cachedResolutionIsStale({ cusip: 'Y0606D102', ticker: '2330.TW', name: 'Taiwan Semiconductor', resolved: true }), false);
t('digit-lead domestic CUSIP gives no country', cachedResolutionIsStale({ cusip: '037833100', ticker: 'AAPL.PA', name: 'Apple Inc', resolved: true }), false);

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
