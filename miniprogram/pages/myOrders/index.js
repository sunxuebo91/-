const STATUS_MAP = {
  draft:     '待签约',
  signing:   '签约中',
  signed:    '已签约',
  active:    '服务中',
  ended:     '已结束',
  cancelled: '已取消',
  replaced:  '已更新',
  refunded:  '已退款',
};

// 职培合同生命周期状态：signing → signed → active → graduated / refunded（后两者为终态）
// signed = 已签约未付款；active = 已付款学习中；其他历史值 draft/replaced/cancelled/空 统一归并为 signing
const TRAINING_STATUS_MAP = {
  signing:   '签约中',
  signed:    '已签约',
  active:    '学习中',
  graduated: '已毕业',
  refunded:  '已退款',
};

function normalizeTrainingStatus(s) {
  return (s === 'signed' || s === 'active' || s === 'graduated' || s === 'refunded') ? s : 'signing';
}

function formatDate(str) {
  if (!str) return '';
  return str.slice(0, 10); // "2026-03-23T02:38:52.073Z" → "2026-03-23"
}

function formatDateTime(str) {
  if (!str) return '';
  const d = new Date(str);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function maskPhone(p) {
  if (!p) return '';
  return String(p).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}

function fenToYuan(cents) {
  const n = Number(cents) || 0;
  return (n / 100).toFixed(2);
}

Page({
  data: {
    activeTab: 'housekeeping',   // 'housekeeping' | 'training'
    // 家政侧
    contracts: [],
    loading: true,
    empty: false,
    // 职培侧
    trainingLoaded: false,       // 是否已发起过加载（懒加载用）
    trainingLoading: false,
    trainingEmpty: false,
    trainingData: null,          // { lead, courseInfo, amount, contracts[] }
    trainingBadge: false,        // Tab 角标（有未签约/待支付时点亮）
    paying: false,
  },

  onLoad() {
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    this.phone = crmUserInfo.phone || '';
    this.loadContracts();
    // 并行预加载职培（仅用于角标判断，不切 Tab）
    this.loadTrainingOrder(true);
  },

  // 单类型合同 → 自动切到对应 Tab；多类型保留默认 housekeeping
  _autoSwitchTabOnSingle(hk, tr) {
    let active = this.data.activeTab;
    if (hk && !tr) active = 'housekeeping';
    else if (!hk && tr) active = 'training';
    if (active !== this.data.activeTab) this.setData({ activeTab: active });
  },

  // 从详情页/签约 webview 返回后刷新当前 Tab
  onShow() {
    if (this.data.activeTab === 'housekeeping') {
      if (!this.data.loading) this.loadContracts();
    } else {
      if (!this.data.trainingLoading) this.loadTrainingOrder();
    }
  },

  async onPullDownRefresh() {
    if (this.data.activeTab === 'housekeeping') {
      await this.loadContracts();
    } else {
      await this.loadTrainingOrder();
    }
    wx.stopPullDownRefresh();
  },

  // Tab 切换
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    if (tab === 'training' && !this.data.trainingLoaded) {
      this.loadTrainingOrder();
    }
  },

  async loadContracts() {
    this.setData({ loading: true });
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const phone = crmUserInfo.phone || '';
    try {
      const res = await wx.cloud.callFunction({
        name: 'contractService',
        data: { action: 'getMyContracts', phone },
      });
      if (!res.result || !res.result.success) {
        throw new Error(res.result?.errMsg || '加载失败');
      }
      const contracts = (res.result.data || [])
        // 当前合同在前，历史记录在后，同类按创建时间倒序
        .sort((a, b) => {
          if (a.isLatest !== b.isLatest) return a.isLatest ? -1 : 1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        })
        .map(c => {
          const isHistory = !c.isLatest;
          const onboardConfirmed = c.onboardStatus === 'confirmed';
          // 列表只在 draft（确定尚未签署）时显示入口
          // signing/signed 状态由详情页根据 signerStatuses 精确判断
          const showSign = !isHistory && !!c.esignContractNo
            && c.contractStatus === 'draft';
          const showOnboard = !isHistory && !showSign && !onboardConfirmed
            && c.contractStatus === 'active';
          // "服务中"仅在已到开始日期时显示，否则显示"待服务"
          let statusText = STATUS_MAP[c.contractStatus] || c.contractStatus || '';
          if (c.contractStatus === 'active') {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const startDay = c.startDate ? new Date(c.startDate) : null;
            if (startDay) startDay.setHours(0, 0, 0, 0);
            statusText = (startDay && today >= startDay) ? '服务中' : '待服务';
          }
          // V2 多笔支付
          const isV2 = c.paymentVersion === 'v2';
          let paymentProgressText = '';
          if (isV2 && c.paymentReceivedAmount !== undefined) {
            paymentProgressText = `已收¥${c.paymentReceivedAmount || 0} / ¥${c.paymentTotalAmount || 0}`;
          }
          return {
            ...c,
            serviceTypeText: c.contractType || '未知服务',
            nannyName:       c.workerName   || '',
            startDateFmt:    formatDate(c.startDate),
            statusText,
            onboardConfirmed,
            showSign,
            showOnboard,
            isHistory,
            isV2,
            paymentProgressText,
            paymentReceivedAmount: c.paymentReceivedAmount || 0,
            paymentTotalAmount:    c.paymentTotalAmount || 0,
          };
        });
      this.setData({ contracts, empty: contracts.length === 0, hasHousekeeping: contracts.length > 0 });
      this._autoSwitchTabOnSingle(contracts.length > 0, this.data.hasTraining);
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/myOrders/detail?id=${id}` });
  },

  goSign(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/myOrders/detail?id=${id}` });
  },

  confirmOnboard(e) {
    const id = e.currentTarget.dataset.id;
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const phone = crmUserInfo.phone || '';
    wx.showModal({
      title: '确认上户',
      content: '确认阿姨已正式到您家开始服务了吗？',
      confirmText: '确认上户',
      confirmColor: '#8766F3',
      success: async ({ confirm }) => {
        if (!confirm) return;
        try {
          const res = await wx.cloud.callFunction({
            name: 'contractService',
            data: { action: 'confirmOnboard', id, phone },
          });
          if (!res.result?.success) throw new Error(res.result?.errMsg || '操作失败');
          wx.showToast({ title: '已确认上户', icon: 'success' });
          setTimeout(() => this.loadContracts(), 1200);
        } catch (err) {
          wx.showToast({ title: err.message || '操作失败', icon: 'none' });
        }
      },
    });
  },

  // ───────── 职培订单 ─────────

  // 加载学员档案 + 职培合同列表（一次拉全量）
  // silent=true 表示仅用于角标判断，不改 trainingLoading 状态
  async loadTrainingOrder(silent) {
    console.log('[training] loadTrainingOrder, phone=', this.phone, 'silent=', silent);
    if (!this.phone) {
      console.warn('[training] 无登录手机号，跳过职培加载');
      this.setData({ trainingLoaded: true, trainingEmpty: true });
      return;
    }
    if (!silent) this.setData({ trainingLoading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'trainingOrderService',
        data: { action: 'getMyOrder', phone: this.phone },
      });
      const body = res.result || {};
      console.log('[training] getMyOrder result:', body);
      if (!body.success) {
        // 404 = 该手机号无学员档案，静默置空；其他错误提示
        if (body.errCode === 404) {
          console.warn('[training] 404 该手机号无学员档案');
          this.setData({ trainingLoaded: true, trainingEmpty: true, trainingData: null, trainingBadge: false });
        } else if (body.errCode === 403) {
          console.warn('[training] 403 手机号与合同不匹配');
          this.setData({ trainingLoaded: true, trainingEmpty: true, trainingData: null });
          if (!silent) wx.showToast({ title: '手机号不匹配，请联系顾问', icon: 'none' });
        } else {
          console.error('[training] 加载失败:', body.errMsg);
          if (!silent) wx.showToast({ title: body.errMsg || '加载失败', icon: 'none' });
        }
        return;
      }
      const raw = body.data || {};
      const contracts = (raw.contracts || []).map(c => {
        const contractStatus = normalizeTrainingStatus(c.contractStatus);
        const paid = c.paymentStatus === 'paid';
        const isTerminal = contractStatus === 'graduated' || contractStatus === 'refunded';
        // 生命周期驱动：signing → 去签约；graduated/refunded 终态不出任何操作按钮
        const showSign = contractStatus === 'signing';
        // V2 多笔支付：payments[] 由 CRM shapeBaobeiContract 暴露（2026-07-08 上线）
        // 注意：amount 单位是「元」整数（不是分），不再除以 100
        const paymentsArr = Array.isArray(c.payments) ? c.payments : [];
        const showPay = !!c.paymentEnabled && !paid && !isTerminal && Number(c.paymentConfigAmount || c.payableAmountCents || 0) > 0;
        // 单位审计（CRM 2026-07-08 PAYMENT-UNIT-FIX）：
        //   payments[].amount = 元（不加 /100）
        //   paymentConfigAmount = 元（不加 /100）
        //   paymentTotalAmount / paymentReceivedAmount = 元
        //   payableAmountCents / paymentAmountCents = 分（÷100 转元）
        //   payableAmountYuan / paymentAmountYuan = 元
        const paymentsSumYuan = paymentsArr.reduce((s, p) => s + Number(p.amount || 0), 0);
        const amountYuanRaw = paid
          ? Number(c.paymentAmountYuan || (Number(c.paymentAmountCents || 0) / 100))
          : (Number(c.payableAmountCents || 0) / 100) || Number(c.payableAmountYuan || 0) || Number(c.paymentConfigAmount || 0) || paymentsSumYuan;
        const amountYuan = amountYuanRaw > 0 ? amountYuanRaw.toFixed(2) : '';
        const paymentsList = paymentsArr.map((p) => {
          // amount 已是「元」整数，直接 toFixed(2) 保留 2 位小数
          const amt = Number(p.amount || 0);
          return {
            ...p,
            amountYuan: amt.toFixed(2),
            paidAtFmt: p.paidAt ? formatDateTime(p.paidAt) : '',
          };
        });
        const totalYuan = paymentsArr.reduce((s, p) => s + Number(p.amount || 0), 0) || Number(c.payableAmountCents || 0) / 100 || Number(c.paymentTotalAmount || 0);
        const paidYuan = paymentsArr.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);
        const paymentProgressPercent = totalYuan > 0 ? Math.min(100, (paidYuan / totalYuan * 100)) : 0;
        const paymentReceivedYuan = paidYuan > 0 ? paidYuan.toFixed(2) : '0.00';
        return {
          ...c,
          contractStatus,
          statusText:      TRAINING_STATUS_MAP[contractStatus],
          createdAtFmt:    formatDateTime(c.createdAt),
          paidAtFmt:       formatDateTime(c.paidAt),
          graduatedAtFmt:  formatDateTime(c.graduatedAt),
          refundedAtFmt:   formatDateTime(c.refundedAt),
          amountYuan,
          courseAmountYuan:     Number(c.courseAmount || 0).toFixed(2),
          serviceFeeAmountYuan: Number(c.serviceFeeAmount || 0).toFixed(2),
          showSign,
          showPay,
          paid,
          payments: paymentsList,
          paymentProgressPercent: Math.round(paymentProgressPercent),
          paymentReceivedYuan,
        };
      });
      // 有任一合同未签约或未支付 → 点亮角标
      const hasTodo = contracts.some(c => c.showSign || c.showPay);
      this.setData({
        trainingLoaded: true,
        trainingEmpty:  contracts.length === 0,
        trainingBadge:  hasTodo,
        hasTraining:    contracts.length > 0,
        trainingData: {
          lead: raw.lead ? { ...raw.lead, phoneMasked: maskPhone(raw.lead.phone) } : null,
          courseInfo: raw.courseInfo || null,
          amount:     raw.amount || null,
          contracts,
        },
      });
      this._autoSwitchTabOnSingle(this.data.hasHousekeeping, contracts.length > 0);
    } catch (e) {
      if (!silent) wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      if (!silent) this.setData({ trainingLoading: false });
    }
  },

  // 去签约：拉爱签链接 → webview
  async goTrainingSign(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showLoading({ title: '获取签约链接...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'trainingOrderService',
        data: { action: 'getSigningUrl', id, phone: this.phone },
      });
      wx.hideLoading();
      const body = res.result || {};
      if (!body.success) throw new Error(body.errMsg || '获取失败');
      const { signingUrl, alreadySigned } = body.data || {};
      if (alreadySigned) {
        wx.showModal({
          title: '已完成签署',
          content: '您已完成合同签署，无需再次操作',
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#8766F3',
          success: () => this.loadTrainingOrder(),
        });
        return;
      }
      if (!signingUrl) throw new Error('签约链接为空');
      wx.navigateTo({
        url: `/pages/webview/index?url=${encodeURIComponent(signingUrl)}&title=${encodeURIComponent('合同签约')}`,
      });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '获取签约链接失败', icon: 'none', duration: 2500 });
    }
  },

  // 查看已签合同：下载 PDF 并打开
  async viewTrainingContract(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) {
      wx.showToast({ title: '合同文件暂不可用', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '下载中...' });
    try {
      const { tempFilePath } = await wx.downloadFile({ url });
      wx.hideLoading();
      await wx.openDocument({ filePath: tempFilePath, fileType: 'pdf', showMenu: true });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '下载失败，请重试', icon: 'none' });
    }
  },

  // 立即支付：复用收钱吧流程（paymentService.precreateTraining）
  async goTrainingPayment(e) {
    if (this.data.paying) return;
    const id = e.currentTarget.dataset.id;
    const paymentType = e.currentTarget.dataset.paymentType || '';
    const list = this.data.trainingData && this.data.trainingData.contracts || [];
    const target = list.find(c => String(c.id) === String(id));
    if (!target) return;

    // 多笔模式：按笔付（amount 单位元 → 转分给云函数）；单笔模式：按总应付金额
    let amountCents = 0;
    let paymentLabel = '';
    const paymentsArr = Array.isArray(target.payments) ? target.payments : [];
    if (paymentType) {
      const pay = paymentsArr.find(p => p.type === paymentType);
      if (!pay) { wx.showToast({ title: '该笔不存在', icon: 'none' }); return; }
      // payments[].amount 单位 = 元，云函数 precreateTraining 期望 amount = 分
      amountCents = Math.round(Number(pay.amount || 0) * 100);
      paymentLabel = pay.label || pay.type;
    } else {
      // payableAmountCents 单位 = 分
      amountCents = Number(target.payableAmountCents) || Math.round(Number(target.payableAmountYuan || 0) * 100);
    }
    if (amountCents <= 0) {
      wx.showToast({ title: '金额异常', icon: 'none' });
      return;
    }

    const { confirm } = await new Promise(resolve =>
      wx.showModal({
        title: '确认支付',
        content: `确认支付${paymentLabel ? '「' + paymentLabel + '」' : ''} ¥${(amountCents / 100).toFixed(2)} 元？`,
        confirmText: '确认支付',
        confirmColor: '#8766F3',
        success: resolve,
      })
    );
    if (!confirm) return;

    this.setData({ paying: paymentType || true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'paymentService',
        data: {
          action: 'precreateTraining',
          contractId: id,
          phone: this.phone,
          amount: amountCents,
        },
      });
      if (!res.result?.success) throw new Error(res.result?.errMsg || '支付发起失败');
      const { paymentId, wapPayRequest } = res.result.data;
      if (!wapPayRequest) throw new Error('获取支付参数失败');

      const payParams = typeof wapPayRequest === 'string' ? JSON.parse(wapPayRequest) : wapPayRequest;
      await new Promise((resolve, reject) => {
        wx.requestPayment({
          timeStamp: payParams.timeStamp,
          nonceStr:  payParams.nonceStr,
          package:   payParams.package,
          signType:  payParams.signType || 'MD5',
          paySign:   payParams.paySign,
          success: resolve,
          fail: reject,
        });
      });

      // 轮询确认支付结果
      wx.showLoading({ title: '确认支付结果...' });
      let confirmed = false;
      for (let i = 0; i < 6; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const qRes = await wx.cloud.callFunction({
          name: 'paymentService',
          data: { action: 'queryPayment', paymentId },
        });
        if (qRes.result?.data?.paymentStatus === 'paid') {
          confirmed = true;
          break;
        }
      }
      wx.hideLoading();

      if (confirmed) {
        wx.showToast({ title: '支付成功', icon: 'success' });
      } else {
        wx.showToast({ title: '支付处理中，请稍后刷新', icon: 'none', duration: 3000 });
      }
      setTimeout(() => this.loadTrainingOrder(), 1500);
    } catch (err) {
      wx.hideLoading();
      if (err.errMsg && err.errMsg.includes('cancel')) {
        wx.showToast({ title: '已取消支付', icon: 'none' });
      } else {
        wx.showToast({ title: err.message || '支付失败', icon: 'none', duration: 2500 });
      }
    } finally {
      this.setData({ paying: false });
    }
  },
});
