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
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000) + 1;
}

function setByPath(obj, path, value) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return obj;
  const root = { ...obj };
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const next = cur[k];
    cur[k] = (next && typeof next === 'object') ? { ...next } : {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return root;
}

function safeNumber(v) {
  const s = String(v ?? '').trim();
  if (s === '') return '';
  const n = Number(s);
  return Number.isFinite(n) ? n : '';
}

Page({
  data: {
    me: {},
    id: '',
    contractId: '',
    serviceDate: '',
    dayNumber: null,
    pageTitle: '填写日记',

    saving: false,
    dirty: false,
    lastSavedAt: '',

    sleepQualityOptions: ['优秀', '良好', '一般', '较差'],
    skinOptions: ['正常', '湿疹', '红疹'],
    jaundiceOptions: ['无', '轻微', '中度', '严重'],
    specialCareOptions: ['抚触', '被动操', '排气操', '游泳', '晒太阳', '其他'],

    lochiaAmountOptions: ['少量', '中等', '较多'],
    lochiaColorOptions: ['鲜红色', '淡红色', '褐色', '黄色'],
    lochiaSmellOptions: ['正常', '异味'],

    breastConditionOptions: ['正常', '涨奶', '堵奶', '乳腺炎'],
    milkSupplyOptions: ['充足', '一般', '不足'],
    breastIssueOptions: ['涨奶', '堵奶', '乳头皲裂', '乳头疼痛', '其他'],

    moodOptions: ['很好', '良好', '一般', '焦虑', '抑郁'],
    woundTypeOptions: ['顺产', '剖腹产'],

    form: {
      baby: {
        basics: { weight: '', height: '', headCircumference: '', temperature: '' },
        feeding: { breastfeeding: { times: '', duration: '' }, formulaFeeding: { times: '', amount: '' }, water: '' },
        excretion: { urine: '', stool: '', stoolType: '' },
        sleep: { totalHours: '', quality: '良好', notes: '' },
        care: { bath: true, umbilicalCord: '', skinCondition: '正常', jaundice: '无', specialCare: [] },
        notes: '',
        photos: []
      },
      mother: {
        basics: { temperature: '', bloodPressure: '', pulse: '' },
        lochia: { amount: '中等', color: '淡红色', smell: '正常' },
        breast: { condition: '正常', milkSupply: '充足', issues: [], care: '' },
        diet: { breakfast: '', lunch: '', dinner: '', snacks: '', waterIntake: '' },
        excretion: { urination: '正常', bowelMovement: '正常' },
        mood: { mood: '良好', sleep: { hours: '', quality: '良好' } },
        wound: { type: '顺产', condition: '', care: '' },
        notes: ''
      }
    },

    photoTempMap: {},

    // WXML 不支持 includes/join 等方法调用，用 map 来做 checked
    specialCareChecked: {},
    breastIssueChecked: {}
  },


  _autoTimer: null,

  async onLoad(options) {
    if (!userService.requireLogin()) return;
    const id = options?.id ? decodeURIComponent(options.id) : '';
    const contractId = options?.contractId ? decodeURIComponent(options.contractId) : '';
    const serviceDate = options?.serviceDate ? decodeURIComponent(options.serviceDate) : ymdToday();

    this.setData({ id, contractId, serviceDate });

    try {
      const me = await userService.getOrCreateMe();
      this.setData({ me: me || {} });

      if (me?.role !== 'staff') {
        wx.showToast({ title: '仅员工可填写', icon: 'none' });
        setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
        return;
      }

      await this.loadContractMeta();
      await this.loadDiaryIfExists();

      this._autoTimer = setInterval(() => {
        if (!this.data.dirty || this.data.saving) return;
        this.save('draft', true);
      }, 30000);

    } catch (e) {
      wx.showToast({ title: e?.message || '加载失败', icon: 'none' });
    }
  },

  onUnload() {
    if (this._autoTimer) {
      clearInterval(this._autoTimer);
      this._autoTimer = null;
    }
  },

  async loadContractMeta() {
    try {
      if (!this.data.contractId) return;
      const r = await babyDiaryService.getContract(this.data.contractId);
      const c = r?.data;
      if (!c) return;
      const dayNumber = dayNumberFrom(c.startDate, this.data.serviceDate);
      const title = `${c.babyInfo?.name || '宝宝'} · 日记`;
      this.setData({ dayNumber: (typeof dayNumber === 'number' ? dayNumber : null), pageTitle: title });
    } catch (e) {
      // ignore
    }
  },

  async loadDiaryIfExists() {
    try {
      if (this.data.id) {
        const r = await babyDiaryService.getDiary({ id: this.data.id });
        const diary = r?.data;
        if (diary) {
          this.applyDiaryToForm(diary);
          this.setData({ pageTitle: '编辑日记' });
        }
        return;
      }

      if (!this.data.contractId) return;

      const r = await babyDiaryService.getDiary({
        contractId: this.data.contractId,
        serviceDate: this.data.serviceDate
      }).catch(() => null);

      const diary = r?.data;
      if (diary && diary._id) {
        this.setData({ id: diary._id, pageTitle: '编辑日记' });
        this.applyDiaryToForm(diary);
      } else {
        this.setData({ pageTitle: '填写日记' });
      }
    } catch (e) {
      // ignore
    }
  },

  applyDiaryToForm(diary) {
    const form = {
      baby: {
        basics: { ...this.data.form.baby.basics, ...(diary?.baby?.basics || {}) },
        feeding: { ...this.data.form.baby.feeding, ...(diary?.baby?.feeding || {}) },
        excretion: { ...this.data.form.baby.excretion, ...(diary?.baby?.excretion || {}) },
        sleep: { ...this.data.form.baby.sleep, ...(diary?.baby?.sleep || {}) },
        care: { ...this.data.form.baby.care, ...(diary?.baby?.care || {}) },
        notes: diary?.baby?.notes || diary?.baby?.notes === '' ? diary.baby.notes : (diary?.baby?.notes || ''),
        photos: Array.isArray(diary?.baby?.photos) ? diary.baby.photos : []
      },
      mother: {
        basics: { ...this.data.form.mother.basics, ...(diary?.mother?.basics || {}) },
        lochia: { ...this.data.form.mother.lochia, ...(diary?.mother?.lochia || {}) },
        breast: { ...this.data.form.mother.breast, ...(diary?.mother?.breast || {}) },
        diet: { ...this.data.form.mother.diet, ...(diary?.mother?.diet || {}) },
        excretion: { ...this.data.form.mother.excretion, ...(diary?.mother?.excretion || {}) },
        mood: { ...this.data.form.mother.mood, ...(diary?.mother?.mood || {}) },
        wound: { ...this.data.form.mother.wound, ...(diary?.mother?.wound || {}) },
        notes: diary?.mother?.notes || ''
      }
    };

    // 兼容旧结构里 issues/specialCare
    form.baby.care.specialCare = Array.isArray(form.baby.care.specialCare) ? form.baby.care.specialCare : [];
    form.mother.breast.issues = Array.isArray(form.mother.breast.issues) ? form.mother.breast.issues : [];

    this.setData({ form, dirty: false });
    this.refreshCheckedMaps();

    // 预取 cloud:// 临时链接
    this.resolvePhotoTempURLs(form.baby.photos);
  },

  markDirty() {
    if (!this.data.dirty) this.setData({ dirty: true });
  },

  onInput(e) {
    const path = e?.currentTarget?.dataset?.path;
    if (!path) return;
    let value = e?.detail?.value;

    // 数值字段自动转数字（避免云端出现字符串）
    if (/temperature|weight|height|headCircumference|times|urine|stool|totalHours|pulse|hours/i.test(path)) {
      value = safeNumber(value);
    }

    const newData = setByPath(this.data, path, value);
    this.setData(newData);
    this.refreshCheckedMaps();
    this.markDirty();
  },


  onRadio(e) {
    const path = e?.currentTarget?.dataset?.path;
    const value = e?.detail?.value;
    if (!path) return;
    const newData = setByPath(this.data, path, value);
    this.setData(newData);
    this.markDirty();
  },

  onCheckbox(e) {
    const path = e?.currentTarget?.dataset?.path;
    const value = e?.detail?.value || [];
    if (!path) return;
    const newData = setByPath(this.data, path, value);
    this.setData(newData);
    this.refreshCheckedMaps();
    this.markDirty();
  },


  onSwitch(e) {
    const path = e?.currentTarget?.dataset?.path;
    const value = !!e?.detail?.value;
    if (!path) return;
    const newData = setByPath(this.data, path, value);
    this.setData(newData);
    this.refreshCheckedMaps();
    this.markDirty();
  },


  onPickSkin(e) {
    const idx = Number(e?.detail?.value || 0);
    const val = this.data.skinOptions[idx] || '';
    this.setData(setByPath(this.data, 'form.baby.care.skinCondition', val));
    this.markDirty();
  },

  onPickJaundice(e) {
    const idx = Number(e?.detail?.value || 0);
    const val = this.data.jaundiceOptions[idx] || '';
    this.setData(setByPath(this.data, 'form.baby.care.jaundice', val));
    this.markDirty();
  },

  onPickLochiaAmount(e) {
    const idx = Number(e?.detail?.value || 0);
    const val = this.data.lochiaAmountOptions[idx] || '';
    this.setData(setByPath(this.data, 'form.mother.lochia.amount', val));
    this.markDirty();
  },

  onPickLochiaColor(e) {
    const idx = Number(e?.detail?.value || 0);
    const val = this.data.lochiaColorOptions[idx] || '';
    this.setData(setByPath(this.data, 'form.mother.lochia.color', val));
    this.markDirty();
  },

  onPickLochiaSmell(e) {
    const idx = Number(e?.detail?.value || 0);
    const val = this.data.lochiaSmellOptions[idx] || '';
    this.setData(setByPath(this.data, 'form.mother.lochia.smell', val));
    this.markDirty();
  },

  onPickBreastCondition(e) {
    const idx = Number(e?.detail?.value || 0);
    const val = this.data.breastConditionOptions[idx] || '';
    this.setData(setByPath(this.data, 'form.mother.breast.condition', val));
    this.markDirty();
  },

  onPickMilkSupply(e) {
    const idx = Number(e?.detail?.value || 0);
    const val = this.data.milkSupplyOptions[idx] || '';
    this.setData(setByPath(this.data, 'form.mother.breast.milkSupply', val));
    this.markDirty();
  },

  onPickMood(e) {
    const idx = Number(e?.detail?.value || 0);
    const val = this.data.moodOptions[idx] || '';
    this.setData(setByPath(this.data, 'form.mother.mood.mood', val));
    this.markDirty();
  },

  onPickWoundType(e) {
    const idx = Number(e?.detail?.value || 0);
    const val = this.data.woundTypeOptions[idx] || '';
    this.setData(setByPath(this.data, 'form.mother.wound.type', val));
    this.markDirty();
  },

  validateForPublish() {
    const f = this.data.form;
    const babyTemp = Number(f?.baby?.basics?.temperature);
    const motherTemp = Number(f?.mother?.basics?.temperature);
    if (!Number.isFinite(babyTemp)) return '请填写宝宝体温';
    if (!Number.isFinite(motherTemp)) return '请填写宝妈体温';

    const urine = Number(f?.baby?.excretion?.urine);
    const stool = Number(f?.baby?.excretion?.stool);
    const sleepHours = Number(f?.baby?.sleep?.totalHours);

    if (!Number.isFinite(urine)) return '请填写宝宝小便次数';
    if (!Number.isFinite(stool)) return '请填写宝宝大便次数';
    if (!Number.isFinite(sleepHours)) return '请填写宝宝总睡眠时长';

    return '';
  },

  async save(status, silent = false) {
    if (!this.data.contractId) {
      wx.showToast({ title: '缺少合同信息', icon: 'none' });
      return;
    }

    if (status === 'published') {
      const msg = this.validateForPublish();
      if (msg) {
        wx.showToast({ title: msg, icon: 'none' });
        return;
      }
    }

    this.setData({ saving: true });

    try {
      const data = this.data.form;

      if (this.data.id) {
        await babyDiaryService.updateDiary(this.data.id, data, status);
      } else {
        const r = await babyDiaryService.createDiary(this.data.contractId, this.data.serviceDate, data, status);
        const newId = r?.data?._id;
        if (newId) this.setData({ id: newId });
      }

      const d = new Date();
      const lastSavedAt = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      this.setData({ dirty: false, lastSavedAt });

      if (!silent) {
        wx.showToast({ title: status === 'published' ? '已发布' : '已保存' });
      }

      if (status === 'published') {
        // 发布后进入详情页
        setTimeout(() => {
          wx.redirectTo({
            url: `/pages/babyDiary/detail/index?id=${encodeURIComponent(String(this.data.id))}`
          });
        }, 400);
      }
    } catch (e) {
      if (!silent) {
        wx.showToast({ title: e?.message || '保存失败', icon: 'none' });
      }
    } finally {
      this.setData({ saving: false });
    }
  },

  saveDraft() {
    this.save('draft');
  },

  publish() {
    this.save('published');
  },

  async addPhotos() {
    const current = this.data.form?.baby?.photos || [];
    const remain = Math.max(0, 9 - current.length);
    if (remain <= 0) return;

    try {
      const choose = await new Promise((resolve, reject) => {
        wx.chooseImage({
          count: remain,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: resolve,
          fail: reject
        });
      });

      const files = choose?.tempFilePaths || [];
      if (!files.length) return;

      wx.showLoading({ title: '上传中' });

      const uploaded = [];
      for (const fp of files) {
        const ext = (fp.split('.').pop() || 'jpg').toLowerCase();
        const cloudPath = `babyDiary/${this.data.contractId}/${this.data.serviceDate}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
        const r = await wx.cloud.uploadFile({ cloudPath, filePath: fp });
        if (r?.fileID) {
          uploaded.push(r.fileID);
          // 先用本地临时图预览，稍后再转 tempFileURL
          this.setData({ photoTempMap: { ...this.data.photoTempMap, [r.fileID]: fp } });
        }
      }

      const next = current.concat(uploaded).slice(0, 9);
      this.setData(setByPath(this.data, 'form.baby.photos', next));
      this.markDirty();

      // 尝试把 cloud:// 转临时链接
      this.resolvePhotoTempURLs(next);

    } catch (e) {
      wx.showToast({ title: '选择/上传失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  removePhoto(e) {
    const url = e?.currentTarget?.dataset?.url;
    const list = (this.data.form?.baby?.photos || []).filter(x => x !== url);
    this.setData(setByPath(this.data, 'form.baby.photos', list));
    const m = { ...this.data.photoTempMap };
    delete m[url];
    this.setData({ photoTempMap: m });
    this.markDirty();
  },

  previewPhoto(e) {
    const url = e?.currentTarget?.dataset?.url;
    const list = this.data.form?.baby?.photos || [];
    const urls = list.map(x => this.data.photoTempMap[x] || x);
    wx.previewImage({
      current: this.data.photoTempMap[url] || url,
      urls
    });
  },

  refreshCheckedMaps() {
    try {
      const special = (this.data.form?.baby?.care?.specialCare || []);
      const issues = (this.data.form?.mother?.breast?.issues || []);

      const specialCareChecked = {};
      special.forEach(v => { specialCareChecked[v] = true; });

      const breastIssueChecked = {};
      issues.forEach(v => { breastIssueChecked[v] = true; });

      this.setData({ specialCareChecked, breastIssueChecked });
    } catch (e) {
      // ignore
    }
  },

  async resolvePhotoTempURLs(fileIds = []) {

    const ids = Array.from(new Set((fileIds || []).filter(u => typeof u === 'string' && u.startsWith('cloud://'))));
    if (!ids.length) return;

    try {
      const res = await wx.cloud.getTempFileURL({ fileList: ids });
      const map = { ...this.data.photoTempMap };
      (res?.fileList || []).forEach(item => {
        if (item.fileID && item.tempFileURL) {
          map[item.fileID] = item.tempFileURL;
        }
      });
      this.setData({ photoTempMap: map });
    } catch (e) {
      // ignore
    }
  }
});
