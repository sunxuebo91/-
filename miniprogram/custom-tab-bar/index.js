// 渐变填色图标 PNG 路径(icons_v2/ 目录)
const icons = {
  home: "/images/icons_v2/tabbar-home.png",
  homeActive: "/images/icons_v2/tabbar-home.png",
  message: "/images/icons_v2/tabbar-message.png",
  messageActive: "/images/icons_v2/tabbar-message.png",
  orderHall: "/images/icons_v2/tabbar-orderHall.png",
  orderHallActive: "/images/icons_v2/tabbar-orderHall.png",
  profile: "/images/icons_v2/tabbar-profile.png",
  profileActive: "/images/icons_v2/tabbar-profile.png",
};

Component({
  data: {
    selected: 0,
    messageBadge: 0,   // 消息未读数
    list: [
      {
        pagePath: "/pages/home/index",
        text: "首页",
        iconPath: icons.home,
        selectedIconPath: icons.homeActive
      },
      {
        pagePath: "/pages/message/index",
        text: "消息",
        iconPath: icons.message,
        selectedIconPath: icons.messageActive
      },
      {
        pagePath: "/pages/orderHall/index",
        text: "接单大厅",
        iconPath: icons.orderHall,
        selectedIconPath: icons.orderHallActive
      },
      {
        pagePath: "/pages/profile/index",
        text: "我的",
        iconPath: icons.profile,
        selectedIconPath: icons.profileActive
      }
    ]
  },

  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const path = e.currentTarget.dataset.path;

      wx.switchTab({
        url: path
      });
    }
  }
});

