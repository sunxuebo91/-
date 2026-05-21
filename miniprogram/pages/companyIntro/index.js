const SHARE_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得最新合同/安得褓贝定稿.jpg';

Page({
  data: {
    shareLogo: ''
  },

  onLoad() {
    this.loadShareLogo();
  },

  async loadShareLogo() {
    try {
      const res = await wx.cloud.getTempFileURL({
        fileList: [SHARE_LOGO_FILE_ID]
      });
      const temp = res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL;
      if (temp) {
        this.setData({ shareLogo: temp });
      }
    } catch (err) {
      console.error('获取品牌LOGO失败:', err);
    }
  },

  onShareAppMessage() {
    return {
      title: '安得褓贝 - 安心托付 · 专业守护',
      path: '/pages/companyIntro/index',
      imageUrl: this.data.shareLogo || '/images/default-goods-image.png'
    };
  },

  onShareTimeline() {
    return {
      title: '安得褓贝 - 安心托付 · 专业守护',
      imageUrl: this.data.shareLogo || '/images/default-goods-image.png'
    };
  }
});
