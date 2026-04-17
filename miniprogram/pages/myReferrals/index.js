// 工种映射：英文 key → 中文标签（与 CRM job-types 接口保持一致）
const SERVICE_TYPE_MAP = {
  yuesao:          '月嫂',
  'zhujia-yuer':   '住家育儿嫂',
  'baiban-yuer':   '白班育儿',
  baojie:          '保洁',
  'baiban-baomu':  '白班保姆',
  'zhujia-baomu':  '住家保姆',
  yangchong:       '养宠',
  xiaoshi:         '小时工',
  'zhujia-hulao':  '住家护老',
  jiajiao:         '家教',
  peiban:          '陪伴师',
};

// 状态映射：status → 中文标签
const STATUS_MAP = {
  pending:         '待审核',
  pending_review:  '待审核',
  rejected:        '审核未通过',
  following_up:    '推荐中',
  contracted:      '已签单',
  onboarded:       '已上户',
  reward_pending:  '返费待审核',
  reward_approved: '返费待打款',
  reward_paid:     '返费已打款',
  invalid:         '未录用',
};

function fmtDate(val) {
  if (!val) return '';
  const d = new Date(val);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function maskName(name) {
  if (!name) return '';
  return name.length <= 1 ? name : name[0] + '*'.repeat(Math.min(name.length - 1, 2));
}

Page({
  data: {
    loading: true,
    list: [],
    stats: { total: 0, contracted: 0, totalReward: 0 },
  },

  onShow() {
    this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'referralService',
        data: { action: 'getMyReferrals', pageSize: 50 },
      });
      const raw = (res.result && res.result.data) || [];

      const list = raw.map(item => ({
        ...item,
        maskedName:       maskName(item.name),
        statusText:       item.statusLabel || STATUS_MAP[item.status] || item.status,
        serviceTypeText:  SERVICE_TYPE_MAP[item.serviceType] || item.serviceType || '',
        createdAtFmt:     fmtDate(item.createdAt),
        contractedAtFmt:  fmtDate(item.contractSignedAt),
      }));

      // 统计
      const contracted = list.filter(i => ['contracted','onboarded','reward_pending','reward_paid'].includes(i.status)).length;
      const totalReward = list.reduce((s, i) => s + (i.status === 'reward_paid' ? (i.rewardAmount || 0) : 0), 0);

      this.setData({
        loading: false,
        list,
        stats: { total: list.length, contracted, totalReward },
      });
    } catch (e) {
      console.error('加载推荐列表失败:', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败，请下拉刷新', icon: 'none' });
    }
  },

  async onPullDownRefresh() {
    await this.loadList();
    wx.stopPullDownRefresh();
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/myReferrals/detail?id=${id}` });
  },

  goSubmit() {
    wx.navigateTo({ url: '/pages/referralSubmit/index' });
  },
});
