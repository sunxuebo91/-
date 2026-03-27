const babyDiaryService = require('../../../services/babyDiary.js');
const userService = require('../../../services/userService.js');

Page({
  data: {
    id: '',
    diary: {},
    loading: true,
    me: {},
    canEdit: false,
    photoTempMap: {}
  },

  async onLoad(options) {
    if (!userService.requireLogin()) return;
    const id = options?.id ? decodeURIComponent(options.id) : '';
    this.setData({ id });

    if (!id) {
      wx.showToast({ title: '缺少日记ID', icon: 'none' });
      this.setData({ loading: false });
      return;
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

  async bootstrap() {
    this.setData({ loading: true });
    try {
      const me = await userService.getOrCreateMe();
      this.setData({ me: me || {} });

      const r = await babyDiaryService.getDiary({ id: this.data.id });
      const diary = r?.data || {};

      // 兜底：补齐对象层级，避免 WXML 访问链路为空
      diary.baby = diary.baby || {};
      diary.baby.basics = diary.baby.basics || {};
      diary.baby.feeding = diary.baby.feeding || {};
      diary.baby.feeding.breastfeeding = diary.baby.feeding.breastfeeding || {};
      diary.baby.feeding.formulaFeeding = diary.baby.feeding.formulaFeeding || {};
      diary.baby.excretion = diary.baby.excretion || {};
      diary.baby.sleep = diary.baby.sleep || {};
      diary.baby.care = diary.baby.care || {};
      diary.baby.care.specialCare = Array.isArray(diary.baby.care.specialCare) ? diary.baby.care.specialCare : [];
      diary.baby.care.specialCareText = diary.baby.care.specialCare.length ? diary.baby.care.specialCare.join('、') : '';
      diary.baby.photos = Array.isArray(diary.baby.photos) ? diary.baby.photos : [];


      diary.mother = diary.mother || {};
      diary.mother.basics = diary.mother.basics || {};
      diary.mother.lochia = diary.mother.lochia || {};
      diary.mother.breast = diary.mother.breast || {};
      diary.mother.breast.issues = Array.isArray(diary.mother.breast.issues) ? diary.mother.breast.issues : [];
      diary.mother.breast.issuesText = diary.mother.breast.issues.length ? diary.mother.breast.issues.join('、') : '';
      diary.mother.diet = diary.mother.diet || {};

      diary.mother.excretion = diary.mother.excretion || {};
      diary.mother.mood = diary.mother.mood || {};
      diary.mother.mood.sleep = diary.mother.mood.sleep || {};
      diary.mother.wound = diary.mother.wound || {};

      this.setData({ diary });


      if (diary?.serviceDate) {
        wx.setNavigationBarTitle({ title: '日记详情' });
      }

      const canEdit = (me?.role === 'staff');
      this.setData({ canEdit });

      const photos = diary?.baby?.photos || [];
      await this.resolvePhotoTempURLs(photos);

    } catch (e) {
      wx.showToast({ title: e?.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goEdit() {
    const id = this.data.id;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/babyDiary/edit/index?id=${encodeURIComponent(String(id))}`
    });
  },

  async onDelete() {
    const id = this.data.id;
    if (!id) return;

    const res = await new Promise((resolve) => {
      wx.showModal({
        title: '确认删除',
        content: '删除后不可恢复（会软删除记录）',
        confirmText: '删除',
        confirmColor: '#ef4444',
        success: resolve,
        fail: () => resolve({ confirm: false })
      });
    });

    if (!res.confirm) return;

    wx.showLoading({ title: '删除中' });
    try {
      await babyDiaryService.deleteDiary(id);
      wx.showToast({ title: '已删除' });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 400);
    } catch (e) {
      wx.showToast({ title: e?.message || '删除失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  previewPhoto(e) {
    const url = e?.currentTarget?.dataset?.url;
    const list = this.data.diary?.baby?.photos || [];
    const urls = list.map(x => this.data.photoTempMap[x] || x);
    wx.previewImage({
      current: this.data.photoTempMap[url] || url,
      urls
    });
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
