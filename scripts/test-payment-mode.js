const assert = require('assert');
const { getPaymentMode, isInstallmentPayment } = require('../miniprogram/utils/paymentMode.js');

const serviceAndSalary = {
  paymentType: 'service_fee_and_salary',
  payments: [{ amount: 9000 }, { amount: 8000 }],
  paymentItems: [{ amount: 9000 }, { amount: 8000 }],
};

assert.strictEqual(getPaymentMode(serviceAndSalary), 'one_time');
assert.strictEqual(isInstallmentPayment(serviceAndSalary), false);
assert.strictEqual(isInstallmentPayment({ paymentType: 'deposit' }), true);
assert.strictEqual(isInstallmentPayment({ paymentType: 'installment' }), true);
assert.strictEqual(getPaymentMode({ paymentMode: 'one_time', paymentType: 'deposit' }), 'one_time');
assert.strictEqual(isInstallmentPayment({ payments: [{ type: 'service_fee' }, { type: 'salary' }] }), false);
assert.strictEqual(isInstallmentPayment({ payments: [{ type: 'deposit' }, { type: 'final' }] }), true);

console.log('payment mode checks passed');