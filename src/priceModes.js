const PRICE_TIER_COUNTS = {
  nonWenZong: [1, 2, 3, 4, 5, 6],
  nonWenZongNoSingle: [2, 3, 4, 5, 6],
  nonWenZongNoSix: [1, 2, 3, 4, 5],
  nonWenZongNoSingleNoSix: [2, 3, 4, 5],
};

export function getPriceTierCounts(mode) {
  return [...(PRICE_TIER_COUNTS[mode] || PRICE_TIER_COUNTS.nonWenZong)];
}
