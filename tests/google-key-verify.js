require('dotenv').config();
const assert = require('assert');

const key = process.env.GOOGLE_API_KEY;
assert(key && key.length > 10, 'GOOGLE_API_KEY missing or invalid length');

(async () => {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=Naga%20City&key=${key}`;
  const res = await fetch(url);
  assert.strictEqual(res.ok, true, `Google Geocode failed status: ${res.status}`);
  const json = await res.json();
  assert(Array.isArray(json.results), 'Invalid geocode response');
  console.log('Google API key verification passed');
})();