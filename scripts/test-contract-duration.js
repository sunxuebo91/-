const assert = require('assert');
const { getContractDuration } = require('../miniprogram/utils/contractDuration.js');

assert.strictEqual(getContractDuration('2026-07-17', '2026-07-24'), '7天');
assert.strictEqual(getContractDuration('2026-07-30', '2026-08-02'), '3天');
assert.strictEqual(getContractDuration('2026-07-17T08:00:00.000Z', '2026-07-24T08:00:00.000Z'), '7天');
assert.strictEqual(getContractDuration('', '2026-07-24'), '');
assert.strictEqual(getContractDuration('2026-07-24', '2026-07-17'), '');

console.log('contract duration checks passed');