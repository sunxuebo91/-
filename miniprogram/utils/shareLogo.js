// 安得褓贝品牌 LOGO 分享卡片图（与 5 个报价页共用同一资源）
const SHARE_LOGO_FILE_ID = 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得最新合同/安得褓贝定稿.jpg';
const FALLBACK_IMAGE = '/images/default-goods-image.png';

let cachedLogoUrl = '';

function loadShareLogo(page) {
  if (cachedLogoUrl) {
    page.setData({ shareLogo: cachedLogoUrl });
    return Promise.resolve(cachedLogoUrl);
  }
  return wx.cloud.getTempFileURL({ fileList: [SHARE_LOGO_FILE_ID] })
    .then(res => {
      const temp = res && res.fileList && res.fileList[0] && res.fileList[0].tempFileURL;
      if (temp) {
        cachedLogoUrl = temp;
        page.setData({ shareLogo: temp });
      }
      return temp || '';
    })
    .catch(err => {
      console.error('获取分享LOGO失败:', err);
      return '';
    });
}

module.exports = {
  SHARE_LOGO_FILE_ID,
  FALLBACK_IMAGE,
  loadShareLogo
};
