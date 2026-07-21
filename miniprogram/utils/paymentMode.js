const INSTALLMENT_TYPES = new Set([
  'deposit',
  'deposit_balance',
  'installment',
  'custom',
  'course_deposit_tail',
  'course_split',
]);

const ONE_TIME_TYPES = new Set([
  'service_fee_only',
  'service_fee_and_salary',
  'service_fee_first_month_salary',
  'full_service_salary',
  'course_full',
]);

const INSTALLMENT_ITEM_TYPES = new Set([
  'deposit',
  'remaining',
  'balance',
  'final',
  'deposit_balance',
]);

function getPaymentMode(contract = {}) {
  const mode = String(contract.paymentMode || '').toLowerCase();
  if (mode === 'one_time' || mode === 'installment') return mode;

  const type = String(contract.paymentTypeResolved || contract.paymentType || '').toLowerCase();
  if (ONE_TIME_TYPES.has(type)) return 'one_time';
  if (INSTALLMENT_TYPES.has(type)) return 'installment';

  // 仅兼容完全缺失模式/类型的旧数据；绝不能以数组长度推断支付次数。
  const payments = Array.isArray(contract.payments) ? contract.payments : [];
  return payments.some((item) => INSTALLMENT_ITEM_TYPES.has(String(item && item.type || '').toLowerCase()))
    ? 'installment'
    : 'one_time';
}

function isInstallmentPayment(contract = {}) {
  return getPaymentMode(contract) === 'installment';
}

module.exports = { getPaymentMode, isInstallmentPayment };