const orderHallService = require('../../services/orderHall.js');
const { ensureStaffIdentity } = require('../../utils/staffIdentity.js');

const POSTER_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得褓贝定稿.png';

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
    isStaff: false,        // 员工身份标志
    posterGenerating: false,
  },

  onLoad(options) {
    const id = options && options.id;
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.setData({ id });
    this.loadDetail();
    this.checkStaffRole();
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

  // ── 员工身份检测 ──────────────────────────────────────────────
  async checkStaffRole() {
    try {
      const isStaff = await ensureStaffIdentity();
      if (isStaff !== this.data.isStaff) this.setData({ isStaff });
    } catch (e) {
      console.warn('[orderHall/detail] checkStaffRole 失败:', e && e.message);
    }
  },

  // ── 转发订单（open-type="share" 按钮回调）────────────────────
  onShareAppMessage() {
    const order = this.data.order || {};
    const id    = this.data.id || '';
    const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
    const staffId    = String(crmUserInfo._id || crmUserInfo.id || crmUserInfo.userId || wx.getStorageSync('userId') || '');
    const staffPhone = crmUserInfo.phone || wx.getStorageSync('userPhone') || '';
    const idParam    = staffId    ? `&sharerId=${encodeURIComponent(staffId)}`    : '';
    const phoneParam = staffPhone ? `&p=${encodeURIComponent(staffPhone)}`        : '';
    return {
      title: `${order.serviceTypeLabel || '家政订单'} ${order.salaryText || ''} | 安得褓贝接单大厅`,
      path: `/pages/orderHall/detail?id=${id}&shared=1${idParam}${phoneParam}`,
      imageUrl: '',   // 默认截图
    };
  },

  // ── 生成订单海报 ──────────────────────────────────────────────
  onGenerateOrderPoster() {
    if (this.data.posterGenerating) return;
    const order = this.data.order;
    if (!order) return;
    this._doGenerateOrderPoster(order);
  },

  async _doGenerateOrderPoster(order) {
    this.setData({ posterGenerating: true });
    wx.showLoading({ title: '生成海报中...' });
    try {
      const crmUserInfo  = wx.getStorageSync('crmUserInfo') || {};
      const staffId      = String(crmUserInfo._id || crmUserInfo.id || crmUserInfo.userId || wx.getStorageSync('userId') || '');
      const staffPhone   = crmUserInfo.phone || wx.getStorageSync('userPhone') || '';
      const staffName    = crmUserInfo.crmName || crmUserInfo.name || crmUserInfo.nickname || '';

      const [qrLocalPath, logoLocalPath] = await Promise.all([
        this._getOrderMiniCodePath(order._id, staffId, staffPhone),
        this._downloadImage(POSTER_LOGO_FILE_ID),
      ]);

      const posterPath = await this._drawOrderPosterCanvas(order, qrLocalPath, logoLocalPath, staffName, staffPhone);
      wx.hideLoading();
      wx.showShareImageMenu({
        path: posterPath,
        fail: () => wx.saveImageToPhotosAlbum({
          filePath: posterPath,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
          fail:    () => wx.showToast({ title: '请长按图片保存', icon: 'none' }),
        }),
      });
    } catch (err) {
      console.error('[orderHall/detail] 生成海报失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '海报生成失败', icon: 'none' });
    } finally {
      this.setData({ posterGenerating: false });
    }
  },

  // 调云函数生成订单详情页小程序码，返回本地路径（失败返回空串）
  async _getOrderMiniCodePath(orderId, staffId, staffPhone) {
    if (!orderId) return '';
    try {
      const cfRes = await wx.cloud.callFunction({
        name: 'quickstartFunctions',
        data: { type: 'getOrderDetailMiniCode', orderId, staffId: staffId || '', staffPhone: staffPhone || '' },
      });
      const fileID = cfRes && cfRes.result && cfRes.result.fileID;
      if (!fileID) return '';
      const tempRes = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      const tempUrl = tempRes && tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL;
      if (!tempUrl) return '';
      return await this._downloadImage(tempUrl);
    } catch (err) {
      console.warn('[orderHall/detail] 获取小程序码失败，海报将跳过二维码:', err);
      return '';
    }
  },

  // 下载图片到本地（兼容 cloud:// 和 https）
  async _downloadImage(url) {
    if (!url) return '';
    try {
      if (url.startsWith('cloud://')) {
        const res = await wx.cloud.downloadFile({ fileID: url });
        return res.tempFilePath;
      }
      return await new Promise((resolve, reject) => {
        wx.downloadFile({ url, success: r => resolve(r.tempFilePath), fail: reject });
      });
    } catch (e) {
      console.warn('[orderHall/detail] 图片下载失败:', e && e.message);
      return '';
    }
  },

  // Canvas 绘制订单海报（深紫渐变背景 + 内容信息 + 顾问区 + QR）
  _drawOrderPosterCanvas(order, qrLocalPath, logoLocalPath, staffName, staffPhone) {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().in(this).select('#orderPosterCanvas')
        .fields({ node: true, size: true })
        .exec(async (res) => {
          try {
            const canvas = res[0] && res[0].node;
            if (!canvas) return reject(new Error('Canvas \u672a\u627e\u5230'));
            const ctx = canvas.getContext('2d');
            const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
            const W = 375, H = 600; // \u9ad8\u5ea6\u4ece 640 \u7f29\u5c0f\u5230 600\uff0c\u66f4\u9002\u5408\u670b\u53cb\u5708\u5c55\u793a
            canvas.width  = W * dpr;
            canvas.height = H * dpr;
            ctx.scale(dpr, dpr);

            // \u2500\u2500 \u8f85\u52a9\uff1a\u5706\u89d2\u77e9\u5f62\u8def\u5f84 \u2500\u2500
            const rrp = (x, y, w, h, r) => {
              ctx.beginPath();
              ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
              ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
              ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
              ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r);
              ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
            };

            // \u2500\u2500 \u8f85\u52a9\uff1a\u81ea\u52a8\u6362\u884c\u7ed8\u5236\u6587\u5b57\uff0c\u8fd4\u56de\u5b9e\u9645\u884c\u6570 \u2500\u2500
            const drawWrapped = (text, x, y, maxW, lineH, maxLines) => {
              const chars = text.split('');
              let line = '', count = 0;\n              for (const ch of chars) {
                const test = line + ch;
                if (ctx.measureText(test).width > maxW) {
                  if (count >= maxLines - 1) {
                    while (ctx.measureText(line + '\u2026').width > maxW && line.length) line = line.slice(0, -1);
                    ctx.fillText(line + '\u2026', x, y + count * lineH);
                    return maxLines;
                  }
                  ctx.fillText(line, x, y + count * lineH);
                  count++;
                  line = ch;
                } else { line = test; }
              }
              if (line) { ctx.fillText(line, x, y + count * lineH); count++; }
              return count;
            };

            // \u2500\u2500 Layer 1: \u6df1\u7d2b\u6e10\u53d8\u80cc\u666f \u2500\u2500
            const bg = ctx.createLinearGradient(0, 0, 0, H);
            bg.addColorStop(0, '#1a0533');
            bg.addColorStop(0.45, '#2d1060');
            bg.addColorStop(1, '#0f0520');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);

            // \u88c5\u9970\u5149\u6655\u5706
            ctx.beginPath(); ctx.arc(W + 20, -20, 130, 0, Math.PI * 2);\n            ctx.fillStyle = 'rgba(135,102,243,0.18)'; ctx.fill();
            ctx.beginPath(); ctx.arc(-30, H - 50, 100, 0, Math.PI * 2);\n            ctx.fillStyle = 'rgba(135,102,243,0.12)'; ctx.fill();

            // \u2500\u2500 Layer 2: Logo \u2500\u2500
            if (logoLocalPath) {
              const logoImg = canvas.createImage();
              logoImg.src = logoLocalPath;
              await new Promise(r => { logoImg.onload = r; logoImg.onerror = r; });
              ctx.drawImage(logoImg, W - 80, 10, 70, 70);\n            }

            // \u2500\u2500 Layer 3: \u54c1\u724c\u6587\u5b57 \u2500\u2500
            ctx.textBaseline = 'top';
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = 'bold 22px sans-serif'; // 18 -> 22
            ctx.fillText('\u5b89\u5f97\u8913\u8d1d', 20, 20);
            ctx.fillStyle = 'rgba(200,169,110,0.85)';
            ctx.font = '13px sans-serif'; // 11 -> 13
            ctx.fillText('\u63a5\u5355\u5927\u5385 \u00b7 \u4f18\u8d28\u8ba2\u5355', 20, 52);

            // \u2500\u2500 Layer 4: \u5de5\u79cd\u80f6\u56ca + \u85aa\u8d44 \u2500\u2500
            const TYPE_Y = 90;
            const typeLabel = order.serviceTypeLabel || '';
            if (typeLabel) {
              ctx.font = 'bold 15px sans-serif'; // 13 -> 15
              const tw = ctx.measureText(typeLabel).width;
              rrp(20, TYPE_Y, tw + 26, 32, 16);
              ctx.fillStyle = '#8766F3'; ctx.fill();
              ctx.fillStyle = '#fff';
              ctx.textBaseline = 'middle';
              ctx.fillText(typeLabel, 33, TYPE_Y + 16 + 1);
            }
            if (order.salaryText) {
              ctx.fillStyle = '#C8A96E';
              ctx.font = 'bold 30px sans-serif'; // 26 -> 30
              ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
              ctx.fillText(order.salaryText, W - 20, TYPE_Y + 16);
              ctx.textAlign = 'left';
            }

            // \u2500\u2500 Layer 5: \u5173\u952e\u4fe1\u606f\u4e09\u683c \u2500\u2500
            const INFO_Y = 150;
            ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(20, INFO_Y - 15); ctx.lineTo(W - 20, INFO_Y - 15); ctx.stroke();

            const infoItems = [\n              { label: '\u4e0a\u6237\u65f6\u95f4', value: order.expectedStartText || order.dueDateText || '--' },\n              { label: '\u670d\u52a1\u5468\u671f', value: order.serviceDaysText  || '--' },\n              { label: '\u5730\u533a',     value: order.area             || '--' },\n            ];
            const colW = (W - 40) / 3;
            ctx.textBaseline = 'top';
            infoItems.forEach((item, i) => {\n              const cx = 20 + colW * i;
              ctx.fillStyle = '#C8A96E';
              ctx.font = 'bold 16px sans-serif'; // 13 -> 16
              ctx.fillText(item.value.slice(0, 8), cx, INFO_Y);
              ctx.fillStyle = 'rgba(255,255,255,0.6)'; // 0.45 -> 0.6
              ctx.font = '13px sans-serif'; // 11 -> 13
              ctx.fillText(item.label, cx, INFO_Y + 24);
            });

            ctx.strokeStyle = 'rgba(255,255,255,0.15)';\n            ctx.beginPath(); ctx.moveTo(20, INFO_Y + 55); ctx.lineTo(W - 20, INFO_Y + 55); ctx.stroke();

            // \u2500\u2500 Layer 6: \u7528\u6237\u8981\u6c42 \u2500\u2500
            let curY = INFO_Y + 70;
            if (order.requirementsList && order.requirementsList.length) {
              ctx.fillStyle = 'rgba(255,255,255,0.6)';
              ctx.font = '13px sans-serif'; ctx.textBaseline = 'top'; // 11 -> 13
              ctx.fillText('\u7528\u6237\u8981\u6c42', 20, curY);
              curY += 22;
              const rColW = (W - 40) / 2;
              order.requirementsList.slice(0, 6).forEach((req, i) => {\n                const col = i % 2, row = Math.floor(i / 2);\n                const rx = 20 + col * rColW;\n                const ry = curY + row * 26;\n                ctx.fillStyle = 'rgba(255,255,255,0.5)';\n                ctx.font = '14px sans-serif'; ctx.textBaseline = 'top';\n                ctx.fillText(req.label, rx, ry);\n                const lw = ctx.measureText(req.label).width + 8;\n                ctx.fillStyle = 'rgba(255,255,255,0.95)';\n                ctx.fillText(req.value, rx + lw, ry);\n              });
              const reqRows = Math.ceil(Math.min(order.requirementsList.length, 6) / 2);\n              curY += reqRows * 26 + 18;\n            }

            // \u2500\u2500 Layer 7: \u5de5\u4f5c\u5185\u5bb9 \u2500\u2500
            if (order.workContent) {
              ctx.fillStyle = 'rgba(255,255,255,0.6)';
              ctx.font = '13px sans-serif'; ctx.textBaseline = 'top'; // 11 -> 13
              ctx.fillText('\u5de5\u4f5c\u5185\u5bb9', 20, curY);
              curY += 22;
              ctx.fillStyle = 'rgba(255,255,255,0.9)';
              ctx.font = '15px sans-serif'; // 13 -> 15
              const lc = drawWrapped(order.workContent, 20, curY, W - 40, 22, 3);
            }

            // \u2500\u2500 Layer 8: \u5e95\u90e8\u987e\u95ee\u533a \u2500\u2500
            const SEP_Y = 450; // 480 -> 450
            ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(16, SEP_Y); ctx.lineTo(W - 16, SEP_Y); ctx.stroke();

            // QR \u767d\u5361\uff08\u53f3\u4fa7\uff09
            const QW = 85, QH = 85;
            const QX = W - QW - 20;
            const QY = SEP_Y + (H - SEP_Y - QH) / 2 - 10;
            rrp(QX, QY, QW, QH, 10);
            ctx.fillStyle = '#fff'; ctx.fill();
            if (qrLocalPath) {
              const qrImg = canvas.createImage();
              qrImg.src = qrLocalPath;
              await new Promise(r => { qrImg.onload = r; qrImg.onerror = r; });
              ctx.save();
              rrp(QX + 6, QY + 6, QW - 12, QH - 12, 5);
              ctx.clip();
              ctx.drawImage(qrImg, QX + 6, QY + 6, QW - 12, QH - 12);
              ctx.restore();
            }
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            ctx.fillText('\u626b\u7801\u62a2\u5355', QX + QW / 2, QY + QH + 6);
            ctx.textAlign = 'left';

            // \u987e\u95ee\u59d3\u540d + \u7535\u8bdd + slogan\uff08\u5de6\u4fa7\uff09
            const staffMidY = SEP_Y + (H - SEP_Y) / 2 - 5;
            ctx.fillStyle = '#C8A96E';
            ctx.font = 'bold 18px sans-serif'; ctx.textBaseline = 'middle'; // 15 -> 18
            ctx.fillText('\u987e\u95ee\uff1a' + (staffName || '\u5b89\u5f97\u8913\u8d1d'), 20, staffMidY - 20);
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.font = '14px sans-serif'; // 12 -> 14
            ctx.fillText(staffPhone || '', 20, staffMidY + 6);
            ctx.fillStyle = 'rgba(200,169,110,0.6)';
            ctx.font = 'italic 12px sans-serif'; // 11 -> 12
            ctx.fillText('\u4e3a\u7231\uff0c\u5168\u529b\u4ee5\u8d74\uff01', 20, staffMidY + 30);


            // ── 导出 ──
            wx.canvasToTempFilePath({
              canvas, fileType: 'jpg', quality: 0.95,
              success: r => resolve(r.tempFilePath),
              fail: err => reject(new Error(err.errMsg || '导出失败')),
            });
          } catch (err) { reject(err); }
        });
    });
  },
});
