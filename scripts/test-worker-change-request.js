const assert = require('assert');
const fs = require('fs');
const path = require('path');

let pageDefinition;
global.Page = (definition) => { pageDefinition = definition; };
require(path.join(__dirname, '../miniprogram/pages/myOrders/detail.js'));

assert.ok(pageDefinition, 'contract detail page should register itself');
assert.deepStrictEqual(
  pageDefinition._buildFloatingAction({ onboardConfirmed: true, workerChangeNotified: false }),
  { type: 'request-worker-change', kind: 'done', label: '申请换人' },
);
assert.deepStrictEqual(
  pageDefinition._buildFloatingAction({ onboardConfirmed: true, workerChangeNotified: true }),
  { type: 'worker-change-notified', kind: 'done', label: '✓ 已通知顾问' },
);

const cloudFunction = fs.readFileSync(
  path.join(__dirname, '../cloudfunctions/contractService/index.js'),
  'utf8',
);
assert.ok(cloudFunction.includes("case 'requestWorkerChange'"));
assert.ok(cloudFunction.includes('/request-worker-change'));

console.log('worker-change request checks passed');