const orderHallService = require('../../services/orderHall.js');

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

const STATUS_MAP = {
  draft:     '草稿',
  open:      '招募中',
  grabbed:   '已录用',
  closed:    '已结束',
  cancelled: '已下架',
};

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
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// 与 接单大厅列表 / 我的抢单 统一文案
const GRAB_STATUS_TEXT = {
  pending:   '审核中',
  approved:  '审核通过',
  accepted:  '已录用',
  rejected:  '已拒绝',
  cancelled: '已取消',
};

Page({
  data: {
    id: '',
    loading: true,
    order: null,
    myGrab: null,          // 当前用户对该订单的抢单记录
    btnText: '立即抢单',
    btnDisabled: false,
  },

  onLoad(options) {
    const id = options && options.id;
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.setData({ id });
    this.loadDetail();
  },

  // 进入页面 / 抢单返回时刷新已抢状态
  onShow() {
    if (this.data.id && this.data.order) {
      this.checkMyGrab();
    }
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const res = await orderHallService.getOrderDetail(this.data.id);
      if (!res || !res.success || !res.data) {
        wx.showToast({ title: (res && res.message) || '加载失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }
      const raw = res.data;
      const requirements = raw.requirements || {};
      const reqList = [];
      if (requirements.age) reqList.push({ label: '年龄', value: String(requirements.age) });
      if (requirements.gender) reqList.push({ label: '性别', value: requirements.gender });
      if (requirements.origin) reqList.push({ label: '籍贯偏好', value: requirements.origin });
      if (requirements.education) reqList.push({ label: '学历', value: requirements.education });
      if (requirements.rest) reqList.push({ label: '休息', value: requirements.rest });
      if (requirements.houseArea) reqList.push({ label: '户型', value: `${requirements.houseArea}㎡` });
      if (requirements.servicePeriod) reqList.push({ label: '服务周期', value: requirements.servicePeriod });
      // 兼容旧字段（如果 CRM 后续扩展）
      if (requirements.nativePlace) reqList.push({ label: '籍贯', value: requirements.nativePlace });
      if (requirements.experience) reqList.push({ label: '经验', value: requirements.experience });

      const babyCount = raw.babyCount != null ? raw.babyCount : (requirements.babyCount != null ? requirements.babyCount : '');
      const serviceDays = raw.serviceDays || requirements.serviceDays || '';

      this.setData({
        loading: false,
        order: {
          _id: raw._id || raw.id,
          orderNo: raw.orderNo || '',
          title: raw.title || '家政服务订单',
          serviceType: raw.serviceType,
          serviceTypeLabel: raw.serviceTypeLabel || SERVICE_TYPE_MAP[raw.serviceType] || raw.serviceType || '',
          salaryText: fmtSalary(raw),
          area: raw.area || '',
          // 详情页脱敏：address 后端按城市/商圈粒度下发即可，这里只展示
          address: raw.address || '',
          workContent: raw.workContent || '',
          workTime: raw.workTime || '',
          remark: raw.remark || raw.note || '',
          babyCountText: babyCount !== '' && babyCount !== null ? `${babyCount}人` : '',
          dueDateText: fmtDate(raw.dueDate),
          serviceDaysText: serviceDays ? (String(serviceDays).indexOf('天') >= 0 ? String(serviceDays) : `${serviceDays}天`) : '',
          expectedStartText: fmtDate(raw.expectedStartDate),
          publishedAtText: fmtDate(raw.publishedAt),
          grabCount: raw.grabCount || 0,
          status: raw.status,
          statusText: STATUS_MAP[raw.status] || raw.status || '',
          requirementsList: reqList,
        },
      });
      // 订单加载完毕后查询用户是否已抢过此单
      await this.checkMyGrab();
    } catch (e) {
      console.error('[orderHall/detail] 加载失败:', e);
      wx.showToast({ title: e.message || '网络异常', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 查询当前用户对该订单的抢单状态，刷新底部按钮文案
  async checkMyGrab() {
    const order = this.data.order;
    if (!order || !order._id) return;
    const openid = wx.getStorageSync('openid') || '';
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const phone = crmUserInfo.phone || wx.getStorageSync('orderHall_lastPhone') || '';
    if (!openid && !phone) {
      this.refreshBtn(null);
      return;
    }
    try {
      const res = await orderHallService.getMyGrabs({ openid, phone, pageSize: 100 });
      if (!res || !res.success) { this.refreshBtn(null); return; }
      const d = res.data;
      const list = Array.isArray(d) ? d : ((d && (d.items || d.list)) || []);
      const hit = list.find(it => {
        const o = it.order;
        const oid = it.orderId || (typeof o === 'string' ? o : (o && (o._id || o.id))) || '';
        return oid === order._id;
      }) || null;
      this.refreshBtn(hit);
    } catch (_) {
      this.refreshBtn(null);
    }
  },

  refreshBtn(myGrab) {
    const order = this.data.order;
    if (!order) return;
    let btnText = '立即抢单';
    let btnDisabled = false;
    if (myGrab) {
      btnText = GRAB_STATUS_TEXT[myGrab.status] || '已抢单';
      btnDisabled = true;
    } else if (order.status !== 'open') {
      btnText = '订单已结束';
      btnDisabled = true;
    }
    this.setData({ myGrab, btnText, btnDisabled });
  },

  goGrab() {
    const order = this.data.order;
    if (!order) return;
    if (this.data.myGrab) {
      wx.showToast({ title: '您已抢过此单，请等待顾问联系', icon: 'none' });
      return;
    }
    if (order.status !== 'open') {
      wx.showToast({ title: '订单已结束，无法抢单', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/orderHall/grab?orderId=${order._id}&serviceType=${encodeURIComponent(order.serviceType || '')}&title=${encodeURIComponent(order.title || '')}`,
    });
  },
});
