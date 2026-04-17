/** 签约状态 → ASCII CSS 类名（WeChat WXSS 不支持中文选择器） */
const STATUS_CLASS = {
  '已签约':   'contracted',
  '签约中':   'contracting',
  '匹配中':   'matching',
  '已面试':   'interviewed',
  '流失客户': 'lost',
};

/** 手机号脱敏：保留前3位和后4位 */
function maskPhone(phone) {
  if (!phone) return '';
  const s = String(phone);
  if (s.length < 7) return s;
  return s.slice(0, 3) + '****' + s.slice(-4);
}

/** 格式化单条客户数据，补充脱敏手机号和 CSS 类名 */
function formatItem(item) {
  return {
    ...item,
    needs: item.needs || {},
    phoneMasked: maskPhone(item.phone),
    statusClass: STATUS_CLASS[item.contractStatus] || 'default',
  };
}

let _searchTimer = null;  // 搜索防抖定时器

Page({
  data: {
    keyword: '',
    list: [],
    total: 0,
    page: 1,
    hasMore: false,
    loading: false,
    loadingMore: false,
    loadError: '',   // 'auth' | ''
  },

  onLoad() {
    this.loadList(1, '');
  },

  /** 拉取客户列表 */
  async loadList(page, search) {
    const isFirst = page === 1;
    this.setData(isFirst ? { loading: true } : { loadingMore: true });

    try {
      const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
      const phone = crmUserInfo.phone || '';

      const res = await wx.cloud.callFunction({
        name: 'baobei',
        data: {
          action: 'getCustomerList',
          phone,
          page,
          limit: 20,
          search: search || undefined,
        },
      });

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.errMsg || '云函数调用失败');
      }

      const resData = res.result.data || {};
      const raw = resData.customers || [];
      const items = raw.map(formatItem);
      const total = resData.total || 0;
      const totalPages = resData.totalPages || 1;

      this.setData({
        list: isFirst ? items : [...this.data.list, ...items],
        total,
        page,
        hasMore: page < totalPages,
        loading: false,
        loadingMore: false,
      });
    } catch (err) {
      console.error('加载客户列表失败:', err);
      this.setData({ loading: false, loadingMore: false, loadError: '' });
      wx.showToast({ title: err.message || '加载失败，请重试', icon: 'none' });
    }
  },

  /** 搜索输入（防抖 500ms） */
  onSearch(e) {
    const keyword = e.detail.value;
    this.setData({ keyword });
    if (_searchTimer) clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      this.loadList(1, keyword.trim());
    }, 500);
  },

  /** 加载更多 */
  loadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return;
    this.loadList(this.data.page + 1, this.data.keyword.trim());
  },

  /** 点击客户卡片 → 跳转到海报生成页（携带客户信息） */
  onTapCustomer(e) {
    const { id, item } = e.currentTarget.dataset;
    // 用 Storage 传完整 needs（避免 URL 对长文本工作内容/备注的限制）
    wx.setStorageSync('pendingPosterCustomer', {
      id,
      name:           item.name || '',
      needs:          item.needs || {},
    });
    wx.navigateTo({ url: `/pages/poster/index?customerId=${id}` });
  },

  onPullDownRefresh() {
    this.loadList(1, this.data.keyword.trim()).then(() => {
      wx.stopPullDownRefresh();
    });
  },
});
