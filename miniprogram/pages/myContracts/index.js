const { publicRequest } = require('../../utils/request.js');

// 家政合同状态
const HOUSEKEEPING_STATUS_MAP = {
  draft: '待签约',
  signing: '签约中',
  signed: '已签约',
  active: '服务中',
  ended: '已结束',
  cancelled: '已取消',
  replaced: '已换人',
};

// 职培订单状态（在 baobei 端 trainingOrderService.js 看到的）
const TRAINING_STATUS_MAP = {
  draft: '待签约',
  signing: '签约中',
  active: '进行中',
  graduated: '已结业',
  refunded: '已退款',
  cancelled: '已取消',
  ended: '已结束',
  // 其他原值透传
};

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// 通用：取列表项（兼容 success:false + items:[] 场景）
function extractItems(resp, kind) {
  if (!resp || resp.success === false) {
    // 401 学员/员工未找到、200 业务错误 都视为"无数据"，不抛错
    return [];
  }
  return (resp.data && resp.data.items) || [];
}

// 按 orderCategory 派发到对应 mapper（不复写后端分类）
function mapContract(c) {
  return c.orderCategory === 'training' ? mapTraining(c) : mapHousekeeping(c);
}

// 渲染家政合同卡片
function mapHousekeeping(c) {
  let statusText = HOUSEKEEPING_STATUS_MAP[c.contractStatus] || c.contractStatus || '';
  if (c.contractStatus === 'active') {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const startDay = c.startDate ? new Date(c.startDate) : null;
    if (startDay) startDay.setHours(0, 0, 0, 0);
    statusText = (startDay && today >= startDay) ? '服务中' : '待服务';
  }
  return {
    ...c,
    orderCategory: 'housekeeping',
    contractNo: c.contractNumber || c._id,
    contractTitle: c.contractType || '家政合同',
    customerName: c.customerName || '客户',
    amountText: c.customerServiceFee ? `¥${c.customerServiceFee}` : '',
    amountPaidText: c.paymentReceivedAmount ? `已收 ¥${c.paymentReceivedAmount}` : '',
    startDateFmt: formatDate(c.startDate),
    statusText,
  };
}

// 渲染职培订单卡片
function mapTraining(c) {
  const statusKey = c.contractStatus;
  let statusText = TRAINING_STATUS_MAP[statusKey] || statusKey || '';
  return {
    ...c,
    orderCategory: 'training',
    contractNo: c.contractNumber || c._id,
    contractTitle: c.intendedCourses || '职培订单',
    customerName: c.customerName || '学员',
    amountText: c.courseAmount ? `¥${c.courseAmount}` : '',
    amountPaidText: c.paymentAmount ? `¥${c.paymentAmount}` : '',
    startDateFmt: formatDate(c.createdAt),
    statusText,
  };
}

Page({
  data: {
    contracts: [],
    activeTab: 'all', // 'all' | 'housekeeping' | 'training'
    loading: true,
    empty: false,
    needRelogin: false,
  },

  // 计算属性：filteredContracts
  onLoad(options) {
    // 分享卡片进入：detailId + signUrl → 自动 navigateTo 详情页
    if (options && options.detailId) {
      const params = [`id=${encodeURIComponent(options.detailId)}`];
      if (options.orderCategory) params.push(`orderCategory=${encodeURIComponent(options.orderCategory)}`);
      // signUrl 已在 shareAppMessage 端 encode 过，小程序 runtime decode 后直接透传，不再 encode
      if (options.signUrl) params.push(`signUrl=${options.signUrl}`);
      if (options.signTitle) params.push(`signTitle=${encodeURIComponent(options.signTitle)}`);
      if (options.inviteRole) params.push(`inviteRole=${encodeURIComponent(options.inviteRole)}`);
      if (options.phone) params.push(`phone=${encodeURIComponent(options.phone)}`);
      wx.navigateTo({ url: `/pages/myContracts/detail?${params.join('&')}` });
      return;
    }
    this.loadContracts();
  },

  onPullDownRefresh() {
    this.loadContracts().then(() => wx.stopPullDownRefresh());
  },

  // Tab 切换
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab }, () => {
      // setData callback：保证 filteredContracts 重新计算
      this.applyFilter();
    });
  },

  async loadContracts() {
    this.setData({ loading: true, needRelogin: false });
    try {
      const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      const phone = crmUserInfo.phone;
      if (!phone) {
        this.setData({ loading: false, needRelogin: true });
        return;
      }

      // 并行调两个公开接口：家政合同 + 职培订单（都按 phone 匹配）
      const [hkResp, trResp] = await Promise.all([
        publicRequest({ url: '/contracts/by-staff', method: 'GET', data: { phone } })
          .catch(() => ({ success: false, data: { items: [] } })),
        publicRequest({ url: '/training-orders/by-customer', method: 'GET', data: { phone } })
          .catch(() => ({ success: false, data: { items: [] } })),
      ]);

      // 同一份合同 by-staff 和 by-customer 可能同时返回 → 按 _id 去重，training 优先（职培数据更精确）
      const seen = new Set();
      const merged = [];
      for (const raw of [...extractItems(trResp), ...extractItems(hkResp)]) {
        const id = raw._id || raw.contractNumber;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(raw);
      }
      const contracts = merged
        .map(mapContract)
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .map((c, idx) => ({ ...c, _sortIdx: idx }));

      // 计算 filteredContracts（默认 all = 全部；其他 tab 客户端过滤）
      this.setData({ contracts, empty: contracts.length === 0 }, () => {
        this.applyFilter();
      });
    } catch (e) {
      console.error('load myContracts failed:', e.message);
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
      this.setData({ empty: true });
    } finally {
      this.setData({ loading: false });
    }
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    const orderCategory = e.currentTarget.dataset.ordercategory;
    wx.navigateTo({
      url: `/pages/myContracts/detail?id=${id}&orderCategory=${orderCategory}`,
    });
  },

  // 客户端过滤：按 activeTab 切 filteredContracts
  applyFilter() {
    const { contracts, activeTab } = this.data;
    const filtered = activeTab === 'all'
      ? contracts
      : contracts.filter(c => c.orderCategory === activeTab);
    this.setData({
      filteredContracts: filtered,
      empty: filtered.length === 0,
    });
  },
});
