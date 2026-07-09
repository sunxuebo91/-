const STATUS_TEXT = {
  draft:     '待签约',
  signing:   '签约中',
  signed:    '已签约',
  active:    '服务中',
  ended:     '已结束',
  cancelled: '已取消',
  replaced:  '已更新',
  refunded:  '已退款',
};

function formatDate(str) {
  if (!str) return '';
  return str.slice(0, 10);
}

// 计算两个日期之间的月数差
function calculateMonths(start, end) {
  if (!start || !end) return '';
  const d1 = new Date(start);
  const d2 = new Date(end);
  const yearDiff = d2.getFullYear() - d1.getFullYear();
  const monthDiff = d2.getMonth() - d1.getMonth();
  const totalMonths = yearDiff * 12 + monthDiff;
  return totalMonths > 0 ? `${totalMonths}个月` : '—';
}

function formatDateTime(str) {
  if (!str) return '';
  // ISO → 北京时间（+8）
  const d = new Date(str);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

/**
 * 根据 CRM 合同数据动态拼接支付确认弹窗文案
 * - 月嫂合同 → "定金/尾款" 命名
 * - 其他合同（住家保姆/月子/育儿嫂等）→ 有阿姨工资则展示"服务费+阿姨首月工资"，否则只展示服务费
 * 兜底：纯金额
 */
function buildPayConfirmContent(contract) {
  const serviceFee = Number(contract.customerServiceFee || contract.serviceFee || 0);
  const workerSalary = Number(contract.workerSalary || 0);
  const contractType = String(contract.contractType || contract.serviceTypeText || '');

  const fmt = n => `¥${n.toFixed(2)}`;

  // 月嫂合同：定金 / 尾款（V1 单笔时默认"定金"，V2 用 nextPayment.label）
  if (/月嫂/i.test(contractType)) {
    // 月嫂合同可能带家政员工资（首月工资），优先用 sum 拼接
    if (workerSalary > 0) {
      return {
        title: '确认支付定金 + 首月工资',
        content: `确认支付定金 ${fmt(serviceFee)} + 首月工资 ${fmt(workerSalary)} ？`,
      };
    }
    return {
      title: '确认支付定金',
      content: `确认支付定金 ${fmt(serviceFee)} ？`,
    };
  }

  // 非月嫂合同：服务费 + 阿姨首月工资
  if (workerSalary > 0 && serviceFee > 0) {
    return {
      title: '确认支付',
      content: `确认支付服务费 ${fmt(serviceFee)} + 阿姨首月工资 ${fmt(workerSalary)} ？`,
    };
  }

  // 仅服务费
  if (serviceFee > 0) {
    return {
      title: '确认支付服务费',
      content: `确认支付服务费 ${fmt(serviceFee)} ？`,
    };
  }

  // 兜底：只有金额
  const total = serviceFee + workerSalary;
  return {
    title: '确认支付',
    content: `确认支付 ${fmt(total)} ？`,
  };
}

Page({
  data: {
    contract: null,
    loading: true,
    confirming: false,
    paying: false,
    paymentProgress: null,
    checkoutPaying: false,
  },

  onLoad({ id, autoSign }) {
    this.contractId = id;
    this.autoSign = autoSign === '1';
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    this.phone = crmUserInfo.phone || '';
    if (!this.phone) {
      // 客户从分享卡片进入，未登录 → 强制登录（登录后回到本详情页）
      const redirect = `/pages/myOrders/detail?id=${encodeURIComponent(id || '')}&autoSign=${autoSign || ''}`;
      wx.redirectTo({
        url: `/pages/login/index?redirect=${encodeURIComponent(redirect)}`,
        fail: () => wx.switchTab({ url: '/pages/home/index' }),
      });
      return;
    }
    this.loadDetail();
  },

  async onPullDownRefresh() {
    try {
      await this.loadDetail();
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  // 从 WebView 签约页返回后自动刷新状态
  onShow() {
    if (this.contractId && !this.data.loading) {
      this.loadDetail();
    }

    // 自动探查：进入页面时检查本合同是否有 pending 状态的支付记录
    // 如果有，自动去收钱吧查一次最新状态（兜底用户付完款按 Home 键退出导致轮询失败的情况）
    if (this.contractId && this.phone) {
      this.probePendingPayment();
    }
  },

  /**
   * 探查本合同是否有 pending 支付记录，如有自动触发一次 queryPayment 同步
   * 兜底场景：用户付完款按 Home 键退出小程序，回到小程序时状态没同步
   */
  async probePendingPayment() {
    if (this._probing) return; // 防重入
    try {
      const res = await wx.cloud.callFunction({
        name: 'paymentService',
        data: { action: 'getPaymentByContract', contractId: this.contractId, orderCategory: 'housekeeping' },
      });
      const data = res.result?.data;
      if (!data) return;
      // getPaymentByContract 内部已经处理：pending 时调 queryPayment 查收钱吧，paid 时更新本地+通知CRM
      // 如果查到 paid，会触发 notifyCRM + 本地 paymentStatus 变 paid；loadDetail 会重新拉到
      if (data.paymentStatus === 'paid' && this._lastProbedStatus !== 'paid') {
        this._lastProbedStatus = 'paid';
        // 状态变 paid，刷新合同详情让按钮消失
        await this.loadDetail();
      } else if (data.paymentStatus === 'pending' || data.paymentStatus === 'failed') {
        this._lastProbedStatus = data.paymentStatus;
      }
    } catch (e) {
      console.warn('[detail] probePendingPayment failed:', e.message);
    }
  },

  /** "我已支付？点此刷新" 按钮手动触发：去收钱吧/CRM 同步最新状态 */
  async manualRefreshPayment() {
    wx.showLoading({ title: '同步支付状态...' });
    try {
      await this.probePendingPayment();
      // 重新加载合同详情（按之前的修复，现在 showPay 会读取 paymentStatus）
      await this.loadDetail();
      const finalStatus = this.data.contract?.paymentStatus;
      if (finalStatus === 'paid') {
        wx.showToast({ title: '已同步为已支付', icon: 'success' });
      } else {
        wx.showToast({ title: '暂未检测到支付，请稍后再试', icon: 'none', duration: 2500 });
      }
    } catch (e) {
      wx.showToast({ title: '刷新失败，请重试', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'contractService',
        data: { action: 'getContractDetail', id: this.contractId, phone: this.phone },
      });
      if (!res.result || !res.result.success) throw new Error(res.result?.errMsg || '加载失败');
      const c = res.result.data;

      // 签约进度 - 支持三态：'signed'已签署 / 'signing'签约中 / 'pending'待签署
      const ss = c.signerStatuses || {};
      console.log('[签约状态诊断]', JSON.stringify({
        contractId: c._id || c.id || c.contractNo,
        signerStatuses: c.signerStatuses,
        contractStatus: c.contractStatus,
        esignStatus: c.esignStatus,
        paymentVersion: c.paymentVersion,
      }));
      const getSignStatus = (val) => {
        if (val === true || val === 'signed') return 'signed';
        if (val === 'signing') return 'signing';
        return 'pending';
      };
      const customerStatus = getSignStatus(ss.customerSigned);
      const nannyStatus = getSignStatus(ss.nannySigned);
      const customerSigned = customerStatus === 'signed';
      const nannySigned    = nannyStatus === 'signed';
      const waitingNanny   = customerSigned && !nannySigned;
      console.log('[签约状态计算结果]', { customerStatus, nannyStatus, customerSigned, nannySigned });

      // 状态文字：基于签约进度优先判断
      let statusText = '';
      let displayStatus = c.contractStatus; // 用于 CSS 类名

      if (ss && (c.contractStatus === 'draft' || c.contractStatus === 'signing')) {
        // 有签约进度信息时，根据实际签署状态判断
        if (customerSigned && nannySigned) {
          statusText = '已签约';
          displayStatus = 'signed';
        } else if (customerSigned && !nannySigned) {
          statusText = '等待阿姨签约';
          displayStatus = 'signing';
        } else if (!customerSigned && nannySigned) {
          statusText = '等待您签约';
          displayStatus = 'signing';
        } else {
          statusText = '待签约';
          displayStatus = 'draft';
        }
      } else {
        // 无签约进度或已进入后续状态，直接使用后端状态
        statusText = STATUS_TEXT[c.contractStatus] || c.contractStatus || '';
      }

      // 去签约按钮：有爱签合同号 + 处于签约流程 + 客户本人尚未签
      const showSign = !!c.esignContractNo
        && ['draft', 'signing', 'signed'].includes(c.contractStatus)
        && !customerSigned;

      // 去支付按钮：客户已签约 + 未支付 + 合同状态在签约流程中（非已结束/已取消）
      // 兼容 CRM 返回 paymentVersion: 2 / '2' / 'V2' / 'v2'
      const pv = c.paymentVersion != null ? String(c.paymentVersion).toLowerCase().replace(/^v/, '') : '';
      const isV2 = pv === '2';
      // CRM 端可关闭支付（paymentEnabled=false），关闭后小程序不显示支付按钮
      const paymentEnabled = c.paymentEnabled !== false;
      // 支付状态判断：V2 看 paymentStatus 字段；V1 也加 paymentStatus 判断（之前只看合同状态导致已付款按钮还在）
      const notPaid = c.paymentStatus !== 'paid' && c.paymentStatus !== 'refunded';
      const showPay = paymentEnabled && customerSigned && notPaid && Number(c.paymentConfigAmount || 0) > 0 && (
        isV2 ? true
             : ['draft', 'signing', 'signed', 'active'].includes(c.contractStatus)
      );

      // 清除 CRM 返回中可能污染签约状态的冗余字段
      const { customerSigned: _cs, nannySigned: _ns, customerStatus: _cst, nannyStatus: _nst, ...cleanContract } = c;

      this.setData({
        contract: {
          ...cleanContract,
          serviceTypeText:  c.contractType || '未知服务',
          nannyName:        c.workerName   || '待定',
          nannyPhone:       c.workerPhone  || '',
          nannySalary:      c.workerSalary || 0,
          serviceFee:       c.customerServiceFee || 0,
          startDateFmt:     formatDate(c.startDate),
          endDateFmt:       formatDate(c.endDate),
          contractDuration: calculateMonths(c.startDate, c.endDate),
          statusText,
          displayStatus,
          // 确认上户仅在双方都签完后才开放
          onboardConfirmed: c.onboardStatus === 'confirmed',
          showOnboard: nannySigned && c.onboardStatus !== 'confirmed',
          onboardConfirmedAt: formatDateTime(c.onboardConfirmedAt),
          showSign,
          showPay,
          isV2,
          showDownload:     !!c.contractFileUrl,
          // 签约进度
          hasSigning:    !!(c.signerStatuses),
          customerSigned,
          nannySigned,
          customerStatus,
          nannyStatus,
          waitingNanny,
        },
        floatingAction: this._buildFloatingAction({
          showSign, showPay,
          showOnboard: nannySigned && c.onboardStatus !== 'confirmed',
          showDownload: !!c.contractFileUrl,
          customerPaid: !notPaid,
          contractStatus: c.contractStatus,
          onboardConfirmed: c.onboardStatus === 'confirmed',
        }),
      });
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
      // 列表页带 autoSign=1 跳入时，自动触发签约
      if (this.autoSign && this.data.contract?.showSign) {
        this.autoSign = false;
        this.goSign();
      }
      // V2 多笔支付：加载支付进度
      if (this.data.contract?.isV2) {
        this.fetchPaymentProgress();
      }
    }
  },

  // 获取 V2 多笔支付进度
  async fetchPaymentProgress() {
    if (!this.contractId || !this.phone) return null;
    try {
      const res = await wx.cloud.callFunction({
        name: 'paymentService',
        data: { action: 'getPaymentProgress', contractId: this.contractId, phone: this.phone },
      });
      if (res.result?.success) {
        const data = res.result.data;
        console.log('[detail] fetchPaymentProgress =>', JSON.stringify({
          nextPayment: data.nextPayment,
          paymentsCount: data.payments?.length,
          totalAmount: data.totalAmount,
          receivedAmount: data.receivedAmount,
        }));
        this.setData({ paymentProgress: data });
        return data;
      }
    } catch (e) { console.warn('[detail] 支付进度加载失败:', e.message); }
    return null;
  },

  // 拨打电话 / 悬浮底部按钮相关

  // 悬浮底部按钮：根据当前合同状态计算下一动作（互斥）
  _buildFloatingAction({ showSign, showPay, showOnboard, showDownload, contractStatus, onboardConfirmed, customerPaid }) {
    if (showSign) return { type: 'sign', kind: 'sign', label: '✍️ 去签署' };
    if (showPay) return { type: 'pay', kind: 'pay', label: '去支付' };
    // 客户已签 + 已支付 + 阿姨已签 + 未确认上户 → 「确认上户」
    if (showOnboard && !onboardConfirmed) return { type: 'onboard', kind: 'onboard', label: '✓ 确认上户' };
    // 全部完成且有下载链接 → 下载
    if (showDownload && (contractStatus === 'active' || contractStatus === 'ended' || onboardConfirmed || customerPaid)) {
      return { type: 'download', kind: 'download', label: '📄 下载合同' };
    }
    if (onboardConfirmed) return { type: 'done', kind: 'done', label: '✓ 全部完成' };
    return null;
  },

  onFloatingAction() {
    const a = this.data.floatingAction;
    if (!a) return;
    if (a.type === 'sign') return this.goSign();
    if (a.type === 'pay') return this.goPay();
    if (a.type === 'onboard') return this.confirmOnboard();
    if (a.type === 'download') return this.downloadContract();
  },

  callNanny() {
    const phone = this.data.contract?.nannyPhone;
    if (!phone) return;
    wx.makePhoneCall({ phoneNumber: phone });
  },

  // 走收银台（webview 打开收钱吧收银台 H5，用户自选微信/支付宝/银联）
  async goCheckout() {
    if (this.data.checkoutPaying) return;
    const { contract, paymentProgress } = this.data;
    if (!contract) return;

    const isV2 = contract.isV2;

    // V2 需要先确定 sequenceNo
    let sequenceNo = null;
    if (isV2) {
      let progress = paymentProgress;
      if (!progress) progress = await this.fetchPaymentProgress();
      if (!progress || !progress.nextPayment) {
        wx.showToast({ title: '该合同没有待支付', icon: 'none' });
        return;
      }
      sequenceNo = progress.nextPayment.sequenceNo;
    }

    this.setData({ checkoutPaying: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'paymentService',
        data: {
          action: 'precreate',
          contractId: contract._id || contract.id,
          phone: this.phone,
          useCheckout: true,
          ...(sequenceNo ? { paymentSequenceNo: sequenceNo } : {}),
        },
      });
      const result = res.result;
      if (!result?.success) throw new Error(result?.errMsg || '收银台预下单失败');
      const { paymentId, wapUrl, payMode } = result.data;
      if (!wapUrl) {
        throw new Error('收钱吧未返回收银台 URL（可能该商户未开通收银台）');
      }
      console.log('[detail] 收银台模式 wapUrl:', wapUrl, 'paymentId:', paymentId);

      // 跳到 webview，让用户完成支付
      // mode=checkout 表示这是个支付收银台，webview 加载完成后开始轮询
      const url = encodeURIComponent(wapUrl);
      const redirect = encodeURIComponent(`/pages/myOrders/detail`);
      wx.navigateTo({
        url: `/pages/webview/index?url=${url}&title=${encodeURIComponent('选择支付方式')}&mode=checkout&paymentId=${paymentId}&returnTo=myOrdersDetail&contractId=${contract._id || contract.id}`,
      });
    } catch (err) {
      console.error('[detail] goCheckout failed:', err);
      wx.showToast({ title: err.message || '收银台打开失败', icon: 'none', duration: 3000 });
    } finally {
      this.setData({ checkoutPaying: false });
    }
  },

  // 去支付（调用云函数发起微信支付）
  async goPay() {
    if (this.data.paying) return;
    const { contract, paymentProgress } = this.data;
    if (!contract) return;

    const isV2 = contract.isV2;

    // ═══ V2 多笔支付路径 ═══
    if (isV2) {
      // 获取最新进度（如果还没加载）
      let progress = paymentProgress;
      if (!progress) {
        progress = await this.fetchPaymentProgress();
      }
      if (!progress || !progress.nextPayment) {
        wx.showToast({ title: '暂无待支付项', icon: 'none' });
        return;
      }

      const nextPay = progress.nextPayment;
      const amountYuan = Number(nextPay.amount).toFixed(2);
      const label = nextPay.label || '费用';

      const { confirm } = await new Promise(resolve =>
        wx.showModal({
          title: '确认支付',
          content: `确认支付 ${label} ¥${amountYuan} 元？\n（第${nextPay.sequenceNo}笔/共${progress.payments.length}笔）`,
          confirmText: '确认支付',
          confirmColor: '#8766F3',
          success: resolve,
        })
      );
      if (!confirm) return;

      this.setData({ paying: true });
      try {
        const res = await wx.cloud.callFunction({
          name: 'paymentService',
          data: {
            action: 'precreate',
            contractId: contract._id || contract.id,
            phone: this.phone,
            paymentSequenceNo: nextPay.sequenceNo,
          },
        });
        const result = res.result;
        if (!result?.success) {
          throw new Error(result?.errMsg || '预下单失败');
        }
        const { paymentId, wapPayRequest } = result.data;
        if (!wapPayRequest) {
          throw new Error('获取支付参数失败');
        }

        // 解析支付参数并拉起微信支付
        const payParams = typeof wapPayRequest === 'string'
          ? JSON.parse(wapPayRequest)
          : wapPayRequest;

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
        let confirmed = false;
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const qRes = await wx.cloud.callFunction({
            name: 'paymentService',
            data: { action: 'queryPayment', paymentId },
          });
          if (qRes.result?.data?.paymentStatus === 'paid') { confirmed = true; break; }
        }

        if (confirmed) {
          wx.showToast({ title: '支付成功', icon: 'success' });
          // 刷新页面和进度
          setTimeout(async () => {
            await this.loadDetail();
            const newProgress = await this.fetchPaymentProgress();
            if (newProgress && newProgress.nextPayment) {
              setTimeout(() => {
                wx.showToast({ title: `还有下一笔待支付：${newProgress.nextPayment.label}`, icon: 'none', duration: 3000 });
              }, 1500);
            }
          }, 1500);
        } else {
          wx.showToast({ title: '支付处理中，请稍后查看', icon: 'none' });
          setTimeout(() => this.loadDetail(), 2000);
        }
      } catch (err) {
        if (err.errMsg && err.errMsg.includes('cancel')) {
          wx.showToast({ title: '已取消支付', icon: 'none' });
        } else {
          wx.showToast({ title: err.message || '支付失败', icon: 'none' });
        }
      } finally {
        this.setData({ paying: false });
      }
      return; // V2 路径结束
    }

    // ═══ V1 原有支付路径（以下代码保持不变）═══
    // payableAmountCents 单位是"分"，需要除以100；serviceFee 单位已经是"元"
    const amountCents = Number(contract.payableAmountCents) || 0;
    let amountYuan;
    if (amountCents > 0) {
      amountYuan = (amountCents / 100).toFixed(2);
    } else {
      amountYuan = Number(contract.serviceFee || 0).toFixed(2);
    }
    const displayAmount = `¥${amountYuan}`;

    // 根据合同类型动态生成支付确认文案（月嫂定金 / 服务费+阿姨工资 / 仅服务费）
    const confirmInfo = buildPayConfirmContent(contract);
    const { confirm } = await new Promise(resolve =>
      wx.showModal({
        title: confirmInfo.title,
        content: confirmInfo.content,
        confirmText: '确认支付',
        confirmColor: '#8766F3',
        success: resolve,
      })
    );
    if (!confirm) return;

    this.setData({ paying: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'paymentService',
        data: {
          action: 'precreate',
          contractId: contract._id || contract.id,
          phone: this.phone,
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
      setTimeout(() => this.loadDetail(), 1500);
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

  // 下载并打开合同 PDF
  async downloadContract() {
    const url = this.data.contract?.contractFileUrl;
    if (!url) return;
    wx.showLoading({ title: '下载中...' });
    try {
      const { tempFilePath } = await wx.downloadFile({ url });
      wx.hideLoading();
      await wx.openDocument({ filePath: tempFilePath, fileType: 'pdf', showMenu: true });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '下载失败，请重试', icon: 'none' });
    }
  },

  // 实时拉取签约链接并打开
  async goSign() {
    wx.showLoading({ title: '获取签约链接...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'contractService',
        data: { action: 'getSigningUrl', id: this.contractId, phone: this.phone },
      });
      wx.hideLoading();
      if (!res.result?.success) throw new Error(res.result?.errMsg || '获取失败');
      const { signingUrl, alreadySigned } = res.result.data;
      if (alreadySigned) {
        wx.showModal({
          title: '已完成签署',
          content: '您已完成合同签署，无需再次操作',
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#8766F3',
          success: () => this.loadDetail(),
        });
        return;
      }
      wx.navigateTo({
        url: `/pages/webview/index?url=${encodeURIComponent(signingUrl)}&title=${encodeURIComponent('合同签约')}`,
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '获取签约链接失败', icon: 'none', duration: 2500 });
    }
  },

  // 确认上户（弹窗二次确认）
  confirmOnboard() {
    if (this.data.contract?.confirming) return;
    wx.showModal({
      title: '确认上户',
      content: '确认阿姨已正式到您家开始服务了吗？',
      confirmText: '确认上户',
      confirmColor: '#8766F3',
      success: async ({ confirm }) => {
        if (!confirm) return;
        this.setData({ 'contract.confirming': true });
        try {
          const res = await wx.cloud.callFunction({
            name: 'contractService',
            data: { action: 'confirmOnboard', id: this.contractId, phone: this.phone },
          });
          if (!res.result || !res.result.success) throw new Error(res.result?.errMsg || '操作失败');
          wx.showToast({ title: '上户确认成功', icon: 'success' });
          setTimeout(() => this.loadDetail(), 1200);
        } catch (e) {
          wx.showToast({ title: e.message || '操作失败', icon: 'none' });
        } finally {
          this.setData({ 'contract.confirming': false });
        }
      },
    });
  },
});

