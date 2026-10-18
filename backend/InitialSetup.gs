/**
 * ====================================================================
 * RDP Manager - Google Apps Script Initial Setup Script
 * ====================================================================
 * สคริปต์สำหรับเริ่มต้นระบบ: สร้างตาราง (Sheets), หัวคอลัมน์, บัญชี Admin เริ่มต้น และข้อมูลตัวอย่าง
 * วิธีใช้:
 * 1. เปิด Google Sheets เปล่าขึ้นมา 1 ไฟล์
 * 2. ไปที่เมนู Extensions > Apps Script
 * 3. วางโค้ด InitialSetup.gs และ Code.gs
 * 4. เลือกฟังก์ชัน runInitialSetup() แล้วกดปุ่ม Run เพื่อเริ่มต้นระบบ
 */

function runInitialSetup() {
  const ss = getSpreadsheet();
  
  // 1. สร้างหรือเตรียม Sheet: Users
  let usersSheet = ss.getSheetByName("Users");
  if (!usersSheet) {
    usersSheet = ss.insertSheet("Users");
  }
  if (usersSheet.getLastRow() === 0) {
    usersSheet.appendRow([
      "user_id",
      "username",
      "password_hash",
      "display_name",
      "role",
      "status",
      "created_at",
      "telegram_chat_id"
    ]);
    formatHeaderRow(usersSheet);
    
    // สร้างบัญชี Admin เริ่มต้น: admin / admin1234
    const adminPassHash = hashPassword("admin1234");
    usersSheet.appendRow([
      "USR-ADMIN-01",
      "admin",
      adminPassHash,
      "ผู้ดูแลระบบ (Administrator)",
      "admin",
      "active",
      new Date(),
      ""
    ]);

    // สร้างบัญชีผู้ใช้ทั่วไปตัวอย่าง: staff / staff1234
    const staffPassHash = hashPassword("staff1234");
    usersSheet.appendRow([
      "USR-STAFF-01",
      "staff",
      staffPassHash,
      "เจ้าหน้าที่ปฏิบัติการ (Staff)",
      "user",
      "active",
      new Date(),
      ""
    ]);
  }

  // 2. สร้างหรือเตรียม Sheet: Sites
  let sitesSheet = ss.getSheetByName("Sites");
  if (!sitesSheet) {
    sitesSheet = ss.insertSheet("Sites");
  }
  if (sitesSheet.getLastRow() === 0) {
    sitesSheet.appendRow([
      "site_id",
      "site_name",
      "ip_address",
      "port",
      "username",
      "password",
      "group_name",
      "description",
      "updated_at"
    ]);
    formatHeaderRow(sitesSheet);

    // ใส่ข้อมูลไซต์งานตัวอย่าง
    const now = new Date();
    sitesSheet.appendRow([
      "SITE-001",
      "สำนักงานใหญ่ (HQ Datacenter)",
      "192.168.1.10",
      3389,
      "Administrator",
      "P@ssw0rdHQ2026",
      "Headquarters",
      "เครื่องแม่ข่ายเซิร์ฟเวอร์หลัก กทม.",
      now
    ]);
    sitesSheet.appendRow([
      "SITE-002",
      "สาขาเชียงใหม่ (Branch Chiang Mai)",
      "10.20.1.5",
      3389,
      "branch_admin",
      "Cnx#Remote99",
      "Branch",
      "เครื่องสำรองข้อมูลสาขาภาคเหนือ",
      now
    ]);
    sitesSheet.appendRow([
      "SITE-003",
      "ศูนย์กระจายสินค้า บางนา (Warehouse)",
      "10.30.2.100",
      3390,
      "wh_operator",
      "WhSecure#2026",
      "Warehouse",
      "ระบบควบคุมสต็อกสินค้าและคลัง",
      now
    ]);
  }

  // 3. สร้างหรือเตรียม Sheet: Permissions
  let permSheet = ss.getSheetByName("Permissions");
  if (!permSheet) {
    permSheet = ss.insertSheet("Permissions");
  }
  if (permSheet.getLastRow() === 0) {
    permSheet.appendRow([
      "permission_id",
      "user_id",
      "site_id",
      "assigned_at"
    ]);
    formatHeaderRow(permSheet);

    // สิทธิ์เริ่มต้น: Admin เข้าได้ทุกไซต์ (*)
    permSheet.appendRow([
      "PERM-001",
      "USR-ADMIN-01",
      "*",
      new Date()
    ]);

    // สิทธิ์เริ่มต้น: Staff ให้เห็นเฉพาะ SITE-002 (สาขาเชียงใหม่)
    permSheet.appendRow([
      "PERM-002",
      "USR-STAFF-01",
      "SITE-002",
      new Date()
    ]);
  }

  // 4. สร้างหรือเตรียม Sheet: Groups
  let groupsSheet = ss.getSheetByName("Groups");
  if (!groupsSheet) {
    groupsSheet = ss.insertSheet("Groups");
  }
  if (groupsSheet.getLastRow() === 0) {
    groupsSheet.appendRow([
      "group_id",
      "group_name",
      "description",
      "created_at"
    ]);
    formatHeaderRow(groupsSheet);

    const now = new Date();
    groupsSheet.appendRow(["GRP-001", "Headquarters", "สำนักงานใหญ่ / ศูนย์กลางระบบ", now]);
    groupsSheet.appendRow(["GRP-002", "Branch", "สาขาต่างจังหวัด / หน่วยงานภูมิภาค", now]);
    groupsSheet.appendRow(["GRP-003", "Warehouse", "คลังสินค้าและศูนย์กระจายสินค้า", now]);
    groupsSheet.appendRow(["GRP-004", "General", "หมวดหมู่ทั่วไป", now]);
  }

  // 5. สร้างหรือเตรียม Sheet: AuditLogs
  let logsSheet = ss.getSheetByName("AuditLogs");
  if (!logsSheet) {
    logsSheet = ss.insertSheet("AuditLogs");
  }
  if (logsSheet.getLastRow() === 0) {
    logsSheet.appendRow([
      "log_id",
      "timestamp",
      "user_id",
      "action",
      "site_id",
      "details"
    ]);
    formatHeaderRow(logsSheet);
    
    logsSheet.appendRow([
      "LOG-INIT",
      new Date(),
      "SYSTEM",
      "SYSTEM_INIT",
      "-",
      "ระบบเริ่มต้นฐานข้อมูลสำเร็จ"
    ]);
  }

  // 6. สร้างหรือเตรียม Sheet: Settings
  let settingsSheet = ss.getSheetByName("Settings");
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet("Settings");
  }
  if (settingsSheet.getLastRow() === 0) {
    settingsSheet.appendRow([
      "key",
      "value",
      "updated_at"
    ]);
    formatHeaderRow(settingsSheet);

    const now = new Date();
    settingsSheet.appendRow(["TELEGRAM_BOT_TOKEN", "", now]);
    settingsSheet.appendRow(["PIN_EXPIRE_MINUTES", "5", now]);
    settingsSheet.appendRow(["MAX_PIN_ATTEMPTS", "3", now]);
  }

  // เรียกตรวจสอบ Migration
  ensureSchemaMigration(ss);

  // ลบ Sheet1 เริ่มต้นถ้ามีและว่าง
  const defaultSheet = ss.getSheetByName("Sheet1") || ss.getSheetByName("แผ่นงาน1");
  if (defaultSheet && defaultSheet.getLastRow() === 0) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch(e) {}
  }

  Logger.log("✅ การตั้งค่าฐานข้อมูลเริ่มต้นเสร็จสมบูรณ์เรียบร้อย!");
}

function ensureSchemaMigration(ss) {
  if (!ss) ss = getSpreadsheet();
  
  // 1. ตรวจสอบตาราง Users ว่ามีคอลัมน์ telegram_chat_id หรือยัง
  const usersSheet = ss.getSheetByName("Users");
  if (usersSheet && usersSheet.getLastRow() > 0) {
    const headers = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
    const hasTelegramCol = headers.some(h => String(h).trim() === "telegram_chat_id");
    if (!hasTelegramCol) {
      const newColIndex = headers.length + 1;
      usersSheet.getRange(1, newColIndex).setValue("telegram_chat_id");
      formatHeaderRow(usersSheet);
      Logger.log("✅ Auto-migrated Users sheet: added telegram_chat_id column at " + newColIndex);
    }
  }

  // 2. ตรวจสอบตาราง Settings
  let settingsSheet = ss.getSheetByName("Settings");
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet("Settings");
  }
  if (settingsSheet.getLastRow() === 0) {
    settingsSheet.appendRow(["key", "value", "updated_at"]);
    formatHeaderRow(settingsSheet);
    const now = new Date();
    settingsSheet.appendRow(["TELEGRAM_BOT_TOKEN", "", now]);
    settingsSheet.appendRow(["PIN_EXPIRE_MINUTES", "5", now]);
    settingsSheet.appendRow(["MAX_PIN_ATTEMPTS", "3", now]);
    Logger.log("✅ Auto-migrated Settings sheet created");
  }

  // 3. ตรวจสอบตาราง Sites ว่ามีคอลัมน์ machines_json หรือยัง
  const sitesSheet = ss.getSheetByName("Sites");
  if (sitesSheet && sitesSheet.getLastRow() > 0) {
    const headers = sitesSheet.getRange(1, 1, 1, sitesSheet.getLastColumn()).getValues()[0];
    const hasMachinesCol = headers.some(h => String(h).trim() === "machines_json");
    if (!hasMachinesCol) {
      const newColIndex = headers.length + 1;
      sitesSheet.getRange(1, newColIndex).setValue("machines_json");
      formatHeaderRow(sitesSheet);
      Logger.log("✅ Auto-migrated Sites sheet: added machines_json column at " + newColIndex);
    }
  }
}

function formatHeaderRow(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  headerRange.setBackground("#1e293b"); // Slate 800
  headerRange.setFontColor("#ffffff");
  headerRange.setFontWeight("bold");
  sheet.setFrozenRows(1);
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

/**
 * ฟังก์ชันสำหรับให้เจ้าของบัญชี Google กดยอมรับสิทธิ์ (OAuth Authorization)
 * เพื่อปลดล็อกสิทธิ์ UrlFetchApp (การยิง Telegram Bot) และ Spreadsheets
 */
function testAuthorization() {
  Logger.log("1. ตรวจสอบการเข้าถึง Google Spreadsheet...");
  const ss = getSpreadsheet();
  Logger.log("   -> เข้าถึงสเปรดชีตสำเร็จ: " + ss.getName());
  
  Logger.log("2. ตรวจสอบสิทธิ์ UrlFetchApp (สำหรับส่งรหัส Telegram Bot)...");
  const res = UrlFetchApp.fetch("https://api.telegram.org", { muteHttpExceptions: true });
  Logger.log("   -> เชื่อมต่อภายนอกสำเร็จ: HTTP " + res.getResponseCode());
  
  Logger.log("========================================================");
  Logger.log("🎉 การให้สิทธิ์ (Authorization) ครบถ้วนสมบูรณ์ 100%!");
  Logger.log("========================================================");
}
