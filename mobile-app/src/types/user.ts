// 用户与角色类型，对齐 frontend AuthContext 的 User 结构

export interface User {
  id: string;
  _id?: string;
  username: string;
  name: string;
  phone?: string;
  email?: string;
  avatar?: string;
  role: string;
  department?: string;
  permissions?: string[];
  wechatOpenId?: string;
  wechatNickname?: string;
  wechatAvatar?: string;
  wechatAppBound?: boolean;
}

/** 登录接口返回 data 结构 */
export interface LoginResult {
  access_token: string;
  user: User;
}

export interface WechatAppLoginResult {
  requiresBinding?: boolean;
  access_token?: string;
  user?: User;
}
