const orderHallService = require('../../services/orderHall.js');

// 工种筛选展示顺序（靠前优先，未列出的按原顺序排在后面）
const TYPE_ORDER = ['zhujia-yuer', 'yuesao', 'baiban-yuer'];
// 不在筛选中展示的工种
const TYPE_EXCLUDED = ['baojie', 'yangchong', 'hugong', 'jiajiao'];

// 按 TYPE_ORDER 重排并剔除 TYPE_EXCLUDED（不含「全部」，由调用处单独前置）
function curateTypes(types) {
  return (types || [])
    .filter(t => t && t.value && !TYPE_EXCLUDED.includes(t.value))
    .sort((a, b) => {
      const ra = TYPE_ORDER.indexOf(a.value);
      const rb = TYPE_ORDER.indexOf(b.value);
      return (ra === -1 ? TYPE_ORDER.length : ra) - (rb === -1 ? TYPE_ORDER.length : rb);
    });
}

// 兜底工种列表（CRM 不可达时使用，保持与 referralSubmit 一致）
const FALLBACK_BASE = [
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
const FALLBACK_SERVICE_TYPES = [{ value: '', label: '全部' }, ...curateTypes(FALLBACK_BASE)];

// 薪资区间选项
const SALARY_RANGES = [
  { value: '',        label: '全部',       min: 0,     max: 0     },
  { value: 'lt5000',  label: '5000以下',   min: 0,     max: 5000  },
  { value: '5k-10k',  label: '5000-10000', min: 5000,  max: 10000 },
  { value: '10k-20k', label: '1万-2万',    min: 10000, max: 20000 },
  { value: 'gt20000', label: '2万以上',    min: 20000, max: 0     },
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

// 提取订单发布人姓名：兼容后端多种可能字段名（字符串或 { name } 对象）
function pickPublisher(raw = {}) {
  const stringKeys = [
    'publisherName', 'publisher', 'creatorName', 'createdByName',
    'ownerName', 'staffName', 'consultantName', 'salesName',
    'publishUserName', 'createUserName',
  ];
  for (const key of stringKeys) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const objectKeys = ['publisher', 'creator', 'createdBy', 'owner', 'staff', 'consultant'];
  for (const key of objectKeys) {
    const o = raw[key];
    if (o && typeof o === 'object') {
      const name = o.name || o.nickname || o.realName || o.fullName;
      if (typeof name === 'string' && name.trim()) return name.trim();
    }
  }
  return '';
}

Page({
  data: {
    list: [],
    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    serviceTypes: FALLBACK_SERVICE_TYPES,
    // 三段筛选状态
    activeDropdown: '',
    filterPublisher: '',
    filterSalaryKey: '',
    filterSalaryLabel: '',
    filterServiceType: '',
    filterServiceTypeLabel: '',
    publisherOptions: [],
    salaryOptions: SALARY_RANGES,
    grabbedMap: {},
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
        if (st === 'accepted')  map[oid] = { text: '已录用',   tag: '已录用',   className: 'tag-accepted'  };
        else if (st === 'approved')  map[oid] = { text: '审核通过', tag: '审核通过', className: 'tag-approved'  };
        else if (st === 'rejected')  map[oid] = { text: '已拒绝',   tag: '已拒绝',   className: 'tag-rejected'  };
        else if (st === 'cancelled') map[oid] = { text: '已取消',   tag: '已取消',   className: 'tag-cancelled' };
        else map[oid] = { text: '审核中', tag: '审核中', className: 'tag-pending' };
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
        this.setData({ serviceTypes: [{ value: '', label: '全部' }, ...curateTypes(types)] });
      }
    } catch (e) {
      console.warn('[orderHall] 工种字典加载失败，使用兜底:', e);
    }
  },

  async reload() {
    // 请求序号：切换工种触发的新 reload 会作废仍在进行的旧请求结果
    const seq = (this._loadSeq = (this._loadSeq || 0) + 1);
    // 强制复位 loading，避免上一次 loadMore（上拉触底/进入页面）仍在进行时
    // 新筛选的 loadMore 被开头的 loading 守卫直接拦截，导致列表不按新工种刷新
    this.setData({ page: 1, list: [], hasMore: true, loading: false });
    // 先取一次已抢映射，loadMore 中按 _id 标记每张卡片
    const grabbedMap = await this.loadGrabbedMap();
    if (seq !== this._loadSeq) return;
    this.setData({ grabbedMap });
    await this.loadMore();
    if (seq !== this._loadSeq) return;
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
      publisherText: pickPublisher(it),
      grabCount: it.grabCount || 0,
      status: it.status,
      grabbedStatus: g ? g.text : '',
      grabbedTag: g ? g.tag : '',
      grabbedTagClass: g ? g.className : '',
    };
  },

  // 拉取已录用订单详情并置顶到列表（后端 /orders 仅返回 open 状态）
  async appendAcceptedOrders() {
    const { grabbedMap, list, filterServiceType } = this.data;
    const existingIds = new Set((list || []).map(it => it._id));
    const wantType = filterServiceType || '';
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
      const { page, pageSize, filterServiceType, filterPublisher, filterSalaryKey, salaryOptions } = this.data;
      const salaryRange = (salaryOptions || []).find(o => o.value === filterSalaryKey) || {};
      const params = { page, pageSize };
      if (filterServiceType) params.serviceType = filterServiceType;
      if (filterPublisher) params.publisherName = filterPublisher;
      if (salaryRange.min) params.salaryMin = salaryRange.min;
      if (salaryRange.max) params.salaryMax = salaryRange.max;
      const res = await orderHallService.getOrderList(params);
      // 请求期间筛选条件变化 → 丢弃过期结果
      if (this.data.filterServiceType !== filterServiceType
        || this.data.filterPublisher !== filterPublisher
        || this.data.filterSalaryKey !== filterSalaryKey) return;
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

      // 收集发布人选项（用于下拉筛选）
      const seen = new Set((this.data.publisherOptions || []).map(p => p.value));
      const toAdd = [...new Set(formatted.filter(it => it.publisherText).map(it => it.publisherText))]
        .filter(p => !seen.has(p))
        .map(p => ({ label: p, value: p }));
      if (toAdd.length) {
        this.setData({ publisherOptions: (this.data.publisherOptions || []).concat(toAdd) });
      }

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

  // 三段筛选下拉开关
  onToggleDropdown(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ activeDropdown: this.data.activeDropdown === type ? '' : type });
  },
  onCloseDropdown() {
    this.setData({ activeDropdown: '' });
  },
  onSelectPublisher(e) {
    const value = e.currentTarget.dataset.value;
    if (value === this.data.filterPublisher) { this.setData({ activeDropdown: '' }); return; }
    this.setData({ filterPublisher: value, activeDropdown: '' }, () => this.reload());
  },
  onSelectSalary(e) {
    const value = e.currentTarget.dataset.value;
    if (value === this.data.filterSalaryKey) { this.setData({ activeDropdown: '' }); return; }
    const opt = (this.data.salaryOptions || []).find(o => o.value === value) || {};
    this.setData({
      filterSalaryKey: value,
      filterSalaryLabel: value ? opt.label : '',
      activeDropdown: '',
    }, () => this.reload());
  },
  onSelectServiceType(e) {
    const value = e.currentTarget.dataset.value;
    if (value === this.data.filterServiceType) { this.setData({ activeDropdown: '' }); return; }
    const opt = (this.data.serviceTypes || []).find(t => t.value === value) || {};
    this.setData({
      filterServiceType: value,
      filterServiceTypeLabel: value ? opt.label : '',
      activeDropdown: '',
    }, () => this.reload());
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
