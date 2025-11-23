function clampHalfStars(value) {
  let v = Math.max(1, Math.min(5, Number(value)));
  return Math.round(v * 2) / 2;
}

function average(ratings) {
  const vals = ratings.map(clampHalfStars);
  const sum = vals.reduce((a, b) => a + b, 0);
  return vals.length ? sum / vals.length : 0;
}

function distribution(ratings) {
  const buckets = { 1: 0, 1.5: 0, 2: 0, 2.5: 0, 3: 0, 3.5: 0, 4: 0, 4.5: 0, 5: 0 };
  for (const r of ratings) {
    const v = clampHalfStars(r);
    buckets[v] = (buckets[v] || 0) + 1;
  }
  return buckets;
}

module.exports = { clampHalfStars, average, distribution };