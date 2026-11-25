/** Preview never upgrades evidence quality merely because a file is readable. */
export function importQualityReadiness(score: number, approved: boolean) {
  const quality = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  return { quality, rejected: quality < 50, requiresReview: quality >= 50 && quality < 75,
    ready: quality >= 75 || (quality >= 50 && approved) };
}