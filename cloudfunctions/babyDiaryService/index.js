const cloud = require('wx-server-sdk');

// 用于快速确认“云函数是否已重新部署/生效”
const VERSION = '2026-01-28-babyDiaryService-v1';

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
    safeCreateCollection('users'),
    safeCreateCollection('staff'),
    safeCreateCollection('babyDiaries'),
    safeCreateCollection('serviceContracts'),
  ]);
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isYMD(v) {
  if (typeof v !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const dt = new Date(v + 'T00:00:00.000Z');
  return !isNaN(dt.getTime());
}

function parseYMD(v) {
  if (!isYMD(v)) return null;
  return new Date(v + 'T00:00:00.000Z');
}

function addDaysYMD(startYMD, deltaDays) {
  const d = parseYMD(startYMD);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + Number(deltaDays || 0));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysDiffInclusive(startYMD, endYMD) {
  const a = parseYMD(startYMD);
  const b = parseYMD(endYMD);
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000) + 1;
}

async function isStaff(openid) {
  // 先取 users 里的手机号（与 userService 保持一致）
  const userRes = await db
    .collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get();
  const phone = userRes?.data?.[0]?.phone;

  if (phone) {
    const phoneStr = String(phone).trim();
    if (phoneStr) {
      const r = await db
        .collection('staff')
        .where({ phone: phoneStr })
        .limit(1)
        .get();
      if (r?.data?.length) return true;
    }
  }

  // 兼容旧的 openid 方式
  const r2 = await db
    .collection('staff')
    .where({ openid })
    .limit(1)
    .get();
  return !!(r2?.data?.length);
}

async function ensureMe(openid) {
  const r = await db
    .collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get();

  if (r?.data?.length) {
    const me = r.data[0];
    // 保持 role 最新
    const role = (await isStaff(openid)) ? 'staff' : 'customer';
    if (me.role !== role) {
      await db.collection('users').where({ _openid: openid }).update({
        data: { role, updatedAt: db.serverDate() },
      });
      me.role = role;
    }
    if (!me._openid) me._openid = openid;
    return me;
  }

  const role = (await isStaff(openid)) ? 'staff' : 'customer';
  const doc = { role, createdAt: db.serverDate(), updatedAt: db.serverDate() };
  await db.collection('users').add({ data: doc });

  const r2 = await db
    .collection('users')
    .where({ _openid: openid })
    .limit(1)
    .get();
  const me2 = (r2?.data?.[0]) || doc;
  if (!me2._openid) me2._openid = openid;
  return me2;
}

function sanitizeDiaryPayload(input) {
  const data = input && typeof input === 'object' ? input : {};

  // 只允许写入这些字段（避免覆盖 nurseId/customerId 等权限字段）
  const baby = data.baby && typeof data.baby === 'object' ? data.baby : {};
  const mother = data.mother && typeof data.mother === 'object' ? data.mother : {};

  const safe = {
    baby: {
      basics: baby.basics && typeof baby.basics === 'object' ? baby.basics : {},
      feeding: baby.feeding && typeof baby.feeding === 'object' ? baby.feeding : {},
      excretion: baby.excretion && typeof baby.excretion === 'object' ? baby.excretion : {},
      sleep: baby.sleep && typeof baby.sleep === 'object' ? baby.sleep : {},
      care: baby.care && typeof baby.care === 'object' ? baby.care : {},
      notes: typeof baby.notes === 'string' ? baby.notes : '',
      photos: Array.isArray(baby.photos) ? baby.photos.filter(Boolean) : [],
    },
    mother: {
      basics: mother.basics && typeof mother.basics === 'object' ? mother.basics : {},
      lochia: mother.lochia && typeof mother.lochia === 'object' ? mother.lochia : {},
      breast: mother.breast && typeof mother.breast === 'object' ? mother.breast : {},
      diet: mother.diet && typeof mother.diet === 'object' ? mother.diet : {},
      excretion: mother.excretion && typeof mother.excretion === 'object' ? mother.excretion : {},
      mood: mother.mood && typeof mother.mood === 'object' ? mother.mood : {},
      wound: mother.wound && typeof mother.wound === 'object' ? mother.wound : {},
      notes: typeof mother.notes === 'string' ? mother.notes : '',
    },
  };

  // 兼容设计稿里 baby.temperature 这种直写：落到 basics
  if (baby && typeof baby.temperature === 'number') {
    safe.baby.basics.temperature = baby.temperature;
  }
  if (mother && typeof mother.temperature === 'number') {
    safe.mother.basics.temperature = mother.temperature;
  }

  return safe;
}

function normalizeStatus(v) {
  return v === 'published' ? 'published' : 'draft';
}

async function getContractById(contractId) {
  if (!contractId) throw new Error('missing contractId');
  const r = await db.collection('serviceContracts').doc(String(contractId)).get();
  if (!r || !r.data) throw new Error('contract not found');
  return r.data;
}

function computeDayNumber(contract, serviceDate) {
  const startDate = contract?.startDate;
  if (!isYMD(startDate) || !isYMD(serviceDate)) return null;
  return daysDiffInclusive(startDate, serviceDate);
}

function ensureInRange(contract, serviceDate) {
  const startDate = contract?.startDate;
  const endDate = contract?.endDate;
  if (!isYMD(startDate) || !isYMD(endDate)) throw new Error('contract date invalid');
  if (!isYMD(serviceDate)) throw new Error('serviceDate invalid');
  if (serviceDate < startDate || serviceDate > endDate) {
    throw new Error('serviceDate out of contract range');
  }
}

async function createDiary(openid, event) {
  const contractId = String(event.contractId || '').trim();
  const serviceDate = String(event.serviceDate || '').trim() || todayYMD();
  const status = normalizeStatus(event.status);

  if (!contractId) throw new Error('missing contractId');
  if (!isYMD(serviceDate)) throw new Error('invalid serviceDate');

  const me = await ensureMe(openid);
  if (me.role !== 'staff') throw new Error('permission denied');

  const contract = await getContractById(contractId);
  if (String(contract.nurseId) !== String(openid)) throw new Error('permission denied');
  ensureInRange(contract, serviceDate);

  // 防重复：同合同同一天只有一条（日记软删除不占用）
  const exist = await db
    .collection('babyDiaries')
    .where({
      contractId,
      serviceDate,
      deletedAt: _.exists(false),
    })
    .limit(1)
    .get();
  if (exist?.data?.length) {
    throw new Error('diary already exists for this date');
  }

  const now = db.serverDate();
  const dayNumber = computeDayNumber(contract, serviceDate);

  const payload = sanitizeDiaryPayload(event.data || {});

  const doc = {
    contractId,
    customerId: String(contract.customerId || ''),
    nurseId: String(contract.nurseId || ''),
    serviceDate,
    dayNumber: typeof dayNumber === 'number' ? dayNumber : null,
    status,
    ...payload,
    createdAt: now,
    updatedAt: now,
    createdBy: openid,
  };

  const addRes = await db.collection('babyDiaries').add({ data: doc });
  return { _id: addRes._id };
}

async function updateDiary(openid, event) {
  const id = String(event.id || '').trim();
  if (!id) throw new Error('missing id');

  const me = await ensureMe(openid);
  if (me.role !== 'staff') throw new Error('permission denied');

  const r = await db.collection('babyDiaries').doc(id).get();
  const diary = r?.data;
  if (!diary || diary.deletedAt) throw new Error('diary not found');
  if (String(diary.nurseId) !== String(openid)) throw new Error('permission denied');

  const payload = sanitizeDiaryPayload(event.data || {});
  const nextStatus = normalizeStatus(event.status || diary.status);

  const patch = {
    ...payload,
    status: nextStatus,
    updatedAt: db.serverDate(),
  };

  await db.collection('babyDiaries').doc(id).update({ data: patch });
  return { _id: id };
}

async function getDiary(openid, event) {
  const id = String(event.id || '').trim();
  const contractId = String(event.contractId || '').trim();
  const serviceDate = String(event.serviceDate || '').trim();

  let diary;
  if (id) {
    const r = await db.collection('babyDiaries').doc(id).get();
    diary = r?.data;
  } else {
    if (!contractId || !isYMD(serviceDate)) throw new Error('missing contractId/serviceDate');
    const r = await db
      .collection('babyDiaries')
      .where({
        contractId,
        serviceDate,
        deletedAt: _.exists(false),
      })
      .limit(1)
      .get();
    diary = r?.data?.[0];
  }

  if (!diary || diary.deletedAt) throw new Error('diary not found');

  const me = await ensureMe(openid);
  const canRead =
    String(diary.nurseId) === String(openid) ||
    String(diary.customerId) === String(openid);

  if (!canRead) throw new Error('permission denied');

  // 客户端只读，不限制字段；这里不做字段脱敏
  return diary;
}

async function listDiaries(openid, event) {
  const me = await ensureMe(openid);

  const page = Math.max(0, Number(event.page) || 0);
  const pageSize = Math.min(50, Math.max(1, Number(event.pageSize) || 20));

  const contractId = event.contractId ? String(event.contractId).trim() : '';
  const contractIds = Array.isArray(event.contractIds)
    ? event.contractIds.map((x) => String(x)).filter(Boolean)
    : [];
  const serviceDate = event.serviceDate ? String(event.serviceDate).trim() : '';
  const status = event.status ? String(event.status).trim() : '';

  const base = [];
  base.push({ deletedAt: _.exists(false) });

  if (me.role === 'staff') {
    base.push({ nurseId: String(openid) });
  } else {
    base.push({ customerId: String(openid) });
  }

  if (contractId) base.push({ contractId });
  if (contractIds.length) base.push({ contractId: _.in(contractIds) });
  if (serviceDate) {
    if (!isYMD(serviceDate)) throw new Error('invalid serviceDate');
    base.push({ serviceDate });
  }
  if (status) base.push({ status });

  const where = base.length === 1 ? base[0] : _.and(base);

  const col = db.collection('babyDiaries').where(where);

  const countRes = await col.count();
  const total = countRes?.total || 0;

  const r = await col
    .orderBy('serviceDate', 'desc')
    .orderBy('updatedAt', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get();

  return {
    items: r?.data || [],
    total,
    page,
    pageSize,
  };
}

async function deleteDiary(openid, event) {
  const id = String(event.id || '').trim();
  if (!id) throw new Error('missing id');

  const me = await ensureMe(openid);
  if (me.role !== 'staff') throw new Error('permission denied');

  const r = await db.collection('babyDiaries').doc(id).get();
  const diary = r?.data;
  if (!diary || diary.deletedAt) throw new Error('diary not found');
  if (String(diary.nurseId) !== String(openid)) throw new Error('permission denied');

  await db.collection('babyDiaries').doc(id).update({
    data: {
      deletedAt: db.serverDate(),
      deletedBy: openid,
      updatedAt: db.serverDate(),
    },
  });

  return true;
}

function sanitizeContractPayload(input) {
  const data = input && typeof input === 'object' ? input : {};
  const babyInfo = data.babyInfo && typeof data.babyInfo === 'object' ? data.babyInfo : {};

  const startDate = String(data.startDate || '').trim();
  const serviceDays = Number(data.serviceDays || 0);

  if (!isYMD(startDate)) throw new Error('invalid startDate');
  if (![26, 42, 52, 78].includes(serviceDays)) throw new Error('invalid serviceDays');

  const endDate = addDaysYMD(startDate, serviceDays - 1);
  if (!endDate) throw new Error('invalid endDate');

  return {
    customerId: String(data.customerId || '').trim(),
    nurseId: String(data.nurseId || '').trim(),
    serviceType: String(data.serviceType || '月嫂').trim() || '月嫂',
    serviceDays,
    startDate,
    endDate,
    babyInfo: {
      name: typeof babyInfo.name === 'string' ? babyInfo.name : '',
      birthDate: isYMD(String(babyInfo.birthDate || '').trim()) ? String(babyInfo.birthDate).trim() : '',
      gender: typeof babyInfo.gender === 'string' ? babyInfo.gender : '',
      birthWeight: typeof babyInfo.birthWeight === 'number' ? babyInfo.birthWeight : undefined,
      birthHeight: typeof babyInfo.birthHeight === 'number' ? babyInfo.birthHeight : undefined,
    },
    status: ['active', 'completed', 'cancelled'].includes(String(data.status))
      ? String(data.status)
      : 'active',
  };
}

async function createContract(openid, event) {
  const me = await ensureMe(openid);
  if (me.role !== 'staff') throw new Error('permission denied');

  const payload = sanitizeContractPayload(event.data || {});

  if (!payload.customerId) throw new Error('missing customerId');
  if (!payload.nurseId) throw new Error('missing nurseId');

  // 当前没有 admin 概念：限制只能创建“自己作为 nurseId 的合同”，避免员工创建他人合同
  if (String(payload.nurseId) !== String(openid)) throw new Error('permission denied');

  const now = db.serverDate();
  const doc = {
    ...payload,
    createdAt: now,
    updatedAt: now,
    createdBy: openid,
  };

  const addRes = await db.collection('serviceContracts').add({ data: doc });
  return { _id: addRes._id };
}

async function getContract(openid, event) {
  const id = String(event.id || '').trim();
  if (!id) throw new Error('missing id');

  const r = await db.collection('serviceContracts').doc(id).get();
  const contract = r?.data;
  if (!contract) throw new Error('contract not found');

  const me = await ensureMe(openid);
  const canRead =
    (me.role === 'staff' && String(contract.nurseId) === String(openid)) ||
    (me.role !== 'staff' && String(contract.customerId) === String(openid)) ||
    String(contract.customerId) === String(openid);

  if (!canRead) throw new Error('permission denied');

  return contract;
}

async function updateContract(openid, event) {
  const id = String(event.id || '').trim();
  if (!id) throw new Error('missing id');

  const me = await ensureMe(openid);
  if (me.role !== 'staff') throw new Error('permission denied');

  const r = await db.collection('serviceContracts').doc(id).get();
  const contract = r?.data;
  if (!contract) throw new Error('contract not found');
  if (String(contract.nurseId) !== String(openid)) throw new Error('permission denied');

  // 允许更新：status / babyInfo / startDate / serviceDays（会重算 endDate）
  const next = sanitizeContractPayload({
    ...contract,
    ...(event.data || {}),
  });

  // nurseId/customerId 不允许变更（避免越权）
  delete next.nurseId;
  delete next.customerId;

  await db.collection('serviceContracts').doc(id).update({
    data: {
      ...next,
      updatedAt: db.serverDate(),
    },
  });

  return { _id: id };
}

async function listContracts(openid, event) {
  const me = await ensureMe(openid);
  const page = Math.max(0, Number(event.page) || 0);
  const pageSize = Math.min(50, Math.max(1, Number(event.pageSize) || 20));

  const status = event.status ? String(event.status).trim() : '';

  const base = [];
  if (me.role === 'staff') base.push({ nurseId: String(openid) });
  else base.push({ customerId: String(openid) });

  if (status) base.push({ status });

  const where = base.length === 1 ? base[0] : _.and(base);

  const col = db.collection('serviceContracts').where(where);
  const countRes = await col.count();
  const total = countRes?.total || 0;

  const r = await col
    .orderBy('updatedAt', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get();

  return {
    items: r?.data || [],
    total,
    page,
    pageSize,
  };
}

async function getDiaryStats(openid, event) {
  const contractId = String(event.contractId || '').trim();
  if (!contractId) throw new Error('missing contractId');

  const contract = await getContractById(contractId);
  const me = await ensureMe(openid);

  const canRead =
    String(contract.nurseId) === String(openid) ||
    String(contract.customerId) === String(openid);
  if (!canRead) throw new Error('permission denied');

  const totalServiceDays = Number(contract.serviceDays || 0) || null;

  const publishedCountRes = await db
    .collection('babyDiaries')
    .where({
      contractId,
      status: 'published',
      deletedAt: _.exists(false),
    })
    .count();
  const publishedCount = publishedCountRes?.total || 0;

  const draftCountRes = await db
    .collection('babyDiaries')
    .where({
      contractId,
      status: 'draft',
      deletedAt: _.exists(false),
    })
    .count();
  const draftCount = draftCountRes?.total || 0;

  const completionRate = totalServiceDays ? (publishedCount / totalServiceDays) : 0;

  return {
    contractId,
    totalServiceDays,
    publishedCount,
    draftCount,
    completionRate,
  };
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    await ensureCollections();

    const action = event.action;

    // 轻量日志：便于在云开发控制台确认是否命中最新版本
    try {
      console.log('[babyDiaryService]', VERSION, 'action=', action);
    } catch (e) {}

    switch (action) {
      case 'createDiary': {
        const data = await createDiary(openid, event);
        return { success: true, data, meta: { version: VERSION } };
      }
      case 'updateDiary': {
        const data = await updateDiary(openid, event);
        return { success: true, data, meta: { version: VERSION } };
      }
      case 'getDiary': {
        const data = await getDiary(openid, event);
        return { success: true, data, meta: { version: VERSION } };
      }
      case 'listDiaries': {
        const data = await listDiaries(openid, event);
        return { success: true, data, meta: { version: VERSION } };
      }
      case 'deleteDiary': {
        const data = await deleteDiary(openid, event);
        return { success: true, data, meta: { version: VERSION } };
      }
      case 'createContract': {
        const data = await createContract(openid, event);
        return { success: true, data, meta: { version: VERSION } };
      }
      case 'getContract': {
        const data = await getContract(openid, event);
        return { success: true, data, meta: { version: VERSION } };
      }
      case 'listContracts': {
        const data = await listContracts(openid, event);
        return { success: true, data, meta: { version: VERSION } };
      }
      case 'updateContract': {
        const data = await updateContract(openid, event);
        return { success: true, data, meta: { version: VERSION } };
      }
      case 'getDiaryStats': {
        const data = await getDiaryStats(openid, event);
        return { success: true, data, meta: { version: VERSION } };
      }
      default:
        return { success: false, errMsg: 'unknown action', meta: { version: VERSION } };
    }
  } catch (e) {
    return {
      success: false,
      errMsg: e && e.message ? e.message : String(e),
      meta: { version: VERSION },
    };
  }
};
