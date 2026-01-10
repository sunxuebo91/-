function splitTags(text) {
  return (text || "")
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

Page({
  data: {
    id: "",
    loading: false,
    statusOptions: ["draft", "published"],
    statusIndex: 0,
    form: {
      name: "",
      age: "",
      city: "",
      experienceYears: "",
      priceMonth: "",
      tagsText: "",
      status: "draft",
      coverFileId: "",
      photos: [],
      videoFileId: "",
      intro: "",
    },
  },

  async onLoad(options) {
    const ok = await this.ensureStaff();
    if (!ok) return;

    const id = options.id || "";
    this.setData({ id });
    if (id) this.loadDetail();
  },

  async ensureStaff() {
    try {
      const resp = await wx.cloud.callFunction({
        name: "userService",
        data: { action: "getOrCreateMe" },
      });
      const me = (resp.result && resp.result.data) || {};
      if (me.role === "staff") return true;
    } catch (e) {}

    wx.showToast({ title: "仅员工可访问", icon: "none" });
    wx.switchTab({ url: "/pages/profile/index" });
    return false;
  },


  onInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value;
    this.setData({
      form: {
        ...this.data.form,
        [key]: value,
      },
    });
  },

  onStatusChange(e) {
    const idx = Number(e.detail.value);
    const status = this.data.statusOptions[idx];
    this.setData({
      statusIndex: idx,
      form: { ...this.data.form, status },
    });
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const resp = await wx.cloud.callFunction({
        name: "resumeService",
        data: { action: "detail", id: this.data.id, forManage: true },
      });
      const detail = (resp.result && resp.result.data) || {};
      this.setData({
        statusIndex: this.data.statusOptions.indexOf(detail.status || "draft") >= 0 ? this.data.statusOptions.indexOf(detail.status || "draft") : 0,
        form: {
          ...this.data.form,
          name: detail.name || "",
          age: detail.age || "",
          city: detail.city || "",
          experienceYears: detail.experienceYears || "",
          priceMonth: detail.priceMonth || "",
          tagsText: (detail.tags || []).join(","),
          status: detail.status || "draft",
          coverFileId: detail.coverFileId || "",
          photos: detail.photos || [],
          videoFileId: detail.videoFileId || "",
          intro: detail.intro || "",
        },
      });
    } catch (e) {
      wx.showToast({ title: "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  async uploadOne(tempFilePath, ext) {
    const cloudPath = `resume/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
    const res = await wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath,
    });
    return res.fileID;
  },

  async pickCover() {
    try {
      const choose = await wx.chooseMedia({ count: 1, mediaType: ["image"] });
      wx.showLoading({ title: "上传中" });
      const file = choose.tempFiles[0];
      const fileID = await this.uploadOne(file.tempFilePath, "jpg");
      this.setData({ form: { ...this.data.form, coverFileId: fileID } });
    } catch (e) {
      wx.showToast({ title: "选择/上传失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  clearCover() {
    this.setData({ form: { ...this.data.form, coverFileId: "" } });
  },

  async pickPhotos() {
    try {
      const choose = await wx.chooseMedia({ count: 6, mediaType: ["image"] });
      wx.showLoading({ title: "上传中" });
      const uploads = [];
      for (const f of choose.tempFiles) {
        uploads.push(this.uploadOne(f.tempFilePath, "jpg"));
      }
      const fileIDs = await Promise.all(uploads);
      this.setData({ form: { ...this.data.form, photos: fileIDs } });
    } catch (e) {
      wx.showToast({ title: "选择/上传失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  clearPhotos() {
    this.setData({ form: { ...this.data.form, photos: [] } });
  },

  async pickVideo() {
    try {
      const choose = await wx.chooseMedia({ count: 1, mediaType: ["video"] });
      wx.showLoading({ title: "上传中" });
      const file = choose.tempFiles[0];
      const fileID = await this.uploadOne(file.tempFilePath, "mp4");
      this.setData({ form: { ...this.data.form, videoFileId: fileID } });
    } catch (e) {
      wx.showToast({ title: "选择/上传失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  clearVideo() {
    this.setData({ form: { ...this.data.form, videoFileId: "" } });
  },

  async save() {
    const f = this.data.form;
    if (!f.name) {
      wx.showToast({ title: "请填写姓名", icon: "none" });
      return;
    }

    wx.showLoading({ title: "保存中" });
    try {
      await wx.cloud.callFunction({
        name: "resumeService",
        data: {
          action: "upsert",
          data: {
            _id: this.data.id,
            name: f.name,
            age: Number(f.age) || "",
            city: f.city,
            experienceYears: Number(f.experienceYears) || 0,
            priceMonth: Number(f.priceMonth) || "",
            tags: splitTags(f.tagsText),
            status: f.status,
            coverFileId: f.coverFileId,
            photos: f.photos,
            videoFileId: f.videoFileId,
            intro: f.intro,
          },
        },
      });

      wx.showToast({ title: "已保存" });
      wx.navigateBack();
    } catch (e) {
      wx.showToast({ title: "保存失败（无权限？）", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },
});
