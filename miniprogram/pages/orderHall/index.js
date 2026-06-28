const orderHallService = require('../../services/orderHall.js');

// 兜底工种列表（CRM 不可达时使用，保持与 referralSubmit 一致）
const FALLBACK_SERVICE_TYPES = [
  { value: '',              label: '全部' },
  { value: 'yuesao',        label: '月嫂' },
  { value: 'zhujia-yuer',   label: '住家育儿嫂' },
  { value: 'baiban-yuer',   label: '白班育儿' },
  { value: 'baojie',        label: '保洁' },
  { value: 'baiban-baomu',  label: '白班保姆' },
  { value: 'zhujia-baomu',  label: '住家保姆' },
  { value: 'yangchong',     label: '养宠' },
  { value: 'xiaoshi',       label: '小时工' },
  { value: 'zhujia-hulao',  label: '住家护老' },
  { value: 'jiajiao',       label: '家教' },
  { value: 'peiban',        label: '陪伴师' },
];

function fmtSalary(raw) {
  if (!raw) return '面议';
  const salaryObj = typeof raw.salary === 'object' && raw.salary ? raw.salary : {};
  const budget = Number(raw.salaryBudget) || 0;
  const min = Number(raw.salaryMin ?? raw.salary_min ?? salaryObj.min ?? salaryObj.from) || 0;
  const max = Number(raw.salaryMax ?? raw.salary_max ?? salaryObj.max ?? salaryObj.to) || 0;
  if (min && max && min !== max) return `¥${min}~${max}/月`;
  const single = min || max || budget;
  if (single) return `¥${single}/月`;
  return raw.salaryRange || raw.salaryText || '面议';
}

function fmtDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

Page({
  data: {
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    serviceTypes: FALLBACK_SERVICE_TYPES,
    serviceTypeIndex: 0,
    grabbedMap: {},          // { [orderId]: statusText }，用于按钮文案
  },

  onLoad() {
    this.loadJobTypes();
    this.reload();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    // 抢单成功后返回首页时刷新"已抢"标记
    this.refreshGrabbedMap();
  },

  // 查询当前用户已抢订单的 ID→状态文案 映射
  async loadGrabbedMap() {
    const openid = wx.getStorageSync('openid') || '';
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const phone = crmUserInfo.phone || wx.getStorageSync('orderHall_lastPhone') || '';
    if (!openid && !phone) return {};
    try {
      const res = await orderHallService.getMyGrabs({ openid, phone, pageSize: 100 });
      if (!res || !res.success) return {};
      const d = res.data;
      const raw = Array.isArray(d) ? d : ((d && (d.items || d.list)) || []);
      const map = {};
      raw.forEach(it => {
        const o = it.order;
        const oid = it.orderId || (typeof o === 'string' ? o : (o && (o._id || o.id))) || '';
        if (!oid) return;
        const st = it.status;
        // text 用于底部按钮；tag 用于右上角角标；className 控制配色（与 detail/myGrabs 统一文案）
        if (st === 'accepted') map[oid] = { text: '已录用', tag: '已录用', className: 'tag-accepted' };
        else if (st === 'rejected') map[oid] = { text: '未录用', tag: '未录用', className: 'tag-rejected' };
        else if (st === 'cancelled') map[oid] = { text: '已取消', tag: '已取消', className: 'tag-cancelled' };
        else map[oid] = { text: '抢单中', tag: '抢单中', className: 'tag-pending' };
      });
      return map;
    } catch (_) {
      return {};
    }
  },

  // 拉最新的已抢映射并刷新当前 list 上的标记
  async refreshGrabbedMap() {
    const grabbedMap = await this.loadGrabbedMap();
    const list = (this.data.list || []).map(it => {
      const g = grabbedMap[it._id];
      return {
        ...it,
        grabbedStatus: g ? g.text : '',
        grabbedTag: g ? g.tag : '',
        grabbedTagClass: g ? g.className : '',
      };
    });
    this.setData({ grabbedMap, list });
    // 顺带补齐"已录用"订单（可能新成交）
    await this.appendAcceptedOrders();
  },

  async loadJobTypes() {
    try {
      const res = await orderHallService.getJobTypes();
      const types = (res && res.success && res.data) || [];
      if (Array.isArray(types) && types.length) {
        this.setData({ serviceTypes: [{ value: '', label: '全部' }, ...types] });
      }
    } catch (e) {
      console.warn('[orderHall] 工种字典加载失败，使用兜底:', e);
    }
  },

  async reload() {
    this.setData({ page: 1, list: [], hasMore: true });
    // 先取一次已抢映射，loadMore 中按 _id 标记每张卡片
    const grabbedMap = await this.loadGrabbedMap();
    this.setData({ grabbedMap });
    await this.loadMore();
    // 已录用订单后端会把状态改为 grabbed 从开放列表中剔除，需补齐展示
    await this.appendAcceptedOrders();
  },

  // 将卡片对象格式化为列表展示结构（同时附加已抢标记）
  _formatCard(it, grabbedMap) {
    const oid = it._id || it.id;
    const g = (grabbedMap || this.data.grabbedMap || {})[oid];
    return {
      _id: oid,
      orderNo: it.orderNo || '',
      title: it.title || '',
      serviceType: it.serviceType,
      serviceTypeLabel: it.serviceTypeLabel || this._labelOf(it.serviceType),
      salaryText: fmtSalary(it),
      area: it.area || '',
      workContent: it.workContent || '',
      expectedStartText: fmtDate(it.expectedStartDate),
      grabCount: it.grabCount || 0,
      status: it.status,
      grabbedStatus: g ? g.text : '',
      grabbedTag: g ? g.tag : '',
      grabbedTagClass: g ? g.className : '',
    };
  },

  // 拉取已录用订单详情并置顶到列表（后端 /orders 仅返回 open 状态）
  async appendAcceptedOrders() {
    const { grabbedMap, list, serviceTypes, serviceTypeIndex } = this.data;
    const existingIds = new Set((list || []).map(it => it._id));
    const wantType = (serviceTypes[serviceTypeIndex] && serviceTypes[serviceTypeIndex].value) || '';
    const acceptedIds = Object.keys(grabbedMap || {})
      .filter(oid => grabbedMap[oid] && grabbedMap[oid].text === '已录用' && !existingIds.has(oid));
    if (!acceptedIds.length) return;

    const details = await Promise.all(acceptedIds.map(async (oid) => {
      try {
        const r = await orderHallService.getOrderDetail(oid);
        return (r && r.success && r.data) ? r.data : null;
      } catch (_) { return null; }
    }));

    const extra = details
      .filter(Boolean)
      .filter(it => !wantType || it.serviceType === wantType)
      .map(it => this._formatCard(it, grabbedMap));
    if (!extra.length) return;
    this.setData({ list: extra.concat(this.data.list) });
  },

  async loadMore() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ loading: true });
    try {
      const { page, pageSize, serviceTypes, serviceTypeIndex } = this.data;
      const serviceType = serviceTypes[serviceTypeIndex]?.value || '';
      const res = await orderHallService.getOrderList({ page, pageSize, serviceType });
      if (!res || !res.success) {
        wx.showToast({ title: (res && res.message) || '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      const items = (res.data && (res.data.items || res.data.list)) || [];
      const total = (res.data && res.data.total) || 0;
      const totalPages = (res.data && res.data.totalPages) || 0;

      const grabbedMap = this.data.grabbedMap || {};
      const formatted = items.map(it => this._formatCard(it, grabbedMap));

      const hasMore = (total > 0 && totalPages > 0)
        ? page < totalPages
        : items.length >= pageSize;

      this.setData({
        list: this.data.list.concat(formatted),
        page: page + 1,
        hasMore,
      });
    } catch (e) {
      console.error('[orderHall] 加载订单列表失败:', e);
      wx.showToast({ title: e.message || '网络异常', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  _labelOf(value) {
    const item = (this.data.serviceTypes || []).find(t => t.value === value);
    return item ? item.label : (value || '');
  },

  onServiceTypeChange(e) {
    this.setData({ serviceTypeIndex: Number(e.detail.value) }, () => {
      this.reload();
    });
  },

  onReachBottom() {
    this.loadMore();
  },

  onPullDownRefresh() {
    this.reload().finally(() => wx.stopPullDownRefresh());
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/orderHall/detail?id=${id}` });
  },

  goMyGrabs() {
    wx.navigateTo({ url: '/pages/orderHall/myGrabs' });
  },
});
