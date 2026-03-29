const userService = require('../../services/userService.js');

Page({
  data: {
    // 云文件ID - 注意：需要确保这个文件在云存储中存在
    contractFileId: 'cloud://cloud1-6gyrh73h8e8206ce.636c-cloud1-6gyrh73h8e8206ce-1393415530/安得最新合同/安得家政保姆服务合同20260121.docx'
  },

  onLoad() {
    // 页面加载
  },

  // 分享给好友
  onShareAppMessage() {
    return {
      title: '安得家政保姆服务合同',
      path: '/pages/qaService/index',
      imageUrl: '/images/icons/document.svg'
    };
  },

  // 跳转到上户须知页面
  goHouseRules() {
    wx.navigateTo({
      url: '/pages/houseRules/index'
    });
  },

  // 跳转到小时工合同预览详情页
  goHourlyContractPreview() {
    wx.navigateTo({
      url: '/pages/hourlyContractPreview/index'
    });
  },

  // 跳转到保姆育儿合同预览详情页
  goNannyChildcareContractPreview() {
    wx.navigateTo({
      url: '/pages/nannyChildcareContractPreview/index'
    });
  },



  // 预览合同文档（保留，供详情页使用）

  previewContract() {
    console.log('点击了合同预览卡片');

    wx.showLoading({
      title: '加载中...',
      mask: true
    });

    // 获取云文件的临时链接
    wx.cloud.getTempFileURL({
      fileList: [this.data.contractFileId],
      success: res => {
        console.log('获取临时链接成功', res);
        wx.hideLoading();

        if (res.fileList && res.fileList.length > 0) {
          const fileInfo = res.fileList[0];
          console.log('文件信息:', fileInfo);

          // 检查是否有错误
          if (fileInfo.status !== 0) {
            console.error('文件获取失败:', fileInfo);

            // 权限错误提示
            if (fileInfo.errMsg === 'STORAGE_EXCEED_AUTHORITY') {
              wx.showModal({
                title: '权限不足',
                content: '该文件需要管理员在云开发控制台设置访问权限。\n\n请联系管理员将云存储文件夹权限设置为"所有用户可读"。',
                showCancel: false,
                confirmText: '我知道了'
              });
            } else {
              wx.showToast({
                title: fileInfo.errMsg || '文件不存在',
                icon: 'none',
                duration: 3000
              });
            }
            return;
          }

          const tempFileURL = fileInfo.tempFileURL;
          console.log('临时链接:', tempFileURL);

          if (!tempFileURL) {
            wx.showToast({
              title: '文件链接获取失败',
              icon: 'none'
            });
            return;
          }

          // 下载文件到本地
          wx.downloadFile({
            url: tempFileURL,
            success: function (downloadRes) {
              console.log('下载文件成功', downloadRes);
              if (downloadRes.statusCode === 200) {
                // 打开文档
                wx.openDocument({
                  filePath: downloadRes.tempFilePath,
                  fileType: 'docx',
                  showMenu: true,
                  success: function () {
                    console.log('文档打开成功');
                  },
                  fail: function (err) {
                    console.error('文档打开失败', err);
                    wx.showToast({
                      title: '文档打开失败',
                      icon: 'none'
                    });
                  }
                });
              } else {
                console.error('下载状态码异常', downloadRes.statusCode);
                wx.showToast({
                  title: '文件下载失败',
                  icon: 'none'
                });
              }
            },
            fail: function (err) {
              console.error('文件下载失败', err);
              wx.showToast({
                title: '文件下载失败',
                icon: 'none'
              });
            }
          });
        } else {
          wx.showToast({
            title: '文件不存在',
            icon: 'none'
          });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('获取文件链接失败', err);
        wx.showToast({
          title: '获取文件失败',
          icon: 'none'
        });
      }
    });
  }
});