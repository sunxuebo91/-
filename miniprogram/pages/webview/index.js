Page({
  data: { url: '' },

  onLoad({ url, title }) {
    const decoded = decodeURIComponent(url || '');
    this.setData({ url: decoded });
    if (title) {
      wx.setNavigationBarTitle({ title: decodeURIComponent(title) });
    }
  },

  // web-view 加载失败时提示
  onWebViewError() {
    wx.showToast({ title: '页面加载失败', icon: 'none' });
  },
});

