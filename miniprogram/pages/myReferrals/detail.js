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

const STATUS_MAP = {
  pending: '待审核', pending_review: '待审核', rejected: '审核未通过',
  following_up: '推荐中', contracted: '已签单',
  onboarded: '已上户', reward_pending: '返费待审核',
  reward_approved: '返费待打款', reward_paid: '返费已打款', invalid: '未录用',
};
const CONTRACTED_STATUSES = ['contracted','onboarded','reward_pending','reward_approved','reward_paid'];

function fmtDate(val) {
  if (!val) return '';
  const d = new Date(val);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function maskName(name) {
  if (!name) return '';
  return name.length <= 1 ? name : name[0] + '*'.repeat(Math.min(name.length - 1, 2));
}
function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || '';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}
function daysSince(dateVal) {
  if (!dateVal) return null;
  return Math.floor((Date.now() - new Date(dateVal).getTime()) / (1000 * 86400));
}

Page({
  data: {
    loading: true,
    detail: {},
    // 申请结算弹窗
    settlementVisible:    false,
    settlementForm:       { idCard: '', payeeName: '', payeePhone: '', bankCard: '', bankName: '' },
    settlementSubmitting: false,
  },

  async onLoad(options) {
    const { id } = options;
    if (!id) { wx.navigateBack(); return; }
    await this.loadDetail(id);
  },

  async loadDetail(id) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'referralService',
        data: { action: 'getReferralDetail', id },
      });
      const raw = res.result && res.result.data;
      if (!raw) { wx.showToast({ title: '记录不存在', icon: 'none' }); wx.navigateBack(); return; }

      const isContracted = CONTRACTED_STATUSES.includes(raw.status);
      const isRejected   = raw.status === 'rejected' || raw.statusLabel === '审核未通过' || raw.status === '审核未通过';
      const onboardedDays = raw.onboardedAt ? daysSince(raw.onboardedAt) : null;

      // 合同记录字段处理
      const c = raw.contract || {};
      const contractPeriod = (c.contractStartDate && c.contractEndDate)
        ? `${fmtDate(c.contractStartDate)} 至 ${fmtDate(c.contractEndDate)}`
        : (c.contractPeriod || '');

      // 工种中文文案（CRM 返回英文 key，本地 map 转中文；原值作兜底）
      const stLabel = t => SERVICE_TYPE_MAP[t] || t || '';

      this.setData({
        loading: false,
        detail: {
          ...raw,
          maskedName:          maskName(raw.name),
          maskedPhone:         maskPhone(raw.phone),
          statusText:          raw.statusLabel || STATUS_MAP[raw.status] || raw.status,
          serviceTypeText:     stLabel(raw.serviceType),
          isContracted,
          isRejected,
          onboardedDays,
          createdAtFmt:        fmtDate(raw.createdAt),
          contractedAtFmt:     fmtDate(raw.contractSignedAt),
          onboardedAtFmt:      fmtDate(raw.onboardedAt),
          rewardExpectedAtFmt: fmtDate(raw.rewardExpectedAt),
          rewardPaidAtFmt:     fmtDate(raw.rewardPaidAt),
          // 合同记录
          contract: {
            orderNumber:    c.orderNumber    || '',
            orderType:      stLabel(c.orderType || raw.serviceType),
            serviceFee:     c.serviceFee     != null ? c.serviceFee : '',
            onboardDate:    fmtDate(c.onboardDate || c.contractStartDate),
            nannySalary:    c.nannySalary    != null ? c.nannySalary : '',
            contractPeriod,
            createdByName:  c.createdByName  || '',
            rewardAmount:   c.rewardAmount   != null ? c.rewardAmount : '',  // 预计返费（服务费×10%，由CRM计算返回）
          },
        },
      });
    } catch (e) {
      console.error('加载推荐详情失败:', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // ── 申请结算 ──────────────────────────────────────────────

  /** 打开申请结算弹窗，预填推荐官姓名和手机号 */
  async onOpenSettlement() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'referralService',
        data: { action: 'getReferrerInfo' },
      });
      const info = (res.result && res.result.data) || {};
      this.setData({
        settlementVisible: true,
        settlementForm: {
          idCard:     info.idCard || '',
          payeeName:  info.name  || '',
          payeePhone: info.phone || '',
          bankCard:   '',
          bankName:   '',
        },
      });
    } catch (e) {
      this.setData({ settlementVisible: true });
    }
  },

  onCloseSettlement() {
    if (this.data.settlementSubmitting) return;
    this.setData({ settlementVisible: false });
  },

  onSettlementInput(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`settlementForm.${field}`]: e.detail.value });
  },

  async onSubmitSettlement() {
    if (this.data.settlementSubmitting) return;
    const { settlementForm, detail } = this.data;
    const { idCard, payeeName, payeePhone, bankCard, bankName } = settlementForm;

    if (!payeeName.trim())  return wx.showToast({ title: '请填写收款姓名', icon: 'none' });
    if (!idCard.trim())     return wx.showToast({ title: '请填写身份证号', icon: 'none' });
    if (!/^[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(idCard.trim())) return wx.showToast({ title: '身份证号格式不正确', icon: 'none' });
    if (!payeePhone.trim()) return wx.showToast({ title: '请填写收款手机号', icon: 'none' });
    if (!/^1[3-9]\d{9}$/.test(payeePhone)) return wx.showToast({ title: '手机号格式不正确', icon: 'none' });
    if (!bankCard.trim())   return wx.showToast({ title: '请填写银行卡号', icon: 'none' });
    if (!bankName.trim())   return wx.showToast({ title: '请填写开户行', icon: 'none' });

    this.setData({ settlementSubmitting: true });
    wx.showLoading({ title: '提交中...', mask: true });
    try {
      const res = await wx.cloud.callFunction({
        name: 'referralService',
        data: {
          action:       'applySettlement',
          referralId:   detail._id,
          crmId:        detail.crmId || '',
          idCard:       idCard.trim(),
          payeeName:    payeeName.trim(),
          payeePhone:   payeePhone.trim(),
          bankCard:     bankCard.trim(),
          bankName:     bankName.trim(),
          rewardAmount: detail.rewardAmount || detail.contract.rewardAmount || 0,
        },
      });
      wx.hideLoading();
      if (res.result && res.result.success) {
        this.setData({ settlementVisible: false });
        wx.showToast({ title: '申请已提交', icon: 'success' });
        // 刷新详情，状态变为 reward_pending
        setTimeout(() => this.loadDetail(detail._id), 1500);
      } else {
        wx.showToast({ title: (res.result && res.result.message) || '提交失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    } finally {
      this.setData({ settlementSubmitting: false });
    }
  },
});
