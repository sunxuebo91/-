/**
 * 我的网课 学员端 API 封装
 *
 * 登录策略（小程序专用）：
 *   复用小程序全局登录态（crmUserInfo.phone/openid），调
 *   POST /api/course-student/auth-by-phone 静默换 token（7 天有效）。
 *   后续 /courses、/courses/:id、/progress 全部带 Authorization: Bearer ${token}。
 *   未开通（403 + NOT_ENROLLED）→ 显示"暂未开通网课"。
 *   H5 端的 /api/course-student/login（手机号+密码）后端仍保留，本工具不再使用。
 */

const BASE_URL = 'https://crm.andejiazheng.com';
const TOKEN_KEY = 'student_token';
const STUDENT_KEY = 'student_info';

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

function setToken(token) {
  if (token) wx.setStorageSync(TOKEN_KEY, token);
}

function setStudent(student) {
  if (student) wx.setStorageSync(STUDENT_KEY, student);
}

function getStudent() {
  return wx.getStorageSync(STUDENT_KEY) || null;
}

function clearAuth() {
  try {
    wx.removeStorageSync(TOKEN_KEY);
    wx.removeStorageSync(STUDENT_KEY);
  } catch (e) {}
}

/** 读取小程序当前登录用户的手机号 */
function getCurrentPhone() {
  const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
  return crmUserInfo.phone || '';
}

/** 读取小程序当前登录用户的 openid（可选，传给后端便于审计） */
function getCurrentOpenid() {
  const crmUserInfo = wx.getStorageSync('crmUserInfo') || {};
  return crmUserInfo.openid || crmUserInfo._openid || '';
}

/**
 * 统一请求
 * @param {Object} options - { url, method, data, auth }
 *   auth: 默认 true。false 时不带 Authorization（登录接口用）
 *   _retried: 内部使用，401 重试标记
 */
function request(options) {
  const { url, method = 'GET', data, auth = true, _retried = false } = options;
  return new Promise((resolve, reject) => {
    const header = {
      'Content-Type': 'application/json',
      'X-Client-Type': 'miniprogram',
    };
    if (auth) {
      const token = getToken();
      if (!token) return reject(new Error('NO_TOKEN'));
      header.Authorization = `Bearer ${token}`;
    }
    wx.request({
      url: BASE_URL + url,
      method,
      data: data || {},
      header,
      success: (res) => {
        if (res.statusCode === 401 && auth && !_retried) {
          // token 过期：清掉重新静默登录一次再重放当前请求
          clearAuth();
          ensureLogin({ silent: true })
            .then(() => request({ ...options, _retried: true }).then(resolve, reject))
            .catch(reject);
          return;
        }
        if (res.statusCode === 401) {
          return reject(new Error('AUTH_FAILED'));
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          const msg = (res.data && res.data.message) || `请求失败 (${res.statusCode})`;
          reject(new Error(msg));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

/**
 * 小程序专用：用手机号 + openid 静默换 student_token
 * 200 → 写入 token/student 并 resolve
 * 403 + NOT_ENROLLED → reject(Error('NOT_ENROLLED'))，userMessage 取后端文案
 * 其他 → reject 原始错误（网络/4xx/5xx），由调用方决定提示
 */
function authByPhone(phone, openid) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + '/api/course-student/auth-by-phone',
      method: 'POST',
      data: openid ? { phone, openid } : { phone },
      header: {
        'Content-Type': 'application/json',
        'X-Client-Type': 'miniprogram',
      },
      success: (res) => {
        const body = res.data || {};
        const payload = body.data || body;
        // 兼容多种 token 字段名
        const token = payload.token || payload.access_token || payload.accessToken
          || body.token || body.access_token || '';
        // 兼容多种 student 字段名
        const student = payload.student || payload.user || payload.studentInfo
          || body.student || null;

        console.log('[course-api] auth-by-phone:', res.statusCode, body);

        if ((res.statusCode === 200 || res.statusCode === 201) && token) {
          setToken(token);
          if (student) setStudent(student);
          else if (phone) setStudent({ phone });
          return resolve(payload);
        }
        // 未开通：兼容 403 / 404 / 200 + success:false 等多种返回形态
        const errCode = (body.error && body.error.details && body.error.details.code)
          || body.code || (body.error && body.error.code) || '';
        if (res.statusCode === 403 || res.statusCode === 404 || errCode === 'NOT_ENROLLED') {
          const e = new Error('NOT_ENROLLED');
          e.userMessage = body.message || '该手机号未开通网课';
          return reject(e);
        }
        const e = new Error(body.message || `认证失败 (${res.statusCode})`);
        e.statusCode = res.statusCode;
        reject(e);
      },
      fail: (err) => reject(err),
    });
  });
}

/**
 * 确保已登录（静默）
 * 1. 当前小程序未登录（没有 crmUserInfo.phone）→ 清掉任何残留 student_token 并抛 NEED_WECHAT_LOGIN
 * 2. 已有 student_token 且与当前 phone 匹配 → 复用
 * 3. 已有 student_token 但 phone 不匹配（切换账号）→ 清掉残留 token 后用新 phone 重新换 token
 * 4. 无 token → 调 auth-by-phone 换 token；NOT_ENROLLED 原样抛出
 */
function ensureLogin() {
  const phone = getCurrentPhone();
  if (!phone) {
    clearAuth();
    return Promise.reject(new Error('NEED_WECHAT_LOGIN'));
  }
  if (getToken()) {
    const student = getStudent();
    const studentPhone = student && (student.phone || student.mobile || '');
    if (studentPhone && String(studentPhone) === String(phone)) {
      return Promise.resolve(student);
    }
    // 账号不匹配（切换登录用户）或 student 信息丢失 → 清掉重新认证
    clearAuth();
  }
  return authByPhone(phone, getCurrentOpenid());
}

/** 课程列表 */
function getCourses() {
  return request({ url: '/api/course-student/courses' }).then((res) => {
    const payload = res && res.data ? res.data : res;
    return Array.isArray(payload) ? payload : (payload && payload.list) || [];
  });
}

/** 课程详情 */
function getCourseDetail(id) {
  return request({ url: `/api/course-student/courses/${id}` }).then((res) => {
    return res && res.data ? res.data : res;
  });
}

/**
 * 进度上报（容错：失败不抛，避免影响播放体验）
 * 后端字段已升级为 lessonId；保留 chapterId 入参做迁移期回退。
 */
function postProgress({ courseId, lessonId, chapterId, position, duration }) {
  const effectiveLessonId = lessonId || chapterId;
  return request({
    url: '/api/course-student/progress',
    method: 'POST',
    data: { courseId, lessonId: effectiveLessonId, position, duration },
  }).catch((err) => {
    console.warn('[course-api] progress report failed:', err && err.message);
    return null;
  });
}

module.exports = {
  BASE_URL,
  getToken,
  getStudent,
  setToken,
  setStudent,
  clearAuth,
  getCurrentPhone,
  getCurrentOpenid,
  ensureLogin,
  authByPhone,
  getCourses,
  getCourseDetail,
  postProgress,
};
