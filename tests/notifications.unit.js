const assert = require('assert');
const Notification = require('../models/Notification');

const userId = '6567f0b4f5f1c2a1b1a1a1a1';

const sample = new Notification({ user: userId, type: 'system', title: 'Test', body: 'Body', data: {} });
assert.strictEqual(sample.read, false);
assert.strictEqual(sample.type, 'system');
console.log('notifications.unit.js passed');