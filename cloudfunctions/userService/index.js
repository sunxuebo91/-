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
    safeCreateCollection("accounts"),
    safeCreateCollection("staff_profiles"),
  ]);
}

async function isStaff(openid, phone) {
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

async function getOrCreateMe(openid) {
  const r = await db
    .collection("users")
    .where({ _openid: openid })
    .limit(1)
    .get();

  if (r.data && r.data.length) {
    const user = r.data[0];
    // 重新判断角色（支持手机号白名单）
    const role = (await isStaff(openid, user.phone)) ? "staff" : "customer";
    if (user.role !== role) {
      await db.collection("users").where({ _openid: openid }).update({
        data: { role, updatedAt: db.serverDate() }
      });
      user.role = role;
    }
    // 确保返回的用户对象包含必要字段
    if (!user._openid) {
      user._openid = openid;
    }
    // 确保 phone 字段存在（即使为空字符串）
    if (user.phone === undefined) {
      user.phone = "";
    }
    // 确保 nickname 字段存在
    if (user.nickname === undefined) {
      user.nickname = "";
    }
    // 确保 avatarUrl 字段存在
    if (user.avatarUrl === undefined) {
      user.avatarUrl = "";
    }
    return user;
  }

  const role = (await isStaff(openid, null)) ? "staff" : "customer";
  const doc = {
    role,
    phone: "", // 新用户默认空手机号
    nickname: "", // 新用户默认空昵称
    avatarUrl: "", // 新用户默认空头像
    createdAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };

  await db.collection("users").add({ data: doc });

  const r2 = await db
    .collection("users")
    .where({ _openid: openid })
    .limit(1)
    .get();
  const user = (r2.data && r2.data[0]) || doc;
  // 确保返回的用户对象包含必要字段
  if (!user._openid) {
    user._openid = openid;
  }
  if (user.phone === undefined) {
    user.phone = "";
  }
  if (user.nickname === undefined) {
    user.nickname = "";
  }
  if (user.avatarUrl === undefined) {
    user.avatarUrl = "";
  }
  return user;
}

/**
 * 查询当前用户的完整信息（含 openid、phone、role）——用于排查员工认证问题
 */
async function getMyInfo(openid) {
  const user = await getOrCreateMe(openid);
  const staffByPhone = user.phone ? await db.collection('staff').where({ phone: String(user.phone).trim() }).limit(1).get() : { data: [] };
  const staffByOpenid = await db.collection('staff').where({ openid }).limit(1).get();
  return {
    openid,
    phone: user.phone || '',
    role: user.role,
    nickname: user.nickname || '',
    inStaffByPhone: staffByPhone.data.length > 0,
    inStaffByOpenid: staffByOpenid.data.length > 0,
  };
}

/**
 * 保存员工公开信息到 staff_profiles 集合
 * 员工生成海报/二维码时调用，确保扫码方能查询到完整顾问信息
 * 同时保存 staffOpenid，供 notificationService 按手机号直接拿到 openid 发通知
 */
async function saveStaffProfile(callerOpenid, staffId, name, phone, avatar, company) {
  if (!staffId && !phone) throw new Error('missing staffId or phone');
  const staffIdStr = staffId ? String(staffId) : '';
  const docFull = {
    staffId: staffIdStr,
    name: name || '',
    phone: phone || '',
    avatar: avatar || '',
    company: company || '安得褓贝',
    updatedAt: db.serverDate()
  };
  // 关键：把调用者 openid 一并存入，通知服务可按 phone → openid 直接查此集合
  if (callerOpenid) docFull.staffOpenid = callerOpenid;

  try {
    const existing = staffIdStr
      ? await db.collection('staff_profiles').where({ staffId: staffIdStr }).limit(1).get()
      : { data: [] };
    if (existing.data && existing.data.length > 0) {
      const docUpdate = { updatedAt: db.serverDate(), company: company || '安得褓贝' };
      if (phone) docUpdate.phone = phone;
      if (name) docUpdate.name = name;
      if (avatar) docUpdate.avatar = avatar;
      if (callerOpenid) docUpdate.staffOpenid = callerOpenid;  // 始终更新 openid
      await db.collection('staff_profiles').where({ staffId: staffIdStr }).update({ data: docUpdate });
    } else {
      await db.collection('staff_profiles').add({ data: { ...docFull, createdAt: db.serverDate() } });
    }
    console.log('[saveStaffProfile] ✅ staff_profiles 已保存, phone:', phone, 'openid:', callerOpenid);
  } catch (e) {
    console.error('saveStaffProfile error:', e);
  }

  return docFull;
}

/**
 * 按 staffId / 手机号查询顾问公开信息（姓名、电话、头像）
 * 供客户扫海报二维码进入简历详情页时，异步拉取分享顾问的完整信息
 * 查找顺序：staff_profiles(staffId) → staff_profiles(phone) → users.doc → users(phone)
 */
async function getStaffPublicInfo(userId, phone) {
  // 1. 优先从 staff_profiles 按 staffId 查找（生成海报时已缓存）
  // 注意：老数据 staffId 可能是整数，新数据统一为字符串，需同时兼容两种类型
  if (userId) {
    try {
      const userIdStr = String(userId);
      let r = await db.collection('staff_profiles').where({ staffId: userIdStr }).limit(1).get();
      // 兼容旧记录：若字符串未命中，再尝试数字类型（历史遗留整数 staffId）
      if ((!r.data || !r.data.length) && !isNaN(Number(userId)) && Number(userId) > 0) {
        r = await db.collection('staff_profiles').where({ staffId: Number(userId) }).limit(1).get();
      }
      if (r.data && r.data[0]) {
        const p = r.data[0];
        return { _id: userId, name: p.name || '', phone: p.phone || '', avatar: p.avatar || '', company: p.company || '安得褓贝' };
      }
    } catch (e) { /* 继续尝试其他方式 */ }
  }

  // 2. 按手机号从 staff_profiles 查找
  if (phone) {
    try {
      const r = await db.collection('staff_profiles').where({ phone: String(phone) }).limit(1).get();
      if (r.data && r.data[0]) {
        const p = r.data[0];
        return { _id: p.staffId || userId || '', name: p.name || '', phone: p.phone || '', avatar: p.avatar || '', company: p.company || '安得褓贝' };
      }
    } catch (e) { /* 继续 */ }
  }

  // 3. 兼容旧逻辑：按 userId 从 users 集合 doc 查找
  let user = null;
  if (userId) {
    try {
      const r = await db.collection('users').doc(userId).get();
      if (r.data) user = r.data;
    } catch (e) { /* 不存在 */ }
  }

  // 4. 按手机号从 users 集合查找
  if (!user && phone) {
    try {
      const r = await db.collection('users').where({ phone: String(phone) }).limit(1).get();
      if (r.data && r.data[0]) user = r.data[0];
    } catch (e) { /* 不存在 */ }
  }

  if (!user) throw new Error('user not found');
  return {
    _id: user._id || userId || '',
    name: user.name || user.nickname || '',
    phone: user.phone || '',
    avatar: user.avatarUrl || user.avatar || '',
    company: '安得褓贝',
  };
}

/**
 * 将指定手机号或当前用户 openid 加入 staff 白名单
 * - staffCollection 为空时（首次引导）任何人可调用
 * - staffCollection 非空时，调用者自身必须已在 staff 名单中
 */
async function addStaff(callerOpenid, phone, targetOpenid) {
  // 检查 staff 集合是否为空（首次引导模式）
  const existing = await db.collection('staff').limit(1).get();
  const bootstrapMode = !existing.data || existing.data.length === 0;

  if (!bootstrapMode) {
    // 非首次引导：调用者必须已是 staff
    const callerIsStaff = await isStaff(callerOpenid, null);
    if (!callerIsStaff) {
      return { success: false, errMsg: '仅员工可添加新员工' };
    }
  }

  const doc = { createdAt: db.serverDate() };
  if (phone) doc.phone = String(phone).trim();
  if (targetOpenid) doc.openid = targetOpenid;

  if (!doc.phone && !doc.openid) {
    return { success: false, errMsg: '请提供手机号或 openid' };
  }

  await db.collection('staff').add({ data: doc });

  // 同步更新 users 集合中对应用户的 role
  if (doc.phone) {
    await db.collection('users').where({ phone: doc.phone }).update({ data: { role: 'staff', updatedAt: db.serverDate() } });
  }
  if (doc.openid) {
    await db.collection('users').where({ _openid: doc.openid }).update({ data: { role: 'staff', updatedAt: db.serverDate() } });
  }

  return { success: true, data: doc };
}

async function updateMe(openid, data) {
  console.log("updateMe 调用，openid:", openid, "data:", data);

  const safe = {
    updatedAt: db.serverDate(),
  };

  if (typeof data.nickname === "string") safe.nickname = data.nickname;
  if (typeof data.avatarUrl === "string") safe.avatarUrl = data.avatarUrl;
  if (typeof data.phone === "string") safe.phone = data.phone;

  console.log("准备更新的字段:", safe);

  // 先查询用户记录，获取 _id
  const userQuery = await db
    .collection("users")
    .where({ _openid: openid })
    .limit(1)
    .get();

  console.log("用户查询结果:", userQuery);

  let updateResult;
  if (userQuery.data && userQuery.data.length > 0) {
    // 使用 doc(_id) 方式更新，更可靠
    const userId = userQuery.data[0]._id;
    console.log("找到用户记录，_id:", userId);
    
    updateResult = await db
      .collection("users")
      .doc(userId)
      .update({
        data: safe,
      });
  } else {
    // 如果没有找到记录，尝试使用 where 更新（兼容旧逻辑）
    console.warn("未找到匹配的用户记录，尝试 where 更新，openid:", openid);
    updateResult = await db
      .collection("users")
      .where({ _openid: openid })
      .update({
        data: safe,
      });
  }

  console.log("数据库更新结果:", updateResult);

  // 检查是否更新了记录
  if (updateResult.stats && updateResult.stats.updated === 0) {
    console.warn("更新失败，未更新任何记录，openid:", openid);
  }

  return await getOrCreateMe(openid);
}

async function loginByPhone(openid, code, nickname, avatarUrl) {
  try {
    console.log("loginByPhone 开始，参数:", { openid, code, nickname, avatarUrl });

    // 调用微信接口获取手机号
    const result = await cloud.openapi.phonenumber.getPhoneNumber({
      code: code,
    });

    console.log("微信接口返回:", result);

    if (!result || !result.phoneInfo || !result.phoneInfo.phoneNumber) {
      throw new Error("获取手机号失败");
    }

    const phone = String(result.phoneInfo.phoneNumber || "").trim();
    console.log("获取到的手机号:", phone);

    // 确保用户记录存在（首次授权手机号时，users 可能还没创建该用户）
    await getOrCreateMe(openid);

    // 准备更新数据
    const updateData = {
      phone: phone,
      updatedAt: db.serverDate(),
    };

    // 如果有头像昵称，一起保存
    if (nickname) {
      updateData.nickname = nickname;
    }
    if (avatarUrl) {
      updateData.avatarUrl = avatarUrl;
    }

    console.log("准备更新数据:", updateData);

    // 更新用户信息
    const updateResult = await db
      .collection("users")
      .where({ _openid: openid })
      .update({
        data: updateData,
      });

    console.log("更新结果:", updateResult);

    // 重新获取用户信息（会自动判断角色）
    const user = await getOrCreateMe(openid);
    console.log("重新获取的用户信息:", user);

    // 确保返回的用户对象包含必要字段（解决数据库同步延迟问题）
    user._openid = openid;
    // 强制设置 phone，确保一定返回给前端
    user.phone = phone;
    // 同步昵称和头像（如果有传入）
    if (nickname) user.nickname = nickname;
    if (avatarUrl) user.avatarUrl = avatarUrl;

    console.log("最终返回的用户信息:", user);
    return user;
  } catch (err) {
    console.error("loginByPhone error:", err);
    throw err;
  }
}

// 账号密码注册
async function accountRegister(openid, username, password, nickname) {
  try {
    console.log("accountRegister 开始，参数:", { openid, username, nickname });

    // 检查账号是否已存在
    const existCheck = await db
      .collection("accounts")
      .where({ username })
      .limit(1)
      .get();

    if (existCheck.data && existCheck.data.length > 0) {
      return { success: false, errMsg: "账号已存在" };
    }

    // 创建账号（实际项目中应该对密码进行加密）
    await db.collection("accounts").add({
      data: {
        username,
        password, // 实际项目中应该使用 bcrypt 等加密
        nickname,
        openid,
        createdAt: db.serverDate(),
      },
    });

    console.log("账号注册成功");
    return { success: true };
  } catch (err) {
    console.error("accountRegister error:", err);
    return { success: false, errMsg: "注册失败：" + err.message };
  }
}

// 账号密码登录
async function accountLogin(openid, username, password) {
  try {
    console.log("accountLogin 开始，参数:", { openid, username });

    // 查询账号
    const accountCheck = await db
      .collection("accounts")
      .where({ username })
      .limit(1)
      .get();

    if (!accountCheck.data || accountCheck.data.length === 0) {
      return { success: false, errMsg: "账号不存在" };
    }

    const account = accountCheck.data[0];

    // 验证密码
    if (account.password !== password) {
      return { success: false, errMsg: "密码错误" };
    }

    // 确保用户记录存在
    await getOrCreateMe(openid);

    // 更新用户信息
    await db
      .collection("users")
      .where({ _openid: openid })
      .update({
        data: {
          nickname: account.nickname,
          accountUsername: username,
          updatedAt: db.serverDate(),
        },
      });

    // 更新账号的 openid（支持多设备登录）
    await db
      .collection("accounts")
      .doc(account._id)
      .update({
        data: {
          openid,
          lastLoginAt: db.serverDate(),
        },
      });

    // 重新获取用户信息
    const user = await getOrCreateMe(openid);
    console.log("账号登录成功，用户信息:", user);

    return { success: true, data: user };
  } catch (err) {
    console.error("accountLogin error:", err);
    return { success: false, errMsg: "登录失败：" + err.message };
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 首次初始化：自动创建必要集合，避免新环境直接报“集合不存在”
  await ensureCollections();

  const action = event.action;
  switch (action) {
    case "getOrCreateMe": {
      const me = await getOrCreateMe(openid);
      return { success: true, data: me };
    }
    case "updateMe": {
      const me = await updateMe(openid, event.data || {});
      return { success: true, data: me };
    }
    case "loginByPhone": {
      const me = await loginByPhone(openid, event.code, event.nickname, event.avatarUrl);
      return { success: true, data: me };
    }
    case "accountRegister": {
      return await accountRegister(openid, event.username, event.password, event.nickname);
    }
    case "accountLogin": {
      return await accountLogin(openid, event.username, event.password);
    }
    case "getMyInfo": {
      const info = await getMyInfo(openid);
      return { success: true, data: info };
    }
    case "addStaff": {
      return await addStaff(openid, event.phone || '', event.targetOpenid || '');
    }
    case "getStaffPublicInfo": {
      const info = await getStaffPublicInfo(event.userId, event.phone);
      return { success: true, data: info };
    }
    case "saveStaffProfile": {
      const info = await saveStaffProfile(openid, event.staffId, event.name, event.phone, event.avatar, event.company);
      return { success: true, data: info };
    }
    default:
      return { success: false, errMsg: "unknown action" };
  }
};
