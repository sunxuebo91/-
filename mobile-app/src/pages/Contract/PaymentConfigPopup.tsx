import { useState, useEffect } from 'react';
import { Popup, Form, Radio, Input, Button, Space, Toast } from 'antd-mobile';
import { AddCircleOutline, DeleteOutline } from 'antd-mobile-icons';
import { contractService } from '../../services/contractService';
import type { Contract, PaymentItem } from '../../types';
import { buildPaymentConfiguration, type PaymentScenario } from './paymentConfig';

export function PaymentConfigPopup({
  visible,
  contract,
  onClose,
  onSuccess,
  onSaveAndCollect,
}: {
  visible: boolean;
  contract: Contract;
  onClose: () => void;
  onSuccess: () => void;
  onSaveAndCollect?: () => void;
}) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [scenario, setScenario] = useState<PaymentScenario>('service_fee_only');
  const [localPayments, setLocalPayments] = useState<PaymentItem[]>([]);

  const isTrainingOrder = contract.orderCategory === 'training';
  const baseAmount = isTrainingOrder ? (contract.courseAmount || 0) : (contract.customerServiceFee || 0);

  useEffect(() => {
    if (visible && contract) {
      const configuration = buildPaymentConfiguration(contract);
      form.setFieldsValue({
        paymentScenario: configuration.scenario,
        paymentConfigAmount: configuration.totalAmount,
      });
      setScenario(configuration.scenario);
      setLocalPayments(configuration.payments);
    }
  }, [visible, contract, form]);

  const updatePayments = (payments: PaymentItem[]) => {
    setLocalPayments(payments);
    form.setFieldsValue({
      paymentConfigAmount: payments.reduce((sum, item) => sum + item.amount, 0),
    });
  };

  const handleScenarioChange = (val: PaymentScenario) => {
    setScenario(val);
    const salary = contract.workerSalary || 0;
    let payments: PaymentItem[];

    if (val === 'service_fee_only') {
      payments = [{ sequenceNo: 1, type: 'service_fee', label: '服务费', amount: baseAmount, status: 'pending' }];
    } else if (val === 'service_fee_and_salary') {
      payments = [
        { sequenceNo: 1, type: 'service_fee', label: '服务费', amount: baseAmount, status: 'pending' },
        { sequenceNo: 2, type: 'salary', label: '阿姨首月工资', amount: salary, status: 'pending' },
      ];
    } else if (val === 'deposit_balance') {
      const totalCents = Math.round(baseAmount * 100);
      const depositCents = Math.round(totalCents * 0.3);
      const balanceCents = totalCents - depositCents;
      payments = [
        { sequenceNo: 1, type: 'deposit', label: '定金', amount: depositCents / 100, status: 'pending' },
        { sequenceNo: 2, type: 'remaining', label: '尾款', amount: balanceCents / 100, status: 'pending' },
      ];
    } else {
      payments = [{ sequenceNo: 1, type: 'remaining', label: '第1笔', amount: 0, status: 'pending' }];
    }
    updatePayments(payments);
  };

  const onSubmit = async (goToCollect: boolean = false) => {
    try {
      const values = await form.validateFields();
      const { paymentScenario } = values as { paymentScenario: PaymentScenario };

      setSubmitting(true);

      if (localPayments.length === 0) {
        Toast.show('请至少添加一笔收款');
        return;
      }
      if (localPayments.some((item) => item.amount <= 0)) {
        Toast.show('每笔金额必须大于 0');
        return;
      }
      if (localPayments.some((item) => !item.label.trim())) {
        Toast.show('请填写所有分笔的名称');
        return;
      }

      const finalPayments = localPayments.map((item, index) => ({ ...item, sequenceNo: index + 1 }));
      const totalAmount = finalPayments.reduce((sum, item) => sum + item.amount, 0);
      let paymentType: NonNullable<Contract['paymentType']> = 'service_fee_only';
      let paymentMode: NonNullable<Contract['paymentMode']> = 'one_time';

      if (paymentScenario === 'service_fee_and_salary') {
        paymentType = 'service_fee_and_salary';
      } else if (paymentScenario === 'deposit_balance') {
        paymentType = 'deposit';
        paymentMode = 'installment';
      } else if (paymentScenario === 'custom') {
        paymentType = 'installment';
        paymentMode = 'installment';
      } else {
        paymentType = 'service_fee_only';
        paymentMode = 'one_time';
      }

      const paymentItems = finalPayments.map((item) => ({
        label: item.label,
        amount: item.amount,
        type: item.type,
      }));

      await contractService.updateContract(contract._id, {
        paymentEnabled: true,
        paymentType,
        paymentMode,
        paymentConfigAmount: totalAmount,
        paymentVersion: 'v2',  // 统一使用 v2
        payments: finalPayments,
        paymentItems,
        paymentTotalAmount: totalAmount,
      });

      Toast.show({ icon: 'success', content: '收款配置已保存' });
      if (goToCollect && onSaveAndCollect) {
        onSaveAndCollect();
      } else {
        onSuccess();
      }
    } catch (error: unknown) {
      Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : '操作失败' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popup
      visible={visible}
      onMaskClick={onClose}
      bodyStyle={{ height: '70vh', padding: '16px', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
        {contract?.paymentEnabled ? '修改收款方案' : '开启收款'}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Form form={form} layout="vertical" footer={null}>
          <Form.Item name="paymentScenario" label="收款方式" rules={[{ required: true }]}>
            <Radio.Group onChange={(val) => handleScenarioChange(val as PaymentScenario)}>
              <Space direction="vertical" style={{ width: '100%' }}>
                {isTrainingOrder ? (
                  <>
                    <Radio value="service_fee_only">
                      全款（¥{baseAmount}）
                    </Radio>
                    <Radio value="deposit_balance">
                      定金 + 尾款（系统自动按 30%/70% 拆分）
                    </Radio>
                    <Radio value="custom">
                      自定义分笔（手动添加每一笔的金额）
                    </Radio>
                  </>
                ) : (
                  <>
                    <Radio value="service_fee_only">
                      全款服务费（¥{baseAmount}）
                    </Radio>
                    <Radio value="service_fee_and_salary">
                      服务费+首月工资（¥{baseAmount + (contract?.workerSalary || 0)}）
                    </Radio>
                    <Radio value="deposit_balance">
                      定金 + 尾款（系统自动按 30%/70% 拆分）
                    </Radio>
                    <Radio value="custom">
                      自定义分笔（手动添加每一笔的金额）
                    </Radio>
                  </>
                )}
              </Space>
            </Radio.Group>
          </Form.Item>

          <Form.Item name="paymentConfigAmount" label="收款金额（元）">
            <Input readOnly type="number" />
          </Form.Item>

          <div style={{ padding: '0 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
              <span style={{ color: '#666' }}>费用明细</span>
              <span style={{ color: '#ff8f1f' }}>
                合计: ¥ {localPayments.reduce((sum, item) => sum + item.amount, 0)}
              </span>
            </div>
            <div style={{ background: '#f5f7fa', borderRadius: 8, padding: 12 }}>
              {localPayments.map((payment, index) => (
                <div key={payment.sequenceNo} style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <Input
                      placeholder="名称"
                      value={payment.label}
                      onChange={(label) => updatePayments(localPayments.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, label } : item
                      )))}
                      style={{ '--font-size': '14px', background: '#fff', padding: '4px 8px', borderRadius: 4 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <Input
                      type="number"
                      placeholder="金额(元)"
                      value={payment.amount.toString()}
                      onChange={(value) => updatePayments(localPayments.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, amount: Number(value) || 0 } : item
                      )))}
                      style={{ '--font-size': '14px', background: '#fff', padding: '4px 8px', borderRadius: 4 }}
                    />
                  </div>
                  {scenario === 'custom' && payment.status === 'pending' && localPayments.length > 1 && (
                    <div
                      onClick={() => updatePayments(localPayments
                        .filter((_, itemIndex) => itemIndex !== index)
                        .map((item, itemIndex) => ({ ...item, sequenceNo: itemIndex + 1 })))}
                      style={{ padding: 4, color: '#ff3141' }}
                    >
                      <DeleteOutline fontSize={18} />
                    </div>
                  )}
                </div>
              ))}
              {scenario === 'custom' && (
                <Button
                  size="small"
                  fill="outline"
                  color="primary"
                  block
                  onClick={() => updatePayments([...localPayments, {
                    sequenceNo: localPayments.length + 1,
                    type: 'remaining',
                    label: `第${localPayments.length + 1}笔`,
                    amount: 0,
                    status: 'pending',
                  }])}
                >
                  <AddCircleOutline /> 添加一笔
                </Button>
              )}
            </div>
          </div>
        </Form>
      </div>
      <div style={{ padding: '16px 0 0', display: 'flex', gap: 12 }}>
        <Button block onClick={onClose}>取消</Button>
        <Button block color="primary" fill="outline" loading={submitting} onClick={() => onSubmit(false)}>保存方案</Button>
        <Button block color="primary" loading={submitting} onClick={() => onSubmit(true)}>去收款</Button>
      </div>
    </Popup>
  );
}
