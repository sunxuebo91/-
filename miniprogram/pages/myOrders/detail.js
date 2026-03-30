const STATUS_TEXT = {
  draft:     '待签约',
  signing:   '签约中',
  signed:    '已签约',
  active:    '服务中',
  ended:     '已结束',
  cancelled: '已取消',
  replaced:  '已更新',
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

Page({
  data: { contract: null, loading: true, confirming: false },

  onLoad({ id, autoSign }) {
    this.contractId = id;
    this.autoSign = autoSign === '1';
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    this.phone = crmUserInfo.phone || '';
    this.loadDetail();
  },

  // 从 WebView 签约页返回后自动刷新状态
  onShow() {
    if (this.contractId && !this.data.loading) {
      this.loadDetail();
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

      // 签约进度
      const ss = c.signerStatuses || null;
      const customerSigned = ss?.customerSigned || false;
      const nannySigned    = ss?.nannySigned    || false;
      const waitingNanny   = customerSigned && !nannySigned;

      // 状态文字：中间态覆盖
      let statusText = STATUS_TEXT[c.contractStatus] || c.contractStatus || '';
      if (waitingNanny) statusText = '等待阿姨签约';

      // 去签约按钮：有爱签合同号 + 处于签约流程 + 客户本人尚未签
      const showSign = !!c.esignContractNo
        && ['draft', 'signing', 'signed'].includes(c.contractStatus)
        && !customerSigned;

      this.setData({
        contract: {
          ...c,
          serviceTypeText:  c.contractType || '未知服务',
          nannyName:        c.workerName   || '待定',
          nannyPhone:       c.workerPhone  || '',
          nannySalary:      c.workerSalary || 0,
          serviceFee:       c.customerServiceFee || 0,
          startDateFmt:     formatDate(c.startDate),
          endDateFmt:       formatDate(c.endDate),
          contractDuration: calculateMonths(c.startDate, c.endDate),
          statusText,
          // 确认上户仅在双方都签完后才开放
          onboardConfirmed: c.onboardStatus === 'confirmed',
          showOnboard: nannySigned && c.onboardStatus !== 'confirmed',
          onboardConfirmedAt: formatDateTime(c.onboardConfirmedAt),
          showSign,
          showDownload:     !!c.contractFileUrl,
          // 签约进度
          hasSigning:    !!ss,
          customerSigned,
          nannySigned,
          waitingNanny,
        },
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
    }
  },

  // 拨打阿姨电话
  callNanny() {
    const phone = this.data.contract?.nannyPhone;
    if (!phone) return;
    wx.makePhoneCall({ phoneNumber: phone });
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

