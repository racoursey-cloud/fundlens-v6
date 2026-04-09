/**
 * FundLens v6 — HHI Concentration Index (§6.6)
 *
 * Herfindahl-Hirschman Index of sector exposure.
 * Informational only — not used in scoring or allocation.
 *
 * Session 15: Created for FundDetail sidebar display.
 */

/**
 * Compute the Herfindahl-Hirschman Index from sector weights.
 *
 * @param sectorWeights - Map or record of sector names to weight fractions (0–1, should sum to ~1.0)
 * @returns HHI value (0–1 scale) or null if no sector data
 */
export function computeHHI(sectorWeights: Record<string, number> | undefined): number | null {
  if (!sectorWeights) return null;

  const weights = Object.values(sectorWeights);
  if (weights.length === 0) return null;

  // Normalize weights to sum to 1.0 (in case they don't exactly)
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return null;

  const normalized = weights.map(w => w / total);
  const hhi = normalized.reduce((sum, w) => sum + w * w, 0);

  return hhi;
}

/**
 * Get a plain-language concentration label from HHI value.
 *
 * @param hhi - HHI on 0–1 scale
 * @returns Label and color for display
 */
export function hhiLabel(hhi: number): { label: string; color: string } {
  // Convert to DOJ-style 0–10,000 scale for threshold comparison
  const hhi10k = hhi * 10_000;

  if (hhi10k > 2500) return { label: 'Highly Concentrated', color: '#EF4444' };
  if (hhi10k > 1500) return { label: 'Moderately Concentrated', color: '#F59E0B' };
  return { label: 'Diversified', color: '#10B981' };
}
