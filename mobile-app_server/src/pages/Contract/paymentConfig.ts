import type { Contract, PaymentItem, PaymentItemType } from '../../types';

export type PaymentScenario = 'service_fee_only' | 'service_fee_and_salary' | 'deposit_balance' | 'custom';

const INSTALLMENT_TYPES: PaymentItemType[] = ['deposit', 'remaining', 'balance', 'final'];

const asNumber = (value: unknown): number => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
};

const isPaymentItemType = (value: unknown): value is PaymentItemType =>
  typeof value === 'string' &&
  ['deposit', 'service_fee', 'salary', 'remaining', 'balance', 'final', 'custom'].includes(value);

export const getSavedPaymentItems = (contract: Contract): PaymentItem[] => {
  const source: Array<Partial<PaymentItem>> = contract.payments?.length
    ? contract.payments
    : contract.paymentItems || [];

  return source.map((item, index) => ({
    sequenceNo: item.sequenceNo || index + 1,
    type: isPaymentItemType(item.type) ? item.type : 'remaining',
    label: item.label || `第${index + 1}笔`,
    amount: asNumber(item.amount),
    status: item.status === 'paid' || item.status === 'cancelled' ? item.status : 'pending',
  }));
};

export const getPaymentScenario = (contract: Contract, items = getSavedPaymentItems(contract)): PaymentScenario => {
  const types = items.map((item) => item.type);
  const isDepositBalance =
    items.length === 2 &&
    items[0]?.type === 'deposit' &&
    ['remaining', 'balance', 'final'].includes(items[1]?.type);

  if (contract.paymentType === 'installment') return 'custom';
  if (contract.paymentType === 'deposit') return 'deposit_balance';
  if (types.some((type) => INSTALLMENT_TYPES.includes(type))) return isDepositBalance ? 'deposit_balance' : 'custom';
  if (contract.paymentType === 'service_fee_and_salary' || (types.includes('service_fee') && types.includes('salary'))) {
    return 'service_fee_and_salary';
  }
  return contract.paymentMode === 'installment' ? 'custom' : 'service_fee_only';
};

export const buildPaymentConfiguration = (contract: Contract) => {
  const payments = getSavedPaymentItems(contract);
  const scenario = getPaymentScenario(contract, payments);
  const baseAmount = contract.orderCategory === 'training'
    ? asNumber(contract.courseAmount)
    : asNumber(contract.customerServiceFee);
  const configuredTotal = asNumber(contract.paymentTotalAmount) || asNumber(contract.paymentConfigAmount);

  if (payments.length) {
    const totalAmount = payments.reduce((sum, item) => sum + item.amount, 0);
    return { scenario, payments, totalAmount: totalAmount || configuredTotal };
  }

  if (scenario === 'service_fee_and_salary') {
    const totalAmount = configuredTotal || baseAmount + asNumber(contract.workerSalary);
    const salaryAmount = Math.min(asNumber(contract.workerSalary), totalAmount);
    return {
      scenario,
      payments: [
        { sequenceNo: 1, type: 'service_fee' as const, label: '服务费', amount: totalAmount - salaryAmount, status: 'pending' as const },
        { sequenceNo: 2, type: 'salary' as const, label: '阿姨首月工资', amount: salaryAmount, status: 'pending' as const },
      ],
      totalAmount,
    };
  }

  if (scenario === 'deposit_balance') {
    const totalAmount = configuredTotal || baseAmount;
    const deposit = asNumber(contract.deposit) || Math.round(totalAmount * 30) / 100;
    const balance = asNumber(contract.finalPayment) || totalAmount - deposit;
    return {
      scenario,
      payments: [
        { sequenceNo: 1, type: 'deposit' as const, label: '定金', amount: deposit, status: 'pending' as const },
        { sequenceNo: 2, type: 'remaining' as const, label: '尾款', amount: balance, status: 'pending' as const },
      ],
      totalAmount: deposit + balance,
    };
  }

  const totalAmount = configuredTotal || baseAmount;
  return {
    scenario,
    payments: [{
      sequenceNo: 1,
      type: scenario === 'custom' ? 'remaining' as const : 'service_fee' as const,
      label: scenario === 'custom' ? '第1笔' : '服务费',
      amount: totalAmount,
      status: 'pending' as const,
    }],
    totalAmount,
  };
};