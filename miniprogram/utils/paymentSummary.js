function toAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function formatAmount(value) {
  return toAmount(value).toFixed(2);
}

function normalizePaymentProgress(progress = {}) {
  const payments = (Array.isArray(progress.payments) ? progress.payments : [])
    .filter(Boolean)
    .map((payment) => ({
      ...payment,
      amount: toAmount(payment.amount),
      status: payment.status === 'paid' ? 'paid' : payment.status === 'cancelled' ? 'cancelled' : 'pending',
    }));
  const activePayments = payments.filter((payment) => payment.status !== 'cancelled');
  const totalAmount = activePayments.reduce((total, payment) => total + payment.amount, 0);
  const receivedAmount = activePayments
    .filter((payment) => payment.status === 'paid')
    .reduce((total, payment) => total + payment.amount, 0);

  return {
    ...progress,
    payments,
    totalAmount,
    receivedAmount,
    nextPayment: activePayments.find((payment) => payment.status === 'pending') || null,
  };
}

function getPaymentSummary(contract = {}) {
  const payments = Array.isArray(contract.payments) ? contract.payments : [];
  const paymentItems = Array.isArray(contract.paymentItems) ? contract.paymentItems : [];
  const configuredItemsAmount = payments
    .filter((payment) => payment && payment.status !== 'cancelled')
    .reduce((total, payment) => total + toAmount(payment.amount), 0);
  const paymentItemsAmount = paymentItems
    .reduce((total, item) => total + toAmount(item && item.amount), 0);
  const paymentMode = String(contract.paymentMode || '').toLowerCase();
  const paymentType = String(contract.paymentTypeResolved || contract.paymentType || '').toLowerCase();
  const isInstallment = paymentMode === 'installment' || ['deposit', 'deposit_balance', 'installment', 'custom'].includes(paymentType);
  const isOneTimePlan = paymentMode === 'one_time' || ['service_fee_only', 'service_fee_and_salary'].includes(paymentType);
  const configuredPlanAmount = isInstallment
    ? (configuredItemsAmount || toAmount(contract.paymentTotalAmount) || toAmount(contract.paymentConfigAmount))
    : (toAmount(contract.paymentTotalAmount) || toAmount(contract.paymentConfigAmount) || paymentItemsAmount || configuredItemsAmount);
  const fallbackExpectedAmount = Math.max(
    toAmount(contract.paymentTotalAmount),
    toAmount(contract.paymentConfigAmount),
    toAmount(contract.customerServiceFee),
    toAmount(contract.serviceFee),
    toAmount(contract.courseAmount),
    configuredItemsAmount,
  );
  const expectedAmount = (isInstallment || isOneTimePlan) && configuredPlanAmount > 0
    ? configuredPlanAmount
    : fallbackExpectedAmount;
  const paidItemsAmount = payments
    .filter((payment) => payment && payment.status === 'paid')
    .reduce((total, payment) => total + toAmount(payment.amount), 0);
  const receivedAmount = Math.max(
    toAmount(contract.paymentReceivedAmount),
    toAmount(contract.paymentAmountYuan),
    toAmount(contract.paymentAmountCents) / 100,
    toAmount(contract.paymentAmount) / 100,
    paidItemsAmount,
  );
  const rawStatus = contract.paymentStatus || 'unpaid';
  let status = rawStatus;

  // 兼容旧接口：只有收到的金额能证明未结清时，前端才覆盖错误的 paid 状态。
  if (rawStatus !== 'refunded' && expectedAmount > 0 && receivedAmount > 0 && receivedAmount < expectedAmount) {
    status = 'partial';
  }

  return {
    status,
    expectedAmount,
    receivedAmount,
    remainingAmount: Math.max(0, expectedAmount - receivedAmount),
    expectedText: formatAmount(expectedAmount),
    receivedText: formatAmount(receivedAmount),
    remainingText: formatAmount(Math.max(0, expectedAmount - receivedAmount)),
    hasPaymentInfo: expectedAmount > 0 || receivedAmount > 0,
  };
}

module.exports = { getPaymentSummary, normalizePaymentProgress };