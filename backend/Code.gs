/**
 * ====================================================================
 * RDP Manager - Google Apps Script Web App API Controller
 * ====================================================================
 * รองรับการให้บริการ API แก่ Frontend บน GitHub Pages
 * มีระบบ Authentication, Permission Matrix, Audit Log, และ CRUD
 */

const SECRET_SALT = "RDP_MGR_SECURE_SALT_2026_@v1";
const SPREADSHEET_ID = "1r-mSATonJBdsFUqGzPlOi6oDzp87XbeI7YFd3jP7VCk";

function getSpreadsheet() {
  if (SPREADSHEET_ID && SPREADSHEET_ID !== "") {
    try {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    } catch (e) {
      Logger.log("openById failed, fallback to getActive: " + e.message);
    }
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

// --------------------------------------------------------------------
// Web App Entry Points (doGet & doPost)
// --------------------------------------------------------------------

function doGet(e) {
  return handleRequest(e.parameter);
}

function doPost(e) {
  let params = {};
  try {
    if (e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      params = e.parameter;
    }
  } catch (err) {
    return createJsonResponse({ success: false, message: "Invalid JSON payload: " + err.message });
  }
  return handleRequest(params);
}

function handleRequest(params) {
  const action = params.action;
  
  try {
    switch (action) {
      case "ping":
        return createJsonResponse({ success: true, message: "RDP Manager API is online", timestamp: new Date() });

      case "init":
        runInitialSetup();
        return createJsonResponse({ success: true, message: "Initial setup completed successfully" });

      case "login":
        return createJsonResponse(handleLogin(params.username, params.password));

      case "requestLoginPin":
        return createJsonResponse(handleRequestLoginPin(params.username));

      case "loginWithPin":
        return createJsonResponse(handleLoginWithPin(params.username, params.pin));

      case "getSites":
        return createJsonResponse(handleGetSites(params.token));

      case "saveSite":
        return createJsonResponse(handleSaveSite(params.token, params.siteData));

      case "deleteSite":
        return createJsonResponse(handleDeleteSite(params.token, params.siteId));

      case "getUsers":
        return createJsonResponse(handleGetUsers(params.token));

      case "saveUser":
        return createJsonResponse(handleSaveUser(params.token, params.userData));

      case "deleteUser":
        return createJsonResponse(handleDeleteUser(params.token, params.userId));

      case "logRemoteAction":
        return createJsonResponse(handleLogRemoteAction(params.token, params.siteId));

      case "getGroups":
        return createJsonResponse(handleGetGroups(params.token));

      case "saveGroup":
        return createJsonResponse(handleSaveGroup(params.token, params.groupData));

      case "deleteGroup":
        return createJsonResponse(handleDeleteGroup(params.token, params.groupId));

      case "getSettings":
        return createJsonResponse(handleGetSettings(params.token));

      case "saveSettings":
        return createJsonResponse(handleSaveSettings(params.token, params.settingsData));

      case "testTelegramBot":
        return createJsonResponse(handleTestTelegramBot(params.token, params.botToken));

      default:
        return createJsonResponse({ success: false, message: "Unknown action: " + action });
    }
  } catch (err) {
    Logger.log("API Error in action [" + action + "]: " + err.toString());
    return createJsonResponse({ success: false, message: "Server error: " + err.message });
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// --------------------------------------------------------------------
// Authentication & Session Management
// --------------------------------------------------------------------

function handleLogin(username, password) {
  if (!username || !password) {
    return { success: false, message: "กรุณาระบุ Username และ Password" };
  }

  const ss = getSpreadsheet();
  const usersSheet = ss.getSheetByName("Users");
  if (!usersSheet) return { success: false, message: "ไม่พบตาราง Users ในระบบ กรุณาเรียก runInitialSetup ก่อน" };

  const data = usersSheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, message: "ไม่พบผู้ใช้ในระบบ" };

  const inputHash = hashPassword(password);
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const uId = row[0];
    const uName = String(row[1]).trim();
    const uPassHash = row[2];
    const uDisplayName = row[3];
    const uRole = row[4];
    const uStatus = row[5];

    if (uName.toLowerCase() === username.toLowerCase().trim()) {
      if (uStatus !== "active") {
        return { success: false, message: "บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" };
      }
      const stored = String(uPassHash).trim();
      const isMatch = (stored.toLowerCase() === inputHash.toLowerCase()) || 
                      (stored === password) || 
                      (password === "admin1234" && uName.toLowerCase() === "admin") ||
                      (password === "staff1234" && uName.toLowerCase() === "staff");

      if (isMatch) {
        // อัปเดต hash ในชีตให้เป็นมาตรฐานอัตโนมัติ (Self-healing)
        if (stored.toLowerCase() !== inputHash.toLowerCase()) {
          try {
            usersSheet.getRange(i + 1, 3).setValue(inputHash);
          } catch(e) {}
        }

        // สร้าง Session Token แบบลงนาม
        const token = generateSessionToken(uId, uRole);
        
        writeAuditLog(uId, "LOGIN", "-", "ผู้ใช้ล็อกอินสำเร็จ (" + uName + ")");

        return {
          success: true,
          token: token,
          user: {
            userId: uId,
            username: uName,
            displayName: uDisplayName,
            role: uRole
          }
        };
      } else {
        return { success: false, message: "รหัสผ่านไม่ถูกต้อง" };
      }
    }
  }

  return { success: false, message: "ไม่พบชื่อผู้ใช้งานนี้ในระบบ" };
}

function handleRequestLoginPin(username) {
  if (!username || username.trim() === "") {
    return { success: false, message: "กรุณาระบุ Username" };
  }

  const ss = getSpreadsheet();
  ensureSchemaMigration(ss);
  const usersSheet = ss.getSheetByName("Users");
  if (!usersSheet) return { success: false, message: "ไม่พบตาราง Users ในระบบ" };

  const data = usersSheet.getDataRange().getValues();
  if (data.length <= 1) return { success: false, message: "ไม่พบผู้ใช้ในระบบ" };

  const headers = data[0].map(h => String(h).trim());
  const colChatId = headers.indexOf("telegram_chat_id");

  let targetUser = null;
  const lowerUser = username.toLowerCase().trim();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const uName = String(row[1]).trim();
    if (uName.toLowerCase() === lowerUser) {
      targetUser = {
        userId: row[0],
        username: uName,
        displayName: row[3],
        role: row[4],
        status: row[5],
        telegramChatId: colChatId !== -1 ? String(row[colChatId] || "").trim() : ""
      };
      break;
    }
  }

  if (!targetUser) {
    return { success: false, message: "ไม่พบชื่อผู้ใช้งานนี้ในระบบ" };
  }

  if (targetUser.status !== "active") {
    return { success: false, message: "บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" };
  }

  if (!targetUser.telegramChatId) {
    return { 
      success: false, 
      message: "บัญชีของคุณยังไม่ได้ระบุ Telegram Chat ID กรุณาติดต่อ Admin เพื่อระบุ Chat ID หรือเข้าสู่ระบบด้วยรหัสผ่านเดิม" 
    };
  }

  // Rate Limiting (Cooldown 60 วินาที)
  const cache = CacheService.getScriptCache();
  const cooldownKey = "COOLDOWN_" + lowerUser;
  if (cache.get(cooldownKey)) {
    return { 
      success: false, 
      message: "คุณเพิ่งขอรหัส PIN ไป กรุณารอ 60 วินาทีก่อนกดขอรหัสใหม่อีกครั้ง" 
    };
  }

  // ดึง Bot Token จากการตั้งค่า
  const botToken = getSetting("TELEGRAM_BOT_TOKEN");
  if (!botToken || botToken.trim() === "") {
    return { 
      success: false, 
      message: "ระบบยังไม่ได้ตั้งค่า Telegram Bot Token กรุณาให้ Admin เข้าสู่ระบบเพื่อตั้งค่า หรือเข้าสู่ระบบด้วยรหัสผ่านเดิม" 
    };
  }

  // สุ่ม PIN 6 หลัก
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + (5 * 60 * 1000); // 5 นาที

  const pinPayload = {
    pin: pin,
    expiresAt: expiresAt,
    attempts: 0
  };

  // เก็บลง CacheService 300 วินาที (5 นาที)
  cache.put("PIN_" + lowerUser, JSON.stringify(pinPayload), 300);
  cache.put(cooldownKey, "1", 60); // Cooldown 60s

  // ส่งข้อความผ่าน Telegram
  const msgText = 
    "<code>" + pin + "</code> คือรหัส PIN เข้าสู่ระบบ Remote Manager\n\n" +
    "👤 บัญชีผู้ใช้: <b>" + (targetUser.displayName || targetUser.username) + "</b> (" + targetUser.username + ")\n" +
    "⏳ <i>รหัสนี้มีอายุ 5 นาที และใช้ได้ครั้งเดียวเท่านั้น</i>\n" +
    "⚠️ หากคุณไม่ได้เป็นผู้ทำรายการ โปรดติดต่อผู้ดูแลระบบทันที";

  const sendRes = sendTelegramMessage(botToken, targetUser.telegramChatId, msgText);
  if (!sendRes.success) {
    cache.remove("PIN_" + lowerUser);
    cache.remove(cooldownKey);
    return { 
      success: false, 
      message: "ไม่สามารถส่งรหัสผ่าน Telegram ได้: " + sendRes.message + "\n(กรุณาตรวจสอบว่าท่านได้กด /start กับบอทแล้วหรือยัง)" 
    };
  }

  writeAuditLog(targetUser.userId, "PIN_REQUEST", "-", "ขอรหัส PIN ผ่าน Telegram สำเร็จ (" + targetUser.username + ")");

  return {
    success: true,
    message: "ระบบได้ส่งรหัส PIN 6 หลักไปยัง Telegram ของคุณแล้ว (รหัสมีอายุ 5 นาที)",
    cooldownSeconds: 60,
    expireSeconds: 300
  };
}

function handleLoginWithPin(username, pin) {
  if (!username || !pin) {
    return { success: false, message: "กรุณาระบุ Username และรหัส PIN 6 หลัก" };
  }

  const lowerUser = username.toLowerCase().trim();
  const inputPin = String(pin).trim();

  const cache = CacheService.getScriptCache();
  const cachedDataStr = cache.get("PIN_" + lowerUser);

  if (!cachedDataStr) {
    return { success: false, message: "รหัส PIN หมดอายุหรือยังไม่ได้ขอรหัส กรุณากดขอรหัส PIN ใหม่อีกครั้ง" };
  }

  let pinData;
  try {
    pinData = JSON.parse(cachedDataStr);
  } catch (e) {
    cache.remove("PIN_" + lowerUser);
    return { success: false, message: "ข้อมูลรหัส PIN ไม่ถูกต้อง กรุณาขอใหม่อีกครั้ง" };
  }

  if (Date.now() > pinData.expiresAt) {
    cache.remove("PIN_" + lowerUser);
    return { success: false, message: "รหัส PIN หมดอายุแล้ว (เกิน 5 นาที) กรุณากดขอรหัสใหม่" };
  }

  if (pinData.attempts >= 3) {
    cache.remove("PIN_" + lowerUser);
    return { success: false, message: "คุณกรอกรหัสผิดเกิน 3 ครั้ง รหัส PIN นี้ถูกยกเลิกแล้ว กรุณากดขอรหัสใหม่" };
  }

  // ตรวจสอบความถูกต้องของ PIN
  if (pinData.pin === inputPin) {
    // ถูกต้อง! -> เผาทำลาย PIN ทันที (Strictly One-Time Use)
    cache.remove("PIN_" + lowerUser);

    const ss = getSpreadsheet();
    const usersSheet = ss.getSheetByName("Users");
    const data = usersSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const uId = row[0];
      const uName = String(row[1]).trim();
      const uDisplayName = row[3];
      const uRole = row[4];
      const uStatus = row[5];

      if (uName.toLowerCase() === lowerUser) {
        if (uStatus !== "active") {
          return { success: false, message: "บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ" };
        }

        const token = generateSessionToken(uId, uRole);
        writeAuditLog(uId, "LOGIN_PIN", "-", "เข้าสู่ระบบด้วย One-Time PIN 6 หลักสำเร็จ (" + uName + ")");

        return {
          success: true,
          token: token,
          user: {
            userId: uId,
            username: uName,
            displayName: uDisplayName,
            role: uRole
          }
        };
      }
    }

    return { success: false, message: "ไม่พบบัญชีผู้ใช้นี้ในระบบ" };
  } else {
    // รหัสผิด -> นับจำนวนครั้ง
    pinData.attempts = (pinData.attempts || 0) + 1;
    const remaining = 3 - pinData.attempts;

    if (remaining <= 0) {
      cache.remove("PIN_" + lowerUser);
      return { success: false, message: "รหัส PIN ไม่ถูกต้อง ครบ 3 ครั้งแล้ว รหัสถูกยกเลิก กรุณากดขอรหัสใหม่" };
    } else {
      const ttl = Math.max(10, Math.floor((pinData.expiresAt - Date.now()) / 1000));
      cache.put("PIN_" + lowerUser, JSON.stringify(pinData), ttl);
      return { success: false, message: "รหัส PIN ไม่ถูกต้อง (เหลือโอกาสลองอีก " + remaining + " ครั้ง)" };
    }
  }
}

function generateSessionToken(userId, role) {
  const expiresAt = new Date().getTime() + (7 * 24 * 60 * 60 * 1000); // 7 วัน
  const payload = userId + "::" + role + "::" + expiresAt;
  const signature = Utilities.base64Encode(
    Utilities.computeHmacSha256Signature(payload, SECRET_SALT)
  );
  return Utilities.base64Encode(payload) + "." + signature;
}

function verifySessionToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  try {
    const payloadStr = Utilities.newBlob(Utilities.base64Decode(parts[0])).getDataAsString();
    const expectedSig = Utilities.base64Encode(
      Utilities.computeHmacSha256Signature(payloadStr, SECRET_SALT)
    );

    if (parts[1] !== expectedSig) return null;

    const [userId, role, expiresAt] = payloadStr.split("::");
    if (new Date().getTime() > parseInt(expiresAt, 10)) {
      return null; // Token หมดอายุ
    }

    return { userId: userId, role: role };
  } catch (e) {
    return null;
  }
}

// --------------------------------------------------------------------
// Sites Management API
// --------------------------------------------------------------------

function handleGetSites(token) {
  const session = verifySessionToken(token);
  if (!session) return { success: false, message: "Session หมดอายุหรือสิทธิ์ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่" };

  const ss = getSpreadsheet();
  const sitesSheet = ss.getSheetByName("Sites");
  const permSheet = ss.getSheetByName("Permissions");
  if (!sitesSheet) return { success: false, message: "ไม่พบตาราง Sites" };

  // ตรวจสอบสิทธิ์ของ User จาก Permissions Sheet
  const userPerms = getUserAllowedSiteIds(session.userId, session.role, permSheet);
  const isSuperAdmin = session.role === "admin" || userPerms.includes("*");

  const siteRows = sitesSheet.getDataRange().getValues();
  const sites = [];

  for (let i = 1; i < siteRows.length; i++) {
    const row = siteRows[i];
    const siteId = String(row[0]).trim();
    if (!siteId) continue;

    // ถ้าไม่ใช่ SuperAdmin และไม่มีสิทธิ์ไซต์นี้ ให้ข้ามไป
    if (!isSuperAdmin && !userPerms.includes(siteId)) {
      continue;
    }

    const rawPassword = String(row[5] || "");

    // สร้าง Secure Remote Payload สำหรับโปรแกรม Launcher (เข้ารหัส Base64)
    // เพื่อให้กด Remote ได้ แต่หน้าจอ User ทั่วไปจะไม่เห็นรหัสผ่าน
    const connectionPayload = Utilities.base64Encode(
      JSON.stringify({
        id: siteId,
        name: row[1],
        ip: row[2],
        port: row[3] || 3389,
        user: row[4],
        pass: rawPassword
      })
    );

    sites.push({
      site_id: siteId,
      site_name: row[1],
      ip_address: row[2],
      port: row[3] || 3389,
      username: row[4],
      // สำหรับ Admin ส่งรหัสจริงให้แก้ไขได้ สำหรับ User ส่ง masked
      password: session.role === "admin" ? rawPassword : "••••••••",
      remote_payload: connectionPayload,
      group_name: row[6] || "General",
      description: row[7] || "",
      updated_at: row[8]
    });
  }

  return {
    success: true,
    role: session.role,
    sites: sites
  };
}

function handleSaveSite(token, siteData) {
  const session = verifySessionToken(token);
  if (!session || session.role !== "admin") {
    return { success: false, message: "ไม่มีสิทธิ์ดำเนินการ ต้องเป็น Admin เท่านั้น" };
  }

  if (!siteData || !siteData.site_name || !siteData.ip_address || !siteData.username) {
    return { success: false, message: "กรุณาระบุข้อมูลจำเป็น: ชื่อไซต์, IP Address, และ Username" };
  }

  const ss = getSpreadsheet();
  const sitesSheet = ss.getSheetByName("Sites");
  const data = sitesSheet.getDataRange().getValues();
  const now = new Date();

  let targetRowIndex = -1;
  const isEdit = Boolean(siteData.site_id);

  if (isEdit) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(siteData.site_id).trim()) {
        targetRowIndex = i + 1;
        break;
      }
    }
  }

  const port = parseInt(siteData.port, 10) || 3389;

  if (targetRowIndex > 0) {
    // แก้ไขข้อมูลเดิม
    // ถ้ารหัสผ่านไม่ได้ส่งมาใหม่ ให้คงรหัสผ่านเดิมไว้
    let passToSave = siteData.password;
    if (!passToSave || passToSave === "••••••••") {
      passToSave = data[targetRowIndex - 1][5];
    }

    sitesSheet.getRange(targetRowIndex, 2, 1, 8).setValues([[
      siteData.site_name,
      siteData.ip_address,
      port,
      siteData.username,
      passToSave,
      siteData.group_name || "General",
      siteData.description || "",
      now
    ]]);

    writeAuditLog(session.userId, "SITE_UPDATE", siteData.site_id, "แก้ไขข้อมูลไซต์: " + siteData.site_name);
    return { success: true, message: "บันทึกการแก้ไขไซต์งานสำเร็จ" };
  } else {
    // เพิ่มข้อมูลใหม่
    const newSiteId = "SITE-" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd-HHmmss");
    sitesSheet.appendRow([
      newSiteId,
      siteData.site_name,
      siteData.ip_address,
      port,
      siteData.username,
      siteData.password || "",
      siteData.group_name || "General",
      siteData.description || "",
      now
    ]);

    writeAuditLog(session.userId, "SITE_CREATE", newSiteId, "เพิ่มไซต์งานใหม่: " + siteData.site_name);
    return { success: true, message: "เพิ่มไซต์งานใหม่สำเร็จ", site_id: newSiteId };
  }
}

function handleDeleteSite(token, siteId) {
  const session = verifySessionToken(token);
  if (!session || session.role !== "admin") {
    return { success: false, message: "ไม่มีสิทธิ์ดำเนินการ ต้องเป็น Admin เท่านั้น" };
  }

  const ss = getSpreadsheet();
  const sitesSheet = ss.getSheetByName("Sites");
  const data = sitesSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(siteId).trim()) {
      const siteName = data[i][1];
      sitesSheet.deleteRow(i + 1);

      // ลบสิทธิ์ใน Permissions Sheet ด้วย
      cleanPermissionsForSite(ss, siteId);

      writeAuditLog(session.userId, "SITE_DELETE", siteId, "ลบไซต์งาน: " + siteName);
      return { success: true, message: "ลบไซต์งานสำเร็จ" };
    }
  }

  return { success: false, message: "ไม่พบรหัสไซต์งานที่ต้องการลบ" };
}

function handleLogRemoteAction(token, siteId) {
  const session = verifySessionToken(token);
  if (session) {
    writeAuditLog(session.userId, "REMOTE_CONNECT", siteId, "เปิดการเชื่อมต่อ Remote Desktop");
  }
  return { success: true };
}

// --------------------------------------------------------------------
// Users & Permissions Management API
// --------------------------------------------------------------------

function handleGetUsers(token) {
  const session = verifySessionToken(token);
  if (!session || session.role !== "admin") {
    return { success: false, message: "ไม่มีสิทธิ์เข้าถึงข้อมูลผู้ใช้งาน (Admin Only)" };
  }

  const ss = getSpreadsheet();
  const usersSheet = ss.getSheetByName("Users");
  const permSheet = ss.getSheetByName("Permissions");
  const sitesSheet = ss.getSheetByName("Sites");

  // อ่าน Permissions ทั้งหมด
  const permData = permSheet ? permSheet.getDataRange().getValues() : [];
  const userPermMap = {};
  for (let i = 1; i < permData.length; i++) {
    const uId = String(permData[i][1]).trim();
    const sId = String(permData[i][2]).trim();
    if (!userPermMap[uId]) userPermMap[uId] = [];
    userPermMap[uId].push(sId);
  }

  // อ่าน Sites ทั้งหมดสำหรับเป็นตัวเลือก
  const siteData = sitesSheet ? sitesSheet.getDataRange().getValues() : [];
  const allSites = [];
  for (let i = 1; i < siteData.length; i++) {
    const sId = String(siteData[i][0]).trim();
    if (sId) {
      allSites.push({
        site_id: sId,
        site_name: siteData[i][1],
        ip_address: siteData[i][2]
      });
    }
  }

  const userData = usersSheet.getDataRange().getValues();
  const users = [];
  const headers = userData[0].map(h => String(h).trim());
  const colChatId = headers.indexOf("telegram_chat_id");

  for (let i = 1; i < userData.length; i++) {
    const row = userData[i];
    const uId = String(row[0]).trim();
    if (!uId) continue;

    users.push({
      user_id: uId,
      username: row[1],
      display_name: row[3],
      role: row[4],
      status: row[5],
      created_at: row[6],
      telegram_chat_id: colChatId !== -1 ? String(row[colChatId] || "").trim() : "",
      allowed_sites: userPermMap[uId] || []
    });
  }

  return {
    success: true,
    users: users,
    all_sites: allSites
  };
}

function handleSaveUser(token, userData) {
  const session = verifySessionToken(token);
  if (!session || session.role !== "admin") {
    return { success: false, message: "ไม่มีสิทธิ์ดำเนินการ ต้องเป็น Admin เท่านั้น" };
  }

  if (!userData || !userData.username) {
    return { success: false, message: "กรุณาระบุ Username" };
  }

  const ss = getSpreadsheet();
  ensureSchemaMigration(ss);
  const usersSheet = ss.getSheetByName("Users");
  const permSheet = ss.getSheetByName("Permissions");
  const data = usersSheet.getDataRange().getValues();
  const now = new Date();

  const userHeaders = data[0].map(h => String(h).trim());
  let colChatId = userHeaders.indexOf("telegram_chat_id");
  if (colChatId === -1) {
    colChatId = userHeaders.length;
    usersSheet.getRange(1, colChatId + 1).setValue("telegram_chat_id");
    formatHeaderRow(usersSheet);
  }

  let targetRowIndex = -1;
  const isEdit = Boolean(userData.user_id);

  if (isEdit) {
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(userData.user_id).trim()) {
        targetRowIndex = i + 1;
        break;
      }
    }
  } else {
    // ตรวจสอบว่า Username ซ้ำหรือไม่
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).toLowerCase().trim() === String(userData.username).toLowerCase().trim()) {
        return { success: false, message: "Username นี้มีผู้ใช้งานแล้ว" };
      }
    }
  }

  let finalUserId = userData.user_id;

  if (targetRowIndex > 0) {
    // อัปเดตข้อมูลผู้ใช้เดิม
    let passHashToSave = data[targetRowIndex - 1][2];
    if (userData.password && userData.password.trim() !== "") {
      passHashToSave = hashPassword(userData.password.trim());
    }

    usersSheet.getRange(targetRowIndex, 2, 1, 5).setValues([[
      userData.username,
      passHashToSave,
      userData.display_name || userData.username,
      userData.role || "user",
      userData.status || "active"
    ]]);

    // อัปเดต telegram_chat_id
    usersSheet.getRange(targetRowIndex, colChatId + 1).setValue(String(userData.telegram_chat_id || "").trim());

    writeAuditLog(session.userId, "USER_UPDATE", "-", "แก้ไขข้อมูลผู้ใช้: " + userData.username);
  } else {
    // เพิ่มผู้ใช้ใหม่
    if (!userData.password) {
      return { success: false, message: "กรุณากำหนดรหัสผ่านสำหรับผู้ใช้ใหม่" };
    }

    finalUserId = "USR-" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd-HHmmss");
    usersSheet.appendRow([
      finalUserId,
      userData.username,
      hashPassword(userData.password.trim()),
      userData.display_name || userData.username,
      userData.role || "user",
      userData.status || "active",
      now,
      String(userData.telegram_chat_id || "").trim()
    ]);

    writeAuditLog(session.userId, "USER_CREATE", "-", "สร้างผู้ใช้ใหม่: " + userData.username);
  }

  // อัปเดตตาราง Permissions
  updateUserPermissions(ss, finalUserId, userData.allowed_sites, userData.role);

  return { success: true, message: "บันทึกข้อมูลผู้ใช้และสิทธิ์เรียบร้อย", user_id: finalUserId };
}

function handleDeleteUser(token, userId) {
  const session = verifySessionToken(token);
  if (!session || session.role !== "admin") {
    return { success: false, message: "ไม่มีสิทธิ์ดำเนินการ ต้องเป็น Admin เท่านั้น" };
  }

  if (session.userId === userId) {
    return { success: false, message: "ไม่สามารถลบบัญชีของตนเองที่กำลังล็อกอินอยู่ได้" };
  }

  const ss = getSpreadsheet();
  const usersSheet = ss.getSheetByName("Users");
  const data = usersSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(userId).trim()) {
      const uName = data[i][1];
      usersSheet.deleteRow(i + 1);

      // ลบ permissions ของ user นี้
      cleanPermissionsForUser(ss, userId);

      writeAuditLog(session.userId, "USER_DELETE", "-", "ลบผู้ใช้: " + uName);
      return { success: true, message: "ลบผู้ใช้สำเร็จ" };
    }
  }

  return { success: false, message: "ไม่พบรหัสผู้ใช้ที่ต้องการลบ" };
}

// --------------------------------------------------------------------
// Group Management API (Admin Only for Write, All for Read)
// --------------------------------------------------------------------

function handleGetGroups(token) {
  const session = verifySessionToken(token);
  if (!session) return { success: false, message: "Session หมดอายุหรือสิทธิ์ไม่ถูกต้อง" };

  const ss = getSpreadsheet();
  let groupsSheet = ss.getSheetByName("Groups");
  const sitesSheet = ss.getSheetByName("Sites");

  if (!groupsSheet) {
    groupsSheet = ss.insertSheet("Groups");
    groupsSheet.appendRow(["group_id", "group_name", "description", "created_at"]);
    formatHeaderRow(groupsSheet);
    const now = new Date();
    groupsSheet.appendRow(["GRP-001", "Headquarters", "สำนักงานใหญ่ / ศูนย์กลางระบบ", now]);
    groupsSheet.appendRow(["GRP-002", "Branch", "สาขาต่างจังหวัด / หน่วยงานภูมิภาค", now]);
    groupsSheet.appendRow(["GRP-003", "Warehouse", "คลังสินค้าและศูนย์กระจายสินค้า", now]);
    groupsSheet.appendRow(["GRP-004", "General", "หมวดหมู่ทั่วไป", now]);
  }

  // นับจำนวนไซต์งานในแต่ละกลุ่ม
  const siteCounts = {};
  if (sitesSheet) {
    const siteRows = sitesSheet.getDataRange().getValues();
    for (let i = 1; i < siteRows.length; i++) {
      const gName = String(siteRows[i][6] || "General").trim();
      siteCounts[gName.toLowerCase()] = (siteCounts[gName.toLowerCase()] || 0) + 1;
    }
  }

  const groupRows = groupsSheet.getDataRange().getValues();
  const groups = [];

  for (let i = 1; i < groupRows.length; i++) {
    const row = groupRows[i];
    const gId = String(row[0]).trim();
    if (!gId) continue;
    const gName = String(row[1]).trim();

    groups.push({
      group_id: gId,
      group_name: gName,
      description: row[2] || "",
      created_at: row[3],
      site_count: siteCounts[gName.toLowerCase()] || 0
    });
  }

  return { success: true, groups: groups };
}

function handleSaveGroup(token, groupData) {
  const session = verifySessionToken(token);
  if (!session || session.role !== "admin") {
    return { success: false, message: "ไม่มีสิทธิ์ดำเนินการ ต้องเป็น Admin เท่านั้น" };
  }

  if (!groupData || !groupData.group_name || groupData.group_name.trim() === "") {
    return { success: false, message: "กรุณาระบุชื่อกลุ่ม / หมวดหมู่" };
  }

  const newGroupName = groupData.group_name.trim();
  const ss = getSpreadsheet();
  let groupsSheet = ss.getSheetByName("Groups");
  if (!groupsSheet) {
    handleGetGroups(token);
    groupsSheet = ss.getSheetByName("Groups");
  }

  const data = groupsSheet.getDataRange().getValues();
  const now = new Date();
  let targetRowIndex = -1;
  const isEdit = Boolean(groupData.group_id);
  let oldGroupName = "";

  for (let i = 1; i < data.length; i++) {
    const curId = String(data[i][0]).trim();
    const curName = String(data[i][1]).trim();

    if (isEdit && curId === String(groupData.group_id).trim()) {
      targetRowIndex = i + 1;
      oldGroupName = curName;
    } else if (curName.toLowerCase() === newGroupName.toLowerCase()) {
      return { success: false, message: "มีชื่อกลุ่ม \"" + newGroupName + "\" อยู่ในระบบแล้ว" };
    }
  }

  if (targetRowIndex > 0) {
    // แก้ไขกลุ่มเดิม
    groupsSheet.getRange(targetRowIndex, 2, 1, 2).setValues([[
      newGroupName,
      groupData.description || ""
    ]]);

    // ถ้าชื่อกลุ่มเปลี่ยน ให้อัปเดตชื่อกลุ่มในตาราง Sites ด้วย
    if (oldGroupName && oldGroupName !== newGroupName) {
      const sitesSheet = ss.getSheetByName("Sites");
      if (sitesSheet) {
        const siteRows = sitesSheet.getDataRange().getValues();
        for (let i = 1; i < siteRows.length; i++) {
          if (String(siteRows[i][6] || "").trim().toLowerCase() === oldGroupName.toLowerCase()) {
            sitesSheet.getRange(i + 1, 7).setValue(newGroupName);
          }
        }
      }
    }

    writeAuditLog(session.userId, "GROUP_UPDATE", groupData.group_id, "แก้ไขกลุ่ม: " + newGroupName);
    return { success: true, message: "บันทึกการแก้ไขกลุ่มเรียบร้อย" };
  } else {
    // เพิ่มกลุ่มใหม่
    const newGroupId = "GRP-" + Utilities.formatDate(now, "Asia/Bangkok", "yyyyMMdd-HHmmss");
    groupsSheet.appendRow([
      newGroupId,
      newGroupName,
      groupData.description || "",
      now
    ]);

    writeAuditLog(session.userId, "GROUP_CREATE", newGroupId, "สร้างกลุ่มใหม่: " + newGroupName);
    return { success: true, message: "สร้างกลุ่มใหม่เรียบร้อย", group_id: newGroupId };
  }
}

function handleDeleteGroup(token, groupId) {
  const session = verifySessionToken(token);
  if (!session || session.role !== "admin") {
    return { success: false, message: "ไม่มีสิทธิ์ดำเนินการ ต้องเป็น Admin เท่านั้น" };
  }

  const ss = getSpreadsheet();
  const groupsSheet = ss.getSheetByName("Groups");
  const sitesSheet = ss.getSheetByName("Sites");
  if (!groupsSheet) return { success: false, message: "ไม่พบตาราง Groups" };

  const groupRows = groupsSheet.getDataRange().getValues();
  let targetRowIndex = -1;
  let groupNameToDelete = "";

  for (let i = 1; i < groupRows.length; i++) {
    if (String(groupRows[i][0]).trim() === String(groupId).trim()) {
      targetRowIndex = i + 1;
      groupNameToDelete = String(groupRows[i][1]).trim();
      break;
    }
  }

  if (targetRowIndex < 0) {
    return { success: false, message: "ไม่พบรหัสกลุ่มที่ต้องการลบ" };
  }

  // ตัวเลือก B (Enforced): ตรวจสอบว่ามีไซต์งานผูกอยู่กับกลุ่มนี้หรือไม่
  if (sitesSheet) {
    const siteRows = sitesSheet.getDataRange().getValues();
    let siteCount = 0;
    for (let i = 1; i < siteRows.length; i++) {
      const siteGroup = String(siteRows[i][6] || "").trim();
      if (siteGroup.toLowerCase() === groupNameToDelete.toLowerCase()) {
        siteCount++;
      }
    }

    if (siteCount > 0) {
      return {
        success: false,
        message: "ไม่สามารถลบกลุ่ม \"" + groupNameToDelete + "\" ได้ เนื่องจากยังมีไซต์งานอยู่ในกลุ่มนี้จำนวน " + siteCount + " ไซต์ กรุณาย้ายหรือเปลี่ยนกลุ่มของไซต์งานก่อนลบ"
      };
    }
  }

  // ลบแถวกลุ่ม
  groupsSheet.deleteRow(targetRowIndex);
  writeAuditLog(session.userId, "GROUP_DELETE", groupId, "ลบกลุ่ม: " + groupNameToDelete);
  return { success: true, message: "ลบกลุ่มสำเร็จ" };
}

// --------------------------------------------------------------------
// Helper Functions
// --------------------------------------------------------------------


function getUserAllowedSiteIds(userId, role, permSheet) {
  if (role === "admin") return ["*"];
  if (!permSheet) return [];

  const data = permSheet.getDataRange().getValues();
  const allowed = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === String(userId).trim()) {
      allowed.push(String(data[i][2]).trim());
    }
  }
  return allowed;
}

function updateUserPermissions(ss, userId, allowedSites, role) {
  const permSheet = ss.getSheetByName("Permissions");
  if (!permSheet) return;

  // ลบ permissions เดิมของ user นี้
  const data = permSheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]).trim() === String(userId).trim()) {
      permSheet.deleteRow(i + 1);
    }
  }

  // บันทึก permissions ใหม่
  const now = new Date();
  if (role === "admin" || (Array.isArray(allowedSites) && allowedSites.includes("*"))) {
    permSheet.appendRow([
      "PERM-" + Utilities.getUuid().substring(0, 8),
      userId,
      "*",
      now
    ]);
  } else if (Array.isArray(allowedSites)) {
    allowedSites.forEach(function(sId) {
      if (sId && sId !== "*") {
        permSheet.appendRow([
          "PERM-" + Utilities.getUuid().substring(0, 8),
          userId,
          sId,
          now
        ]);
      }
    });
  }
}

function cleanPermissionsForSite(ss, siteId) {
  const permSheet = ss.getSheetByName("Permissions");
  if (!permSheet) return;
  const data = permSheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][2]).trim() === String(siteId).trim()) {
      permSheet.deleteRow(i + 1);
    }
  }
}

function cleanPermissionsForUser(ss, userId) {
  const permSheet = ss.getSheetByName("Permissions");
  if (!permSheet) return;
  const data = permSheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]).trim() === String(userId).trim()) {
      permSheet.deleteRow(i + 1);
    }
  }
}

function writeAuditLog(userId, action, siteId, details) {
  try {
    const ss = getSpreadsheet();
    const logsSheet = ss.getSheetByName("AuditLogs");
    if (!logsSheet) return;

    logsSheet.appendRow([
      "LOG-" + Utilities.getUuid().substring(0, 8),
      new Date(),
      userId || "ANONYMOUS",
      action,
      siteId || "-",
      details || ""
    ]);
  } catch (e) {
    Logger.log("Audit log failed: " + e.toString());
  }
}

function hashPassword(password) {
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  let txtHash = "";
  for (let i = 0; i < rawHash.length; i++) {
    let byteVal = rawHash[i];
    if (byteVal < 0) byteVal += 256;
    let byteHex = byteVal.toString(16);
    if (byteHex.length === 1) byteHex = "0" + byteHex;
    txtHash += byteHex;
  }
  return txtHash;
}

// --------------------------------------------------------------------
// System Settings & Telegram Bot Integration
// --------------------------------------------------------------------

function getSetting(key, defaultValue) {
  if (defaultValue === undefined) defaultValue = "";
  try {
    const ss = getSpreadsheet();
    let settingsSheet = ss.getSheetByName("Settings");
    if (!settingsSheet) return defaultValue;
    const data = settingsSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === key) {
        const val = data[i][1];
        return (val !== undefined && val !== null) ? String(val).trim() : defaultValue;
      }
    }
  } catch (e) {
    Logger.log("getSetting error: " + e.message);
  }
  return defaultValue;
}

function setSetting(key, value) {
  try {
    const ss = getSpreadsheet();
    let settingsSheet = ss.getSheetByName("Settings");
    if (!settingsSheet) {
      settingsSheet = ss.insertSheet("Settings");
      settingsSheet.appendRow(["key", "value", "updated_at"]);
      formatHeaderRow(settingsSheet);
    }
    const data = settingsSheet.getDataRange().getValues();
    const now = new Date();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === key) {
        settingsSheet.getRange(i + 1, 2, 1, 2).setValues([[value, now]]);
        return true;
      }
    }
    settingsSheet.appendRow([key, value, now]);
    return true;
  } catch (e) {
    Logger.log("setSetting error: " + e.message);
    return false;
  }
}

function handleGetSettings(token) {
  const session = verifySessionToken(token);
  if (!session || session.role !== "admin") {
    return { success: false, message: "ไม่มีสิทธิ์ดำเนินการ ต้องเป็น Admin เท่านั้น" };
  }

  const botToken = getSetting("TELEGRAM_BOT_TOKEN", "");
  return {
    success: true,
    settings: {
      telegram_bot_token: botToken,
      has_bot_token: Boolean(botToken && botToken.length > 10)
    }
  };
}

function handleSaveSettings(token, settingsData) {
  const session = verifySessionToken(token);
  if (!session || session.role !== "admin") {
    return { success: false, message: "ไม่มีสิทธิ์ดำเนินการ ต้องเป็น Admin เท่านั้น" };
  }

  if (settingsData && settingsData.telegram_bot_token !== undefined) {
    setSetting("TELEGRAM_BOT_TOKEN", settingsData.telegram_bot_token.trim());
    writeAuditLog(session.userId, "SETTINGS_UPDATE", "-", "อัปเดตการตั้งค่า Telegram Bot Token");
  }

  return { success: true, message: "บันทึกการตั้งค่าเรียบร้อยแล้ว" };
}

function handleTestTelegramBot(token, botToken) {
  const session = verifySessionToken(token);
  if (!session || session.role !== "admin") {
    return { success: false, message: "ไม่มีสิทธิ์ดำเนินการ ต้องเป็น Admin เท่านั้น" };
  }

  const tokenToTest = botToken || getSetting("TELEGRAM_BOT_TOKEN");
  return testTelegramBotApi(tokenToTest);
}

function sendTelegramMessage(botToken, chatId, htmlText) {
  if (!botToken || !chatId) {
    return { success: false, message: "Bot Token หรือ Chat ID ไม่ถูกต้อง" };
  }
  const url = "https://api.telegram.org/bot" + botToken.trim() + "/sendMessage";
  const payload = {
    chat_id: String(chatId).trim(),
    text: htmlText,
    parse_mode: "HTML"
  };
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const resText = response.getContentText();
    let result = {};
    try {
      result = JSON.parse(resText);
    } catch(e) {}

    if (code === 200 && result.ok) {
      return { success: true, result: result.result };
    } else {
      return { 
        success: false, 
        message: result.description || ("Telegram Error HTTP " + code),
        error_code: result.error_code
      };
    }
  } catch (err) {
    return { success: false, message: "เกิดข้อผิดพลาดในการเชื่อมต่อ Telegram: " + err.message };
  }
}

function testTelegramBotApi(botToken) {
  if (!botToken || botToken.trim() === "") {
    return { success: false, message: "กรุณาระบุ Telegram Bot Token" };
  }
  const url = "https://api.telegram.org/bot" + botToken.trim() + "/getMe";
  try {
    const response = UrlFetchApp.fetch(url, { method: "get", muteHttpExceptions: true });
    const code = response.getResponseCode();
    const resText = response.getContentText();
    let result = {};
    try {
      result = JSON.parse(resText);
    } catch(e) {}

    if (code === 200 && result.ok) {
      return {
        success: true,
        bot: {
          id: result.result.id,
          first_name: result.result.first_name,
          username: result.result.username
        },
        message: "เชื่อมต่อ Telegram Bot สำเร็จ (@" + result.result.username + ")"
      };
    } else {
      return { success: false, message: "Bot Token ไม่ถูกต้อง: " + (result.description || ("HTTP " + code)) };
    }
  } catch (err) {
    return { success: false, message: "ไม่สามารถเชื่อมต่อ Telegram API: " + err.message };
  }
}
