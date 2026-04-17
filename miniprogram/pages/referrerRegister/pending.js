Page({
  data: {
    loading: true,
    status: '',   // pending_approval | approved | rejected
    info: {},
  },

  async onShow() {
    // 每次回到此页刷新状态（用户等待期间管理员可能已审批）
    await this.loadStatus();
  },

  async loadStatus() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'userService',
        data: { action: 'getReferrerInfo' },
      });
      const info = res.result && res.result.data;
      if (!info) {
        // 未找到记录，返回申请页
        wx.redirectTo({ url: '/pages/referrerRegister/index' });
        return;
      }

      // 已审批通过：刷新全局角色并跳转
      if (info.approvalStatus === 'approved') {
        this.setData({
          loading: false,
          status: 'approved',
          info: this.formatInfo(info),
        });
        return;
      }

      this.setData({
        loading: false,
        status: info.approvalStatus || 'pending_approval',
        info: this.formatInfo(info),
      });
    } catch (e) {
      console.error('加载推荐人状态失败:', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请下拉刷新', icon: 'none' });
    }
  },

  formatInfo(info) {
    const d = info.createdAt ? new Date(info.createdAt) : null;
    return {
      ...info,
      createdAtFmt: d
        ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        : '',
    };
  },

  goStart() {
    wx.redirectTo({ url: '/pages/myReferrals/index' });
  },

  goReapply() {
    wx.redirectTo({ url: '/pages/referrerRegister/index' });
  },
});
