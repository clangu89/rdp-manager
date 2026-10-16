/**
 * ====================================================================
 * RDP Manager - API Client
 * ====================================================================
 * โมดูลสื่อสารกับ Google Apps Script Web App Backend
 * รองรับการส่งคำขอแบบ CORS-friendly และโหมด Demo หากยังไม่ได้ใส่ URL
 */

const API = {
  // ฟังก์ชันกลางในการส่งคำขอไปยัง GAS Web App
  async call(action, payload = {}) {
    const apiUrl = CONFIG.getGasApiUrl();

    // หากยังไม่ได้ตั้งค่า Web App URL ให้ใช้ Demo Mode เพื่อให้ทดลองระบบได้ทันที
    if (!apiUrl) {
      console.warn("⚠️ ยังไม่ได้ระบุ GAS API URL: ทำงานในโหมดสาธิต (Demo Mode)");
      return this.handleDemoMode(action, payload);
    }

    try {
      const requestData = {
        action: action,
        ...payload
      };

      // ใช้ Content-Type: text/plain เพื่อป้องกัน CORS Preflight (OPTIONS) ปัญหาคลาสสิกของ GAS
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("API Call Error:", error);
      return {
        success: false,
        message: "ไม่สามารถเชื่อมต่อกับ Google Apps Script ได้ (" + error.message + ") กรุณาตรวจสอบ Web App URL"
      };
    }
  },

  // ------------------------------------------------------------------
  // Mock / Demo Mode Handler (สำหรับพรีวิวระบบก่อน Deploy GAS)
  // ------------------------------------------------------------------
  handleDemoMode(action, payload) {
    return new Promise((resolve) => {
      setTimeout(() => {
        let demoSites = JSON.parse(localStorage.getItem("demo_sites") || "null");
        if (!demoSites) {
          demoSites = [
            {
              site_id: "SITE-001",
              site_name: "สำนักงานใหญ่ (HQ Datacenter)",
              ip_address: "192.168.1.10",
              port: 3389,
              username: "Administrator",
              password: "••••••••",
              remote_payload: btoa(unescape(encodeURIComponent(JSON.stringify({
                ip: "192.168.1.10",
                port: 3389,
                user: "Administrator",
                pass: "P@ssw0rdHQ2026"
              })))),
              group_name: "Headquarters",
              description: "เครื่องแม่ข่ายเซิร์ฟเวอร์หลัก กทม.",
              updated_at: new Date().toISOString()
            },
            {
              site_id: "SITE-002",
              site_name: "สาขาเชียงใหม่ (Branch Chiang Mai)",
              ip_address: "10.20.1.5",
              port: 3389,
              username: "branch_admin",
              password: "••••••••",
              remote_payload: btoa(unescape(encodeURIComponent(JSON.stringify({
                ip: "10.20.1.5",
                port: 3389,
                user: "branch_admin",
                pass: "Cnx#Remote99"
              })))),
              group_name: "Branch",
              description: "เครื่องสำรองข้อมูลสาขาภาคเหนือ",
              updated_at: new Date().toISOString()
            },
            {
              site_id: "SITE-003",
              site_name: "ศูนย์กระจายสินค้า บางนา (Warehouse)",
              ip_address: "10.30.2.100",
              port: 3390,
              username: "wh_operator",
              password: "••••••••",
              remote_payload: btoa(unescape(encodeURIComponent(JSON.stringify({
                ip: "10.30.2.100",
                port: 3390,
                user: "wh_operator",
                pass: "WhSecure#2026"
              })))),
              group_name: "Warehouse",
              description: "ระบบควบคุมสต็อกสินค้าและคลัง",
              updated_at: new Date().toISOString()
            }
          ];
          localStorage.setItem("demo_sites", JSON.stringify(demoSites));
        }

        switch (action) {
          case "login":
            if (payload.username === "admin" && payload.password === "admin1234") {
              resolve({
                success: true,
                token: "DEMO_TOKEN_ADMIN",
                user: {
                  userId: "USR-ADMIN-01",
                  username: "admin",
                  displayName: "ผู้ดูแลระบบ (Admin Demo)",
                  role: "admin"
                }
              });
            } else if (payload.username === "staff" && payload.password === "staff1234") {
              resolve({
                success: true,
                token: "DEMO_TOKEN_STAFF",
                user: {
                  userId: "USR-STAFF-01",
                  username: "staff",
                  displayName: "เจ้าหน้าที่ทั่วไป (Staff Demo)",
                  role: "user"
                }
              });
            } else {
              resolve({ success: false, message: "Username หรือ Password ไม่ถูกต้อง (เดโม่: admin/admin1234 หรือ staff/staff1234)" });
            }
            break;

          case "requestLoginPin":
            if (payload.username === "admin" || payload.username === "staff") {
              const demoPin = "123456";
              sessionStorage.setItem("demo_pin", demoPin);
              sessionStorage.setItem("demo_pin_user", payload.username);
              setTimeout(() => {
                if (typeof Toast !== "undefined") {
                  Toast.show("🤖 [Demo Telegram] รหัส PIN ของคุณคือ: 123456", "info");
                }
              }, 500);
              resolve({
                success: true,
                message: "ระบบจำลองส่งรหัส PIN 6 หลักไปยัง Telegram แล้ว (รหัสเดโม่: 123456)",
                cooldownSeconds: 60,
                expireSeconds: 300
              });
            } else {
              resolve({ success: false, message: "ไม่พบชื่อผู้ใช้งานนี้ในระบบเดโม่ (ทดลองใช้: admin หรือ staff)" });
            }
            break;

          case "loginWithPin":
            const savedPin = sessionStorage.getItem("demo_pin") || "123456";
            const pinUser = sessionStorage.getItem("demo_pin_user") || payload.username;
            if (payload.pin === savedPin) {
              const isAdmin = pinUser === "admin";
              resolve({
                success: true,
                token: isAdmin ? "DEMO_TOKEN_ADMIN" : "DEMO_TOKEN_STAFF",
                user: {
                  userId: isAdmin ? "USR-ADMIN-01" : "USR-STAFF-01",
                  username: pinUser,
                  displayName: isAdmin ? "ผู้ดูแลระบบ (Admin Demo)" : "เจ้าหน้าที่ทั่วไป (Staff Demo)",
                  role: isAdmin ? "admin" : "user"
                }
              });
            } else {
              resolve({ success: false, message: "รหัส PIN ไม่ถูกต้อง (ในโหมด Demo ให้ใช้รหัส: 123456)" });
            }
            break;

          case "getSettings":
            resolve({
              success: true,
              settings: {
                telegram_bot_token: localStorage.getItem("demo_telegram_bot_token") || "",
                has_bot_token: Boolean(localStorage.getItem("demo_telegram_bot_token"))
              }
            });
            break;

          case "saveSettings":
            if (payload.settingsData && payload.settingsData.telegram_bot_token !== undefined) {
              localStorage.setItem("demo_telegram_bot_token", payload.settingsData.telegram_bot_token);
            }
            resolve({ success: true, message: "บันทึกการตั้งค่าเรียบร้อย (Demo)" });
            break;

          case "testTelegramBot":
            resolve({
              success: true,
              message: "เชื่อมต่อ Telegram Bot สำเร็จ (@DemoRemoteBot)",
              bot: { id: 12345678, username: "DemoRemoteBot", first_name: "RDP Manager Bot Demo" }
            });
            break;

          case "getSites":
            resolve({
              success: true,
              role: payload.token === "DEMO_TOKEN_ADMIN" ? "admin" : "user",
              sites: payload.token === "DEMO_TOKEN_ADMIN" ? demoSites : [demoSites[1]]
            });
            break;

          case "saveSite":
            const newSite = {
              site_id: payload.siteData.site_id || "SITE-" + Date.now(),
              site_name: payload.siteData.site_name,
              ip_address: payload.siteData.ip_address,
              port: parseInt(payload.siteData.port) || 3389,
              username: payload.siteData.username,
              password: payload.siteData.password || "••••••••",
              remote_payload: btoa(unescape(encodeURIComponent(JSON.stringify({
                ip: payload.siteData.ip_address,
                port: parseInt(payload.siteData.port) || 3389,
                user: payload.siteData.username,
                pass: payload.siteData.password
              })))),
              group_name: payload.siteData.group_name || "General",
              description: payload.siteData.description || "",
              updated_at: new Date().toISOString()
            };
            const idx = demoSites.findIndex(s => s.site_id === newSite.site_id);
            if (idx >= 0) {
              demoSites[idx] = newSite;
            } else {
              demoSites.push(newSite);
            }
            localStorage.setItem("demo_sites", JSON.stringify(demoSites));
            resolve({ success: true, message: "บันทึกข้อมูลไซต์งานสำเร็จ (Demo)" });
            break;

          case "deleteSite":
            demoSites = demoSites.filter(s => s.site_id !== payload.siteId);
            localStorage.setItem("demo_sites", JSON.stringify(demoSites));
            resolve({ success: true, message: "ลบไซต์งานสำเร็จ (Demo)" });
            break;

          case "getUsers":
            resolve({
              success: true,
              users: [
                {
                  user_id: "USR-ADMIN-01",
                  username: "admin",
                  display_name: "ผู้ดูแลระบบ (Admin)",
                  role: "admin",
                  status: "active",
                  allowed_sites: ["*"]
                },
                {
                  user_id: "USR-STAFF-01",
                  username: "staff",
                  display_name: "เจ้าหน้าที่สาขาเชียงใหม่ (Staff)",
                  role: "user",
                  status: "active",
                  allowed_sites: ["SITE-002"]
                }
              ],
              all_sites: demoSites.map(s => ({
                site_id: s.site_id,
                site_name: s.site_name,
                ip_address: s.ip_address
              }))
            });
            break;

          case "getGroups":
            let demoGroups = JSON.parse(localStorage.getItem("demo_groups") || "null");
            if (!demoGroups) {
              demoGroups = [
                { group_id: "GRP-001", group_name: "Headquarters", description: "สำนักงานใหญ่ / ศูนย์กลางระบบ", created_at: new Date().toISOString() },
                { group_id: "GRP-002", group_name: "Branch", description: "สาขาต่างจังหวัด / หน่วยงานภูมิภาค", created_at: new Date().toISOString() },
                { group_id: "GRP-003", group_name: "Warehouse", description: "คลังสินค้าและศูนย์กระจายสินค้า", created_at: new Date().toISOString() },
                { group_id: "GRP-004", group_name: "General", description: "หมวดหมู่ทั่วไป", created_at: new Date().toISOString() }
              ];
              localStorage.setItem("demo_groups", JSON.stringify(demoGroups));
            }
            const counts = {};
            demoSites.forEach(s => {
              const gn = (s.group_name || "General").toLowerCase();
              counts[gn] = (counts[gn] || 0) + 1;
            });
            resolve({
              success: true,
              groups: demoGroups.map(g => ({
                ...g,
                site_count: counts[g.group_name.toLowerCase()] || 0
              }))
            });
            break;

          case "saveGroup":
            let curGroups = JSON.parse(localStorage.getItem("demo_groups") || "[]");
            const gData = payload.groupData;
            const newGName = gData.group_name.trim();

            const isDuplicate = curGroups.some(g => 
              g.group_name.toLowerCase() === newGName.toLowerCase() && 
              g.group_id !== gData.group_id
            );
            if (isDuplicate) {
              resolve({ success: false, message: `มีชื่อกลุ่ม "${newGName}" อยู่ในระบบแล้ว` });
              return;
            }

            if (gData.group_id) {
              const gIdx = curGroups.findIndex(g => g.group_id === gData.group_id);
              if (gIdx >= 0) {
                const oldName = curGroups[gIdx].group_name;
                curGroups[gIdx].group_name = newGName;
                curGroups[gIdx].description = gData.description || "";
                
                // Update sites with old group name
                demoSites.forEach(s => {
                  if (s.group_name.toLowerCase() === oldName.toLowerCase()) {
                    s.group_name = newGName;
                  }
                });
                localStorage.setItem("demo_sites", JSON.stringify(demoSites));
              }
            } else {
              curGroups.push({
                group_id: "GRP-" + Date.now(),
                group_name: newGName,
                description: gData.description || "",
                created_at: new Date().toISOString()
              });
            }
            localStorage.setItem("demo_groups", JSON.stringify(curGroups));
            resolve({ success: true, message: "บันทึกข้อมูลกลุ่มสำเร็จ (Demo)" });
            break;

          case "deleteGroup":
            let groupsToDel = JSON.parse(localStorage.getItem("demo_groups") || "[]");
            const targetG = groupsToDel.find(g => g.group_id === payload.groupId);
            if (!targetG) {
              resolve({ success: false, message: "ไม่พบกลุ่มที่ต้องการลบ" });
              return;
            }

            // Option B rule: Check if sites exist in this group
            const siteCountInGroup = demoSites.filter(s => 
              (s.group_name || "").toLowerCase() === targetG.group_name.toLowerCase()
            ).length;

            if (siteCountInGroup > 0) {
              resolve({ 
                success: false, 
                message: `ไม่สามารถลบกลุ่ม "${targetG.group_name}" ได้ เนื่องจากยังมีไซต์งานอยู่ในกลุ่มนี้จำนวน ${siteCountInGroup} ไซต์ กรุณาย้ายไซต์งานไปกลุ่มอื่นก่อนลบ` 
              });
              return;
            }

            groupsToDel = groupsToDel.filter(g => g.group_id !== payload.groupId);
            localStorage.setItem("demo_groups", JSON.stringify(groupsToDel));
            resolve({ success: true, message: "ลบกลุ่มสำเร็จ (Demo)" });
            break;

          case "saveUser":
          case "deleteUser":
          case "logRemoteAction":
            resolve({ success: true, message: "ดำเนินการสำเร็จ (Demo)" });
            break;

          default:
            resolve({ success: false, message: "Unknown action in Demo" });
        }
      }, 300);
    });

  }
};
