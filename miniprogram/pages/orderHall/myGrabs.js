const orderHallService = require('../../services/orderHall.js');

// 与 接单大厅列表 / 订单详情 统一文案
const STATUS_MAP = {
  pending:   { text: '抢单中', color: '#f5572b' },
  accepted:  { text: '已录用', color: '#27ae60' },
  rejected:  { text: '未录用', color: '#e74c3c' },
  cancelled: { text: '已取消', color: '#999'    },
};

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

function fmtDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day} ${hh}:${mm}`;
}

// 与列表页保持一致的薪资格式化
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

Page({
  data: {
    loading: true,
    list: [],
    stats: { total: 0, accepted: 0, pending: 0 },
    hasIdentifier: true,
  },

  onShow() {
    this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    const openid = wx.getStorageSync('openid') || '';
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    // 抢单时刚刚提交的手机号也作为兜底身份（首次抢单用户尚未登录 CRM 的场景）
    const phone = crmUserInfo.phone || wx.getStorageSync('orderHall_lastPhone') || '';

    if (!openid && !phone) {
      this.setData({ loading: false, hasIdentifier: false, list: [] });
      return;
    }

    try {
      const res = await orderHallService.getMyGrabs({ openid, phone, pageSize: 50 });
      if (!res || !res.success) {
        wx.showToast({ title: (res && res.message) || '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      // 后端响应形态可能为 data:[...]（扁平数组）或 data:{items|list:[...]}（包裹对象）
      const d = res.data;
      const raw = Array.isArray(d) ? d : ((d && (d.items || d.list)) || []);

      // item.order 可能为对象或字符串 ID；提取统一的订单 ID
      const pickOrderId = (it) => {
        const o = it.order;
        if (typeof o === 'string') return o;
        if (o && typeof o === 'object') return o._id || o.id || '';
        return it.orderId || '';
      };
      // 抢单记录可能不带完整订单信息（仅 orderId + 状态），按 orderId 拉取详情合并展示
      const detailCache = {};
      const idsToFetch = Array.from(new Set(raw.map(it => {
        const o = (it.order && typeof it.order === 'object') ? it.order : {};
        const id = pickOrderId(it);
        const hasRich = o.salaryBudget || o.workContent || o.serviceTypeLabel;
        return id && !hasRich ? id : '';
      }).filter(Boolean)));
      await Promise.all(idsToFetch.map(async (oid) => {
        try {
          const r = await orderHallService.getOrderDetail(oid);
          if (r && r.success && r.data) detailCache[oid] = r.data;
        } catch (_) { /* 忽略单条详情失败，不影响整体列表 */ }
      }));

      const list = raw.map(item => {
        const rawOrder = (item.order && typeof item.order === 'object') ? item.order : {};
        const oid = pickOrderId(item);
        const order = Object.assign({}, detailCache[oid] || {}, rawOrder);
        const serviceType = order.serviceType || item.serviceType || '';
        const statusInfo = STATUS_MAP[item.status] || { text: item.status || '', color: '#999' };
        return {
          _id: item._id || item.id,
          orderId: oid,
          orderTitle: order.title || item.orderTitle || item.title || '订单',
          serviceTypeLabel: order.serviceTypeLabel || item.serviceTypeLabel || SERVICE_TYPE_MAP[serviceType] || serviceType || '',
          area: order.area || item.area || '',
          salaryText: fmtSalary(order),
          workContent: order.workContent || order.requirement || '',
          status: item.status,
          statusText: statusInfo.text,
          statusColor: statusInfo.color,
          createdAtText: fmtDate(item.createdAt || item.grabbedAt),
        };
      });

      const stats = {
        total: list.length,
        accepted: list.filter(i => i.status === 'accepted').length,
        pending: list.filter(i => i.status === 'pending').length,
      };

      this.setData({ loading: false, list, stats, hasIdentifier: true });
    } catch (e) {
      console.error('[orderHall/myGrabs] 加载失败:', e);
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '网络异常', icon: 'none' });
    }
  },

  async onPullDownRefresh() {
    await this.loadList();
    wx.stopPullDownRefresh();
  },

  goDetail(e) {
    const orderId = e.currentTarget.dataset.orderid;
    if (!orderId) return;
    wx.navigateTo({ url: `/pages/orderHall/detail?id=${orderId}` });
  },

  goHall() {
    wx.switchTab({ url: '/pages/orderHall/index' });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' });
  },
});
