const SHARE_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得最新合同/安得褓贝定稿.jpg';

Page({
  data: {
    shareLogo: '',
    features: [
      { icon: '🔎', title: '专业背景调查', desc: '入职前严格核查身份、从业经历与信用记录' },
      { icon: '⚡', title: '24小时极速响应', desc: '全天候客服在线，紧急需求快速安排' },
      { icon: '🔄', title: '不限次换人', desc: '服务期间内不满意可随时免费更换，无需理由' },
      { icon: '🛡️', title: '百万职业保险', desc: '家政人员均投保百万级职业险，用人无忧' },
      { icon: '🎓', title: '定期回炉培训', desc: '持续技能提升，确保服务水准与时俱进' },
      { icon: '🏫', title: '国家授权机构', desc: '国家开放大学授权培训机构，专业有保障' },
      { icon: '💸', title: '无忧退', desc: '3天内无条件退款，服务不满意分毫不留' },
      { icon: '📱', title: '保姆在线选', desc: '线上浏览阿姨档案，便捷高效自主挑选' }
    ]
  },

  onLoad() {
    this.loadShareLogo();
  },

  async loadShareLogo() {
    try {
      const res = await wx.cloud.getTempFileURL({ fileList: [SHARE_LOGO_FILE_ID] });
      const temp = res?.fileList?.[0]?.tempFileURL;
      if (temp) this.setData({ shareLogo: temp });
    } catch (err) {
      console.error('获取分享Logo失败:', err);
    }
  },

  onShareAppMessage() {
    return {
      title: '安得褓贝｜服务费透明公示',
      path: '/pages/serviceFee/index',
      imageUrl: this.data.shareLogo || ''
    };
  }
});
