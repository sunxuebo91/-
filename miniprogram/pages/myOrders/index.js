const STATUS_MAP = {
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
  return str.slice(0, 10); // "2026-03-23T02:38:52.073Z" → "2026-03-23"
}

Page({
  data: {
    contracts: [],
    loading: true,
    empty: false,
  },

  onLoad() {
    this.loadContracts();
  },

  // 从详情页返回后刷新，保证确认上户后状态同步
  onShow() {
    if (!this.data.loading) this.loadContracts();
  },

  async onPullDownRefresh() {
    await this.loadContracts();
    wx.stopPullDownRefresh();
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
          };
        });
      this.setData({ contracts, empty: contracts.length === 0 });
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
});

