const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const _ = db.command;

async function safeCreateCollection(name) {
  try {
    await db.createCollection(name);
  } catch (e) {
    // ignore: already exists / no permission
  }
}

async function ensureCollections() {
  await Promise.all([
    safeCreateCollection("users"),
    safeCreateCollection("staff"),
    safeCreateCollection("resumes"),
  ]);
}

async function isStaff(openid) {
  // 先获取用户信息，拿到手机号
  const userRes = await db
    .collection("users")
    .where({ _openid: openid })
    .limit(1)
    .get();

  const phone = userRes.data && userRes.data[0] && userRes.data[0].phone;

  // 优先通过手机号判断
  if (phone) {
    const phoneStr = String(phone).trim();
    if (phoneStr) {
      const r = await db
        .collection("staff")
        .where({ phone: phoneStr })
        .limit(1)
        .get();
      if (r.data && r.data.length > 0) return true;
    }
  }

  // 兼容旧的 openid 方式
  const r = await db
    .collection("staff")
    .where({ openid })
    .limit(1)
    .get();
  return r.data && r.data.length > 0;
}

function pickPublicFields(doc) {
  if (!doc) return doc;
  return {
    _id: doc._id,
    name: doc.name,
    age: doc.age,
    city: doc.city,
    experienceYears: doc.experienceYears,
    priceMonth: doc.priceMonth,
    tags: doc.tags,
    intro: doc.intro,
    coverFileId: doc.coverFileId,
    photos: doc.photos,
    videoFileId: doc.videoFileId,
    status: doc.status,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  };
}

async function listResumes(event) {
  const page = Math.max(0, Number(event.page) || 0);
  const pageSize = Math.min(20, Math.max(1, Number(event.pageSize) || 10));
  const keyword = (event.keyword || "").trim();

  let query = {
    status: "published",
  };

  // 简单关键词匹配：姓名/城市（云开发查询不支持 "$or"，需用 db.command.or/and）
  if (keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const reg = db.RegExp({ regexp: escaped, options: "i" });
    query = _.and([
      { status: "published" },
      _.or([{ name: reg }, { city: reg }]),
    ]);
  }

  const r = await db
    .collection("resumes")
    .where(query)
    .orderBy("updatedAt", "desc")
    .skip(page * pageSize)
    .limit(pageSize)
    .get();

  return (r.data || []).map(pickPublicFields);
}

async function getDetail(event, openid) {
  const id = event.id;
  if (!id) throw new Error("missing id");

  const forManage = !!event.forManage;
  if (forManage) {
    const ok = await isStaff(openid);
    if (!ok) throw new Error("permission denied");
  }

  const r = await db.collection("resumes").doc(id).get();
  return pickPublicFields(r.data);
}

async function listForManage(openid) {
  const ok = await isStaff(openid);
  if (!ok) throw new Error("permission denied");

  const r = await db
    .collection("resumes")
    .orderBy("updatedAt", "desc")
    .limit(100)
    .get();

  return (r.data || []).map(pickPublicFields);
}

async function upsertResume(openid, data) {
  const ok = await isStaff(openid);
  if (!ok) throw new Error("permission denied");

  const now = db.serverDate();
  const doc = {
    name: (data.name || "").trim(),
    age: data.age,
    city: (data.city || "").trim(),
    experienceYears: data.experienceYears,
    priceMonth: data.priceMonth,
    tags: Array.isArray(data.tags) ? data.tags : [],
    intro: data.intro || "",
    coverFileId: data.coverFileId || "",
    photos: Array.isArray(data.photos) ? data.photos : [],
    videoFileId: data.videoFileId || "",
    status: data.status === "published" ? "published" : "draft",
    updatedAt: now,
  };

  if (data._id) {
    await db.collection("resumes").doc(data._id).update({ data: doc });
    return { _id: data._id };
  }

  const addRes = await db.collection("resumes").add({
    data: {
      ...doc,
      createdAt: now,
      createdBy: openid,
    },
  });

  return { _id: addRes._id };
}

async function removeResume(openid, id) {
  const ok = await isStaff(openid);
  if (!ok) throw new Error("permission denied");
  if (!id) throw new Error("missing id");

  await db.collection("resumes").doc(id).remove();
  return true;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    // 首次初始化：自动创建必要集合，避免新环境直接报“集合不存在”
    await ensureCollections();

    switch (event.action) {
      case "list": {
        const data = await listResumes(event);
        return { success: true, data };
      }
      case "detail": {
        const data = await getDetail(event, openid);
        return { success: true, data };
      }
      case "listForManage": {
        const data = await listForManage(openid);
        return { success: true, data };
      }
      case "upsert": {
        const data = await upsertResume(openid, event.data || {});
        return { success: true, data };
      }
      case "remove": {
        await removeResume(openid, event.id);
        return { success: true };
      }
      default:
        return { success: false, errMsg: "unknown action" };
    }
  } catch (e) {
    return { success: false, errMsg: e && e.message ? e.message : String(e) };
  }
};
