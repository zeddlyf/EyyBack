const assert = require('assert');
const { clampHalfStars, average, distribution } = require('../services/ratings');

// Clamp tests
assert.strictEqual(clampHalfStars(0.2), 1);
assert.strictEqual(clampHalfStars(5.8), 5);
assert.strictEqual(clampHalfStars(3.74), 3.5);
assert.strictEqual(clampHalfStars(3.76), 4);

// Average tests
assert.strictEqual(average([5, 4.5, 4]).toFixed(2), '4.50');
assert.strictEqual(average([]), 0);

// Distribution tests
const dist = distribution([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5]);
assert.strictEqual(dist['5'], 2);
assert.strictEqual(dist['4.5'], 1);
assert.strictEqual(Object.values(dist).reduce((a,b)=>a+b,0), 10);

console.log('ratings.unit.js passed');