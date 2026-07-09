const { publicRequest } = require('../../utils/request.js');
const { loadShareLogo } = require('../../utils/shareLogo.js');

const HOUSEKEEPING_STATUS_TEXT = {
  draft: '待签约',
  signing: '签约中',
  signed: '已签约',
  active: '服务中',
  ended: '已结束',
  cancelled: '已取消',
  replaced: '已换人',
};

const TRAINING_STATUS_TEXT = {
  draft: '待签约',
  signing: '签约中',
  active: '进行中',
  graduated: '已结业',
  refunded: '已退款',
  cancelled: '已取消',
  ended: '已结束',
};

const PAYMENT_STATUS_TEXT = {
  unpaid: '待支付',
  partial: '部分已付',
  paid: '已结清',
  refunded: '已退款',
};

const PAYMENT_TYPE_TEXT = {
  full: '一次性付清',
  deposit: '定金 + 尾款',
  installment: '分期付款',
  service_fee_only: '服务费',
  service_fee: '服务费',
  deposit_only: '定金',
  final: '尾款',
  refund: '退款',
  // 职培支付模式（CRM 端共用家政 enum，靠 payments[] 形状推断）
  course_full: '课程全款',
  course_deposit_tail: '课程定金 + 尾款',
  course_split: '自定义分笔',
};

// 职培场景：基于 payments[] 形状推断（CRM 端不区分）
function inferTrainingPaymentType(contract) {
  const ps = Array.isArray(contract.payments) ? contract.payments : [];
  if (ps.length <= 1) return 'course_full';
  if (ps.length === 2 && (ps[0] && (ps[0].type === 'deposit' || /定金/.test(ps[0].label || '')))) return 'course_deposit_tail';
  return 'course_split';
}

const PAYMENT_ITEM_TYPE_TEXT = {
  deposit: '定金',
  final: '尾款',
  balance: '尾款',
  deposit_balance: '尾款',
  service_fee: '服务费',
  service_fee_only: '服务费',
  refund: '退款',
  // 职培分期项
  course: '课程费',
  course_deposit: '课程定金',
  course_tail: '课程尾款',
  course_installment: '分笔',
};

const INSURANCE_STATUS_TEXT = {
  synced: '已同步',
  pending: '同步中',
  failed: '同步失败',
  not_required: '无需同步',
};

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

Page({
  data: {
    contract: null,
    loading: true,
    paymentStatusText: PAYMENT_STATUS_TEXT,
    paymentTypeText: PAYMENT_TYPE_TEXT,
    insuranceStatusText: INSURANCE_STATUS_TEXT,
  },

  onLoad(options) {
    this.contractId = options.id || '';
    this.orderCategory = options.orderCategory || 'housekeeping';
    // 默认员工视角（员工「我的合同」入口）；share 卡片进 detail 带 inviteRole 时切换为 client
    this.inviteRole = options.inviteRole || '';
    this.viewMode = this.inviteRole ? 'client' : 'employee';
    if (!this.contractId) {
      wx.showToast({ title: '缺少合同ID', icon: 'none' });
      this.setData({ loading: false });
      return;
    }
    // 预加载分享 logo（云存储 → 临时 https URL，给 onShareAppMessage 用，await 确保 onShareAppMessage 时已缓存）
    loadShareLogo(this).then(() => this.loadDetail());
  },

    async loadDetail() {
    this.setData({ loading: true });
    try {
      // 优先用 query 携带的 phone（share 卡片接收方未登录场景），其次 storage
      let phone = '';
      if (this.options && this.options.phone) phone = this.options.phone;
      if (!phone) phone = (wx.getStorageSync('crmUserInfo') || {}).phone || '';
      if (!phone) {
        wx.showToast({ title: '无法识别用户身份', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const isTraining = this.orderCategory === 'training';
      // 职培订单也走 by-staff（自家 createdBy 名下）：by-staff 会同时返回 signingLinks / signerStatuses
      const url = `/contracts/${this.contractId}/by-staff`;

      const resp = await publicRequest({ url, method: 'GET', data: { phone } });
      if (!resp || resp.success === false) {
        throw new Error(resp?.message || '加载失败');
      }
      const c = resp.data || {};

      const STATUS_TEXT = isTraining ? TRAINING_STATUS_TEXT : HOUSEKEEPING_STATUS_TEXT;
      let statusText = '';
      let displayStatus = c.contractStatus;

      if (isTraining) {
        // 职培订单：CRM 已标准化状态
        statusText = STATUS_TEXT[c.contractStatus] || c.contractStatus || '';
      } else {
        // 家政合同：根据签约进度细化文案
        const ss = c.signerStatuses || {};
        const getSignStatus = (val) => {
          if (val === true || val === 'signed') return 'signed';
          if (val === 'signing') return 'signing';
          return 'pending';
        };
        const customerStatus = getSignStatus(ss.customerSigned);
        const nannyStatus = getSignStatus(ss.nannySigned);

        if (ss && (c.contractStatus === 'draft' || c.contractStatus === 'signing')) {
          if (customerStatus === 'signed' && nannyStatus === 'signed') {
            statusText = '已签约'; displayStatus = 'signed';
          } else if (customerStatus === 'signed' && nannyStatus !== 'signed') {
            statusText = '等待阿姨签约'; displayStatus = 'signing';
          } else if (customerStatus !== 'signed' && nannyStatus === 'signed') {
            statusText = '等待客户签约'; displayStatus = 'signing';
          } else {
            statusText = '待签约'; displayStatus = 'draft';
          }
        } else {
          statusText = STATUS_TEXT[c.contractStatus] || c.contractStatus || '';
        }
      }

      const contract = {
        ...c,
        orderCategory: this.orderCategory,
        serviceTypeText: isTraining
          ? (c.contractType || '职培订单')
          : (c.contractType || '未知服务'),
        startDateFmt: formatDate(c.startDate),
        endDateFmt: formatDate(c.endDate),
        createdAtFmt: formatDate(c.createdAt),
        paidAtFmt: formatDate(c.paidAt),
        insuranceSyncedAtFmt: formatDate(c.insuranceSyncedAt),
        statusText,
        displayStatus,
        hasSigning: !!c.esignContractNo,
        hasInsurance: !!(c.insurancePolicyNo || c.insuranceSyncStatus || c.insuranceSyncPending),
        insuranceSyncPending: !!c.insuranceSyncPending,
      };

      // 职培订单：intendedCourses 可能是数组/字符串/对象，多形兼容
      const ic = c.intendedCourses;
      if (Array.isArray(ic)) {
        contract.coursesLabel = ic.map((x) => (typeof x === 'string' ? x : (x && (x.name || x.label || x.course || '')))).filter(Boolean).join('、') || '待定';
      } else if (typeof ic === 'string') {
        contract.coursesLabel = ic;
      } else if (ic && typeof ic === 'object') {
        contract.coursesLabel = ic.name || ic.label || ic.course || '待定';
      }

      // 签署详情：signerStatuses 优先；职培订单永远 null → fallback 到 esignStatus + contractStatus
      const ss = c.signerStatuses || null;
      const esignCode = (c.esignStatus != null ? String(c.esignStatus) : '').toLowerCase();
      const inferEsign = (code) => {
        if (code === '2' || code === '3') return 'signed';   // '2' 通用完成，'3' 部分/某些模板
        if (code === '1' || code === '5' || code === '6') return 'signing';
        return '';
      };
      const inferred = inferEsign(esignCode);
      const fallback = (c.contractStatus === 'signing' || c.contractStatus === 'signed') ? 'signing' : 'pending';
      contract.customerStatus = (ss && ss.customerSigned) ? 'signed' : (inferred || fallback);
      contract.nannyStatus = (ss && ss.nannySigned) ? 'signed' : (inferred || fallback);
      contract.customerSignedAtFmt = ss && ss.customerSignedAt ? formatDate(ss.customerSignedAt) : '';
      contract.nannySignedAtFmt = ss && ss.nannySignedAt ? formatDate(ss.nannySignedAt) : '';

      // 找出当前用户（员工）对应的签署链接：signingLinks[] 按 mobile 匹配自身手机号
      const myPhone = (wx.getStorageSync('crmUserInfo') || {}).phone || '';
      const links = Array.isArray(c.signingLinks) ? c.signingLinks : [];
      const orderCategory = this.orderCategory;
      let customerLink = null;
      let nannyLink = null;
      if (orderCategory === 'training') {
        // 职培订单 link role 通常是「乙方（学员）」，也可能公司自动签（role="甲方（企业）"）
        customerLink = links.find((l) => l && /甲方|企业|公司/.test(l.role || ''));
        nannyLink = links.find((l) => l && /乙方|学员/.test(l.role || ''));
      } else {
        // 派单合同：甲方=客户，乙方=阿姨/服务人员
        customerLink = links.find((l) => l && /客户|甲方/.test(l.role || ''));
        nannyLink = links.find((l) => l && /乙方|服务人员|阿姨/.test(l.role || ''));
      }
      let mySignUrl = '';
      let mySignRole = '';
      if (myPhone) {
        const hit = links.find((l) => l && l.mobile === myPhone);
        if (hit) {
          mySignUrl = hit.signUrl || '';
          mySignRole = hit.role || '';
        }
      }
      // fallback：取第一条乙方链接
      if (!mySignUrl && nannyLink) {
        mySignUrl = nannyLink.signUrl || '';
        mySignRole = nannyLink.role || '';
      }
      contract.mySignUrl = mySignUrl;
      contract.mySignRole = mySignRole;
      contract.signingLinks = links;
      contract.customerSignUrl = customerLink ? customerLink.signUrl : '';
      contract.nannySignUrl = nannyLink ? nannyLink.signUrl : '';

      // 职培支付方式：基于 payments[] 形状推断
      if (isTraining) {
        contract.paymentTypeResolved = inferTrainingPaymentType(c);
      } else {
        contract.paymentTypeResolved = c.paymentType;
      }

      // 计算操作按钮（按 viewMode 切换员工邀请矩阵 / 客户自身动作矩阵）
      const ss2 = c.signerStatuses || {};
      const customerSigned = !!ss2.customerSigned;
      const nannySigned = !!ss2.nannySigned;
      const customerPaid = c.paymentStatus === 'paid';
      const actions = [];

      if (this.viewMode === 'client') {
        // 客户视角：自己「立即签署」「立即支付」
        if (this.inviteRole === 'nanny') {
          // 阿姨未签 → 立即签署（家政视角）
          if (!nannySigned && nannyLink && nannyLink.signUrl) {
            actions.push({ key: 'self-nanny-sign', label: '立即签署', url: nannyLink.signUrl, kind: 'primary', share: false });
          }
          if (nannySigned && customerPaid) {
            actions.push({ key: 'self-done', label: '✓ 已完成', url: '', kind: 'secondary', share: false });
          }
        } else if (orderCategory === 'training') {
          // 职培学员：「立即签署」+ 若学员是签约方
          if (nannyLink && nannyLink.signUrl) {
            actions.push({ key: 'self-student-sign', label: '立即签署', url: nannyLink.signUrl, kind: 'primary', share: false });
          }
        } else {
          // 客户视角（家政）：立即签署/支付
          if (!customerSigned && customerLink && customerLink.signUrl) {
            actions.push({ key: 'self-customer-sign', label: '立即签署', url: customerLink.signUrl, kind: 'primary', share: false });
          }
          if (customerSigned && !customerPaid && c.customerServiceFee > 0) {
            actions.push({ key: 'self-customer-pay', label: '立即支付', url: '', kind: 'secondary', share: false });
          }
          if (customerSigned && customerPaid && nannySigned) {
            actions.push({ key: 'self-done', label: '✓ 已完成', url: '', kind: 'secondary', share: false });
          }
        }
      } else {
        // 员工视角：邀请矩阵
        if (orderCategory === 'training') {
          // 职培：单按钮「邀请学员签署」（学员是乙方，signUrl 通常来自 nannyLink）
          if (nannyLink && nannyLink.signUrl) {
            actions.push({ key: 'invite-student-sign', label: '邀请学员签署', url: nannyLink.signUrl, kind: 'primary', share: true });
          }
        } else {
          // 派单合同：原矩阵
          // 职培：已签 + paymentEnabled + 未付 + 收款金额>0 → 加「邀请学员支付」按钮
          const trainingStudentSigned = orderCategory === 'training'
            ? (inferred === 'signed' || c.contractStatus === 'active' || esignCode === '2' || esignCode === '3')
            : customerSigned;
          const trainingPayAmount = Number(c.paymentConfigAmount || c.courseAmount || 0);
          if (orderCategory === 'training' && trainingStudentSigned && !customerPaid && trainingPayAmount > 0) {
            actions.push({ key: 'invite-student-pay', label: '邀请学员支付', url: '', kind: 'secondary', share: true });
          }
          if (!customerSigned && customerLink && customerLink.signUrl) {
            actions.push({ key: 'invite-customer-sign', label: '邀请客户签署', url: customerLink.signUrl, kind: 'primary', share: true });
          }
          if (!nannySigned && nannyLink && nannyLink.signUrl && nannyLink.mobile !== myPhone) {
            actions.push({ key: 'invite-nanny-sign', label: '邀请阿姨签署', url: nannyLink.signUrl, kind: 'primary', share: true });
          }
          if (customerSigned && !customerPaid && (c.paymentConfigAmount || c.customerServiceFee || 0) > 0) {
            actions.push({ key: 'invite-customer-pay', label: '邀请客户支付', url: '', kind: 'secondary', share: true });
          }
        }
      }

      contract.actionButtons = actions;

      // 分期明细 + 排序（小到大）+ 解析可读 label（去掉「第N笔」前缀 + type 翻译回退）
      if (Array.isArray(contract.payments)) {
        contract.payments = contract.payments
          .slice()
          .sort((a, b) => (a.sequenceNo || 0) - (b.sequenceNo || 0))
          .map((p) => {
            const stripped = (p.label || '').replace(/^第\d+笔\s*/, '').trim();
            const labelText = stripped || PAYMENT_ITEM_TYPE_TEXT[p.type] || '其他';
            return { ...p, paidAtFmt: formatDate(p.paidAt), labelText };
          });
      }

      this.setData({ contract });

      // 分享卡片自动开 cover-view 浮层逻辑已撤除（员工邀请流程统一走分享卡片）
    } catch (e) {
      console.error('load detail failed:', e.message);
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  callCustomer() {
    const phone = this.data.contract?.customerPhone;
    if (phone) {
      wx.makePhoneCall({ phoneNumber: phone });
    }
  },

      // 微信小程序原生转发（按钮 open-type="share" + 右上角 ... 触发）
  onShareAppMessage(options) {
    const logo = this.data.shareLogo || '';
    if (options.from === 'button' && options.target && options.target.dataset) {
      const { key = '', cid = '' } = options.target.dataset;
      const c = this.data.contract || {};
      const links = c.signingLinks || [];
      const customerLink = links.find((l) => l && /客户|甲方/.test(l.role || ''));
      const nannyLink = links.find((l) => l && /乙方|服务人员|阿姨/.test(l.role || ''));
      const contractId = c._id || cid;
      // share path 走客户版详情页 myOrders/detail（自带登录分发）
      const basePath = `/pages/myOrders/detail?id=${encodeURIComponent(contractId)}&autoSign=1`;

      if (key === 'invite-customer-sign') {
        const name = (customerLink && customerLink.name) || c.customerName || '客户';
        return {
          title: `${name}，您的家政合同已经准备好啦，点击一下就能签署~`,
          path: basePath,
          imageUrl: logo,
        };
      }
      if (key === 'invite-nanny-sign') {
        const name = (nannyLink && nannyLink.name) || c.workerName || '阿姨';
        return {
          title: `${name}，咱家的服务合同好了，点击一下就签好~`,
          path: basePath,
          imageUrl: logo,
        };
      }
      if (key === 'invite-customer-pay') {
        const name = (customerLink && customerLink.name) || c.customerName || '客户';
        return {
          title: `${name}，您的家政服务费待付，点击完成支付`,
          path: basePath,
          imageUrl: logo,
        };
      }
      if (key === 'invite-student-pay') {
        const name = (nannyLink && nannyLink.name) || c.customerName || '学员';
        return {
          title: `${name}，您的课程费待付，点击完成支付`,
          path: basePath,
          imageUrl: logo,
        };
      }
    }
    // 兜底：员工从右上角 → 分享当前合同
    const c2 = this.data.contract || {};
    return {
      title: `${c2.customerName || ''}ĺͬ`,
      path: c2._id ? `/pages/myOrders/detail?id=${encodeURIComponent(c2._id)}&autoSign=1` : '/pages/home/index',
      imageUrl: logo || '',
    };
  },
});
