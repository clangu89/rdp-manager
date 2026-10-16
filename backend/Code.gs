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
      if (uPassHash === inputHash) {
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
  const usersSheet = ss.getSheetByName("Users");
  const permSheet = ss.getSheetByName("Permissions");
  const data = usersSheet.getDataRange().getValues();
  const now = new Date();

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
      now
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
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
