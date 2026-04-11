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

  if (staffId) {
    // 优先：带 sharerId + sf=1 + 手机号
    const full = `${basePath}&shared=1&sharerId=${encodeURIComponent(staffId)}&sf=1${staffPhone ? `&p=${encodeURIComponent(staffPhone)}` : ''}`;
    // 次选：带 sharerId + sf=1（无手机号）
    const noPhone = `${basePath}&shared=1&sharerId=${encodeURIComponent(staffId)}&sf=1`;
    // 再次：只带 sf=1（无 sharerId，无手机号；回流时靠顾问主动关联）
    const minShared = `${basePath}&shared=1&sf=1`;

    if (full.length <= 128) {
      path = full;
    } else if (noPhone.length <= 128) {
      path = noPhone;
      console.warn(`[getResumeMiniCode] 路径超128字符，手机号已省略 (${full.length}字符)`);
    } else if (minShared.length <= 128) {
      path = minShared;
      console.warn(`[getResumeMiniCode] 路径超128字符，sharerId已省略 (${noPhone.length}字符)`);
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
  const cloudPath = staffId
    ? `resume-qrcodes/resume-${resumeId}-${staffId}.png`
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
  }
};
