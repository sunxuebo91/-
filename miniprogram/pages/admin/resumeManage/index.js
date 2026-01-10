function showModalAsync(options) {
  return new Promise((resolve, reject) => {
    wx.showModal({
      ...options,
      success: resolve,
      fail: reject,
    });
  });
}

function toDateText(v) {
  try {
    if (!v) return "";
    if (v instanceof Date) return v.toLocaleString();
    if (typeof v === "string" || typeof v === "number") return new Date(v).toLocaleString();
    if (v && typeof v === "object" && v.$date) return new Date(v.$date).toLocaleString();
    return "";
  } catch (e) {
    return "";
  }
}

Page({
  data: {
    resumes: [],
    loading: false,
  },

  async onShow() {
    const ok = await this.ensureStaff();
    if (!ok) return;
    this.reload();
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


  async reload() {
    this.setData({ loading: true });
    try {
      const resp = await wx.cloud.callFunction({
        name: "resumeService",
        data: { action: "listForManage" },
      });
      const list = (resp.result && resp.result.data) || [];
      this.setData({
        resumes: list.map((x) => ({
          ...x,
          updatedAtText: toDateText(x.updatedAt),
        })),
      });
    } catch (e) {
      wx.showToast({ title: "无权限或失败", icon: "none" });
      this.setData({ resumes: [] });
    } finally {
      this.setData({ loading: false });
    }
  },

  create() {
    wx.navigateTo({ url: "/pages/admin/resumeEdit/index" });
  },

  edit(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/admin/resumeEdit/index?id=${id}` });
  },

  async remove(e) {
    const id = e.currentTarget.dataset.id;

    let res;
    try {
      res = await showModalAsync({
        title: "确认删除",
        content: "删除后不可恢复",
      });
    } catch (e1) {
      return;
    }

    if (!res.confirm) return;

    wx.showLoading({ title: "删除中" });
    try {
      await wx.cloud.callFunction({
        name: "resumeService",
        data: { action: "remove", id },
      });
      wx.showToast({ title: "已删除" });
      this.reload();
    } catch (e2) {
      wx.showToast({ title: "删除失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },
});
