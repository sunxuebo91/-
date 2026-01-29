const babyDiaryService = require('../../../services/babyDiary.js');
const userService = require('../../../services/userService.js');

function ymdToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYMD(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return null;
  const dt = new Date(String(v) + 'T00:00:00.000Z');
  return isNaN(dt.getTime()) ? null : dt;
}

function dayNumberFrom(startDate, serviceDate) {
  const a = parseYMD(startDate);
  const b = parseYMD(serviceDate);
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000) + 1;
}

Page({
  data: {
    me: {},
    loading: true,
    mode: 'contracts', // contracts | diaries
    contractId: '',
    contractTitle: '',

    contracts: [],
    diaries: [],
    page: 0,
    pageSize: 20,
    hasMore: true,

    // create test contract modal
    showCreateContract: false,
    serviceDaysOptions: [26, 42, 52, 78],
    createContractForm: {
      customerId: '',
      serviceDays: 42,
      startDate: '',
      babyName: ''
    }
  },

  async onLoad(options) {
    const contractId = options?.contractId ? decodeURIComponent(options.contractId) : '';
    if (contractId) {
      this.setData({ mode: 'diaries', contractId });
    }

    await this.bootstrap();
  },

  async onPullDownRefresh() {
    try {
      await this.bootstrap();
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async onReachBottom() {
    if (this.data.mode !== 'diaries') return;
    if (!this.data.hasMore || this.data.loading) return;
    await this.loadDiariesMore();
  },

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const me = await userService.getOrCreateMe();
      this.setData({ me: me || {} });

      if (this.data.mode === 'contracts') {
        await this.loadContracts();
      } else {
        await this.loadContractTitle();
        await this.reloadDiaries();
      }
    } catch (e) {
      wx.showToast({ title: e?.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadContracts() {
    const resp = await babyDiaryService.listContracts({ status: 'active', page: 0, pageSize: 50 });
    const items = resp?.data?.items || [];

    const today = ymdToday();
    const contractIds = items.map(x => x._id).filter(Boolean);

    let todayMap = {};
    if (contractIds.length) {
      try {
        const r = await babyDiaryService.listDiaries({ contractIds, serviceDate: today, page: 0, pageSize: 200 });
        const list = r?.data?.items || [];
        list.forEach(d => {
          if (d.contractId) todayMap[String(d.contractId)] = d;
        });
      } catch (e) {
        // ignore
      }
    }

    const nowDay = today;
    const contracts = items.map(c => {
      let currentDay = dayNumberFrom(c.startDate, nowDay);
      if (currentDay < 0) currentDay = 0;
      if (c.serviceDays && currentDay > c.serviceDays) currentDay = c.serviceDays;

      const td = todayMap[String(c._id)];
      return {
        ...c,
        currentDay,
        todayDiaryId: td?._id || '',
        todayDiaryStatus: td?.status || ''
      };
    });

    this.setData({ contracts });
  },

  async loadContractTitle() {
    try {
      const r = await babyDiaryService.getContract(this.data.contractId);
      const c = r?.data;
      if (c) {
        const title = `${c.babyInfo?.name || '宝宝'} · ${c.serviceDays || ''}天`;
        this.setData({ contractTitle: title });
      }
    } catch (e) {
      // ignore
    }
  },

  async reloadDiaries() {
    this.setData({ diaries: [], page: 0, hasMore: true });
    await this.loadDiariesMore();
  },

  async loadDiariesMore() {
    this.setData({ loading: true });
    try {
      const page = this.data.page;
      const pageSize = this.data.pageSize;
      const r = await babyDiaryService.listDiaries({ contractId: this.data.contractId, page, pageSize });
      const items = r?.data?.items || [];
      const total = r?.data?.total || 0;

      const nextList = (this.data.diaries || []).concat(items);
      const hasMore = nextList.length < total;

      this.setData({
        diaries: nextList,
        page: page + 1,
        hasMore
      });
    } catch (e) {
      wx.showToast({ title: e?.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onTapContract(e) {
    const id = e?.currentTarget?.dataset?.id;
    if (!id) return;

    // 点击整卡：默认进入“合同日记列表”
    wx.navigateTo({
      url: `/pages/babyDiary/list/index?contractId=${encodeURIComponent(String(id))}`
    });
  },

  goDiaryList(e) {
    const id = e?.currentTarget?.dataset?.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/babyDiary/list/index?contractId=${encodeURIComponent(String(id))}`
    });
  },

  goToday(e) {
    const id = e?.currentTarget?.dataset?.id;
    if (!id) return;

    const today = ymdToday();

    // 尝试找到今日 diaryId
    const contract = (this.data.contracts || []).find(c => String(c._id) === String(id));
    const diaryId = contract?.todayDiaryId;

    if (diaryId) {
      wx.navigateTo({
        url: `/pages/babyDiary/detail/index?id=${encodeURIComponent(String(diaryId))}`
      });
      return;
    }

    wx.navigateTo({
      url: `/pages/babyDiary/edit/index?contractId=${encodeURIComponent(String(id))}&serviceDate=${encodeURIComponent(today)}`
    });
  },

  goDiaryDetail(e) {
    const id = e?.currentTarget?.dataset?.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/babyDiary/detail/index?id=${encodeURIComponent(String(id))}`
    });
  },

  goCreateDiary() {
    const today = ymdToday();
    wx.navigateTo({
      url: `/pages/babyDiary/edit/index?contractId=${encodeURIComponent(String(this.data.contractId))}&serviceDate=${encodeURIComponent(today)}`
    });
  },

  openCreateContract() {
    const d = ymdToday();
    this.setData({
      showCreateContract: true,
      createContractForm: {
        ...this.data.createContractForm,
        startDate: this.data.createContractForm.startDate || d
      }
    });
  },

  closeCreateContract() {
    this.setData({ showCreateContract: false });
  },

  onInputCreateContract(e) {
    const key = e?.currentTarget?.dataset?.key;
    const value = e?.detail?.value;
    if (!key) return;

    this.setData({
      createContractForm: {
        ...this.data.createContractForm,
        [key]: value
      }
    });
  },

  onPickServiceDays(e) {
    const idx = Number(e?.detail?.value || 0);
    const days = this.data.serviceDaysOptions[idx] || 42;
    this.setData({
      createContractForm: {
        ...this.data.createContractForm,
        serviceDays: days
      }
    });
  },

  async submitCreateContract() {
    try {
      wx.showLoading({ title: '创建中' });

      const form = this.data.createContractForm;
      const customerId = String(form.customerId || '').trim();
      const startDate = String(form.startDate || '').trim();
      const serviceDays = Number(form.serviceDays || 42);
      const babyName = String(form.babyName || '').trim();

      if (!customerId) {
        wx.showToast({ title: '请填写客户 openid', icon: 'none' });
        return;
      }

      await babyDiaryService.createContract({
        customerId,
        nurseId: this.data.me?._openid || this.data.me?.openid || '',
        serviceType: '月嫂',
        serviceDays,
        startDate,
        babyInfo: { name: babyName }
      });

      this.setData({ showCreateContract: false });
      wx.showToast({ title: '已创建' });
      await this.loadContracts();
    } catch (e) {
      wx.showToast({ title: e?.message || '创建失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});
