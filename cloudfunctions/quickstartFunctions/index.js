const cloud = require("wx-server-sdk");
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
// 获取openid
const getOpenId = async () => {
  // 获取基础信息
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
};

// 获取小程序二维码
const getMiniProgramCode = async () => {
  // 获取小程序二维码的buffer
  const resp = await cloud.openapi.wxacode.get({
    path: "pages/index/index",
  });
  const { buffer } = resp;
  // 将图片上传云存储空间
  const upload = await cloud.uploadFile({
    cloudPath: "code.png",
    fileContent: buffer,
  });
  return upload.fileID;
};

// 生成指定简历详情页的小程序码
// 使用 wxacode.get + path 传 ID，避免 getUnlimited scene 32 字节限制导致 ID 被截断
// 支持传入 staffId / staffPhone，让扫码进入时也能识别为"分享进入"并展示联系顾问
const getResumeMiniCode = async (event) => {
  const resumeId = (event.resumeId || '').toString();
  const staffId   = (event.staffId   || '').toString();
  const staffPhone = (event.staffPhone || '').toString();
  if (!resumeId) throw new Error('missing resumeId');

  // path 最长支持 128 字符；逐步降级：完整 > 无phone > 无sharerId > 最小(只保 shared+sf)
  // 无论如何都保留 shared=1&sf=1，确保扫码后能触发"简历被查看"通知
  const basePath = `pages/resumeDetail/index?id=${encodeURIComponent(resumeId)}`;
  let path = basePath;

  // staffId 或 staffPhone 任意一个非空，均应在二维码路径中携带 shared=1&sf=1
  // 解决"招生老师"等角色 crmUserInfo 中无 userId 字段时，扫码方看不到顾问底部信息的问题
  if (staffId || staffPhone) {
    const sharerPart = staffId ? `&sharerId=${encodeURIComponent(staffId)}` : '';
    const phonePart  = staffPhone ? `&p=${encodeURIComponent(staffPhone)}` : '';
    // 优先：带 sharerId + sf=1 + 手机号（能放下就用全量）
    const full     = `${basePath}&shared=1${sharerPart}&sf=1${phonePart}`;
    // 次选：带 sharerId + sf=1（无手机号）
    const noPhone  = `${basePath}&shared=1${sharerPart}&sf=1`;
    // 再次：只带手机号 + sf=1（无 sharerId）
    const phoneOnly = staffPhone ? `${basePath}&shared=1&sf=1${phonePart}` : '';
    // 兜底：只保 shared=1&sf=1（无任何身份信息，扫码后显示默认顾问名）
    const minShared = `${basePath}&shared=1&sf=1`;

    if (full.length <= 128) {
      path = full;
    } else if (noPhone.length <= 128) {
      path = noPhone;
      console.warn(`[getResumeMiniCode] 路径超128字符，手机号已省略 (${full.length}字符)`);
    } else if (phoneOnly && phoneOnly.length <= 128) {
      path = phoneOnly;
      console.warn(`[getResumeMiniCode] 路径超128字符，sharerId已省略 (${noPhone.length}字符)`);
    } else if (minShared.length <= 128) {
      path = minShared;
      console.warn(`[getResumeMiniCode] 路径超128字符，sharerId/phone均已省略 (${noPhone.length}字符)`);
    } else {
      // 极端情况：连 shared=1&sf=1 都放不下，退回纯ID（实际上几乎不可能）
      path = basePath;
      console.error(`[getResumeMiniCode] 路径超128字符，无法附加分享信息 (${minShared.length}字符)`);
    }
  }

  const resp = await cloud.openapi.wxacode.get({
    path,
    width: 200,        // 生成更精致的小尺寸码
    is_hyaline: true,  // 透明背景 PNG
  });
  const { buffer } = resp;
  // 每个员工对每张简历各缓存一份，避免不同员工扫码看到错误的顾问信息
  // staffId 为空时用手机号（去除非数字字符）区分不同员工
  const cacheKey  = staffId || staffPhone.replace(/\D/g, '');
  const cloudPath = cacheKey
    ? `resume-qrcodes/resume-${resumeId}-${cacheKey}.png`
    : `resume-qrcodes/resume-${resumeId}.png`;
  const upload = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer,
  });
  return { success: true, fileID: upload.fileID };
};

// 生成首页小程序码（固定路径，缓存云存储）
const getHomeMiniCode = async () => {
  const cloudPath = 'home-qrcode/home.png';
  // 先尝试直接取已缓存的
  try {
    const tempRes = await cloud.getTempFileURL({ fileList: [`cloud://${cloud.DYNAMIC_CURRENT_ENV}.${cloudPath}`] });
    if (tempRes?.fileList?.[0]?.tempFileURL) {
      // 已缓存，直接返回 fileID 形式
    }
  } catch (_) { /* 未缓存则继续生成 */ }

  const resp = await cloud.openapi.wxacode.get({
    path: 'pages/home/index',
    width: 200,
    is_hyaline: true,
  });
  const upload = await cloud.uploadFile({
    cloudPath,
    fileContent: resp.buffer,
  });
  return { success: true, fileID: upload.fileID };
};

// 生成工资测评小程序码（海报二维码 → 直达 /pages/salaryAssessment/index）
// 携带 sharerId / sharerPhone / sharerOpenid，与 sharerUtils.parseSharerFromOptions 字段一致
// 路径上限 128 字符，超出则按优先级降级（保留 shared=1 + sharerId）
const getSalaryAssessmentMiniCode = async (event) => {
  const staffId     = (event.staffId     || '').toString();
  const staffPhone  = (event.staffPhone  || '').toString();
  const staffOpenid = (event.staffOpenid || '').toString();

  const basePath = 'pages/salaryAssessment/index';
  const idPart    = staffId     ? `&sharerId=${encodeURIComponent(staffId)}`         : '';
  const phonePart = staffPhone  ? `&sharerPhone=${encodeURIComponent(staffPhone)}`   : '';
  const oidPart   = staffOpenid ? `&sharerOpenid=${encodeURIComponent(staffOpenid)}` : '';

  const full      = `${basePath}?shared=1${idPart}${phonePart}${oidPart}`;
  const noOpenid  = `${basePath}?shared=1${idPart}${phonePart}`;
  const idOnly    = `${basePath}?shared=1${idPart}`;
  const minShared = `${basePath}?shared=1`;

  let path = minShared;
  if      (full.length      <= 128) path = full;
  else if (noOpenid.length  <= 128) path = noOpenid;
  else if (idOnly.length    <= 128) path = idOnly;

  const resp = await cloud.openapi.wxacode.get({
    path,
    width: 200,
    is_hyaline: true,
  });

  // 每位员工独立缓存一份，扫码方看到正确顾问归属
  const staffKey  = (staffPhone.replace(/\D/g, '') || staffOpenid.slice(0, 16) || staffId || 'default');
  const cloudPath = `salary-assessment-qrcodes/sa-${staffKey}.png`;
  const upload = await cloud.uploadFile({ cloudPath, fileContent: resp.buffer });
  return { success: true, fileID: upload.fileID };
};

// 生成课程详情页小程序码（员工分享课程宣传海报用）
// path: pages/course-detail/index?id=xxx&shared=1&sharerId=...&sf=1&p=...
// 支持 128 字符路径降级，员工独立缓存
const getCoursePromoMiniCode = async (event) => {
  const courseId   = (event.courseId   || '').toString();
  const staffId    = (event.staffId    || '').toString();
  const staffPhone = (event.staffPhone || '').toString();
  if (!courseId) throw new Error('missing courseId');

  const basePath = `pages/course-detail/index?id=${encodeURIComponent(courseId)}`;
  let path = basePath;

  if (staffId || staffPhone) {
    const sharerPart = staffId    ? `&sharerId=${encodeURIComponent(staffId)}`   : '';
    const phonePart  = staffPhone ? `&p=${encodeURIComponent(staffPhone)}`       : '';
    const full      = `${basePath}&shared=1${sharerPart}&sf=1${phonePart}`;
    const noPhone   = `${basePath}&shared=1${sharerPart}&sf=1`;
    const phoneOnly = staffPhone ? `${basePath}&shared=1&sf=1${phonePart}` : '';
    const minShared = `${basePath}&shared=1&sf=1`;

    if      (full.length      <= 128) path = full;
    else if (noPhone.length   <= 128) path = noPhone;
    else if (phoneOnly && phoneOnly.length <= 128) path = phoneOnly;
    else if (minShared.length <= 128) path = minShared;
    else {
      path = basePath;
      console.error(`[getCoursePromoMiniCode] 路径超 128 字符，无法附加分享信息`);
    }
  }

  const resp = await cloud.openapi.wxacode.get({
    path,
    width:      200,
    is_hyaline: true,
  });
  const cacheKey  = staffId || staffPhone.replace(/\D/g, '');
  const cloudPath = cacheKey
    ? `course-qrcodes/course-${courseId}-${cacheKey}.png`
    : `course-qrcodes/course-${courseId}.png`;
  const upload = await cloud.uploadFile({ cloudPath, fileContent: resp.buffer });
  return { success: true, fileID: upload.fileID };
};

// 生成推荐人注册页小程序码（与 getResumeMiniCode 同样使用 wxacode.get）
// 发布正式版后扫码即可跳转到推荐人注册页
// 身份 token：phone + openid（CRM 端任一命中即可定位 staff），不再写入 staffId
// 原因：小程序端 crmUserInfo._id 是 miniprogram_users._id，和 staff._id 不是一张表
const getReferrerRegisterMiniCode = async (event) => {
  const staffPhone  = (event.staffPhone  || '').toString();
  const staffOpenid = (event.staffOpenid || '').toString();
  const customerId  = (event.customerId  || '').toString();  // 关联客户订单 ID

  const basePath = 'pages/referrerRegister/index';
  const params = [];
  if (staffPhone)  params.push(`p=${encodeURIComponent(staffPhone)}`);
  if (staffOpenid) params.push(`o=${encodeURIComponent(staffOpenid)}`);
  if (customerId)  params.push(`cid=${encodeURIComponent(customerId)}`);  // 携带订单关联
  const fullPath = params.length > 0 ? `${basePath}?${params.join('&')}` : basePath;
  const path = fullPath.length <= 128 ? fullPath : basePath;

  const resp = await cloud.openapi.wxacode.get({
    path,
    width:      200,
    is_hyaline: true,
  });

  // 每个客户对应独立的 QR 文件，避免多客户共享同一张码
  const staffKey  = staffPhone.replace(/\D/g, '') || staffOpenid.slice(0, 16) || 'default';
  const cidKey    = customerId ? `-${customerId.slice(0, 12)}` : '';
  const cacheKey  = `${staffKey}${cidKey}`;
  const cloudPath = `referrer-qrcodes/referrer-${cacheKey}.png`;
  const upload = await cloud.uploadFile({ cloudPath, fileContent: resp.buffer });
  return { success: true, fileID: upload.fileID };
};

// 创建集合
const createCollection = async () => {
  try {
    // 创建集合
    await db.createCollection("sales");
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "上海",
        sales: 11,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "南京",
        sales: 11,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "广州",
        sales: 22,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "深圳",
        sales: 22,
      },
    });
    return {
      success: true,
    };
  } catch (e) {
    // 这里catch到的是该collection已经存在，从业务逻辑上来说是运行成功的，所以catch返回success给前端，避免工具在前端抛出异常
    return {
      success: true,
      data: "create collection success",
    };
  }
};

// 查询数据
const selectRecord = async () => {
  // 返回数据库查询结果
  return await db.collection("sales").get();
};

// 更新数据
const updateRecord = async (event) => {
  try {
    // 遍历修改数据库信息
    for (let i = 0; i < event.data.length; i++) {
      await db
        .collection("sales")
        .where({
          _id: event.data[i]._id,
        })
        .update({
          data: {
            sales: event.data[i].sales,
          },
        });
    }
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 新增数据
const insertRecord = async (event) => {
  try {
    const insertRecord = event.data;
    // 插入数据
    await db.collection("sales").add({
      data: {
        region: insertRecord.region,
        city: insertRecord.city,
        sales: Number(insertRecord.sales),
      },
    });
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 删除数据
const deleteRecord = async (event) => {
  try {
    await db
      .collection("sales")
      .where({
        _id: event.data._id,
      })
      .remove();
    return {
      success: true,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// const getOpenId = require('./getOpenId/index');
// const getMiniProgramCode = require('./getMiniProgramCode/index');
// const createCollection = require('./createCollection/index');
// const selectRecord = require('./selectRecord/index');
// const updateRecord = require('./updateRecord/index');
// const sumRecord = require('./sumRecord/index');
// const fetchGoodsList = require('./fetchGoodsList/index');
// const genMpQrcode = require('./genMpQrcode/index');
// 云函数入口函数
exports.main = async (event, context) => {
  switch (event.type) {
    case "getOpenId":
      return await getOpenId();
    case "getMiniProgramCode":
      return await getMiniProgramCode();
    case "createCollection":
      return await createCollection();
    case "selectRecord":
      return await selectRecord();
    case "updateRecord":
      return await updateRecord(event);
    case "insertRecord":
      return await insertRecord(event);
    case "deleteRecord":
      return await deleteRecord(event);
    case "getResumeMiniCode":
      return await getResumeMiniCode(event);
    case "getHomeMiniCode":
      return await getHomeMiniCode();
    case "getReferrerRegisterMiniCode":
      return await getReferrerRegisterMiniCode(event);
    case "getSalaryAssessmentMiniCode":
      return await getSalaryAssessmentMiniCode(event);
    case "getCoursePromoMiniCode":
      return await getCoursePromoMiniCode(event);
  }
};
