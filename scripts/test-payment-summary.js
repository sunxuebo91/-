const assert = require('assert');
const { getPaymentSummary, normalizePaymentProgress } = require('../miniprogram/utils/paymentSummary.js');

const partial = getPaymentSummary({
  paymentStatus: 'paid',
  customerServiceFee: 5000,
  paymentConfigAmount: 2.32,
  paymentAmount: 232,
});

assert.deepStrictEqual(partial, {
  status: 'partial',
  expectedAmount: 5000,
  receivedAmount: 2.32,
  remainingAmount: 4997.68,
  expectedText: '5000.00',
  receivedText: '2.32',
  remainingText: '4997.68',
  hasPaymentInfo: true,
});

const paid = getPaymentSummary({ paymentStatus: 'paid', paymentTotalAmount: 5000, paymentReceivedAmount: 5000 });
assert.strictEqual(paid.status, 'paid');
assert.strictEqual(paid.remainingText, '0.00');

const staged = getPaymentSummary({
  paymentStatus: 'partial',
  payments: [
    { label: '服务费', amount: 3000, status: 'paid' },
    { label: '阿姨首月工资', amount: 6000, status: 'pending' },
  ],
});
assert.strictEqual(staged.expectedText, '9000.00');
assert.strictEqual(staged.receivedText, '3000.00');
assert.strictEqual(staged.remainingText, '6000.00');

const customInstallment = getPaymentSummary({
  paymentMode: 'installment',
  customerServiceFee: 9000,
  paymentTotalAmount: 10,
  paymentConfigAmount: 10,
  payments: [
    { amount: 1, status: 'pending' },
    { amount: 2, status: 'pending' },
    { amount: 3, status: 'pending' },
    { amount: 4, status: 'pending' },
  ],
});
assert.strictEqual(customInstallment.expectedText, '10.00');

const normalizedProgress = normalizePaymentProgress({
  totalAmount: 6,
  receivedAmount: 0,
  payments: [
    { sequenceNo: 1, amount: 1, status: 'pending' },
    { sequenceNo: 2, amount: 2, status: 'pending' },
    { sequenceNo: 3, amount: 3, status: 'pending' },
    { sequenceNo: 4, amount: 4, status: 'pending' },
  ],
});
assert.strictEqual(normalizedProgress.totalAmount, 10);
assert.strictEqual(normalizedProgress.nextPayment.sequenceNo, 1);

console.log('payment summary checks passed');