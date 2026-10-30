/**
 * ====================================================================
 * RDP Manager - RDP Launcher & Protocol Bridge
 * ====================================================================
 * จัดการการเปิดโปรแกรม Remote Desktop Connection (mstsc.exe)
 * รองรับทั้ง Zero-Prompt Protocol (rdpconnect://) และ .rdp File Generator
 * พร้อมระบบ Clipboard + File/Drive Redirection และ Auto-Type ซ่อม rdpclip.exe
 */

const RdpLauncher = {
  HELPER_VERSION: 2,

  encodeUtf8Base64(obj) {
    const utf8Bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = "";
    utf8Bytes.forEach(b => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin);
  },

  decodeUtf8Base64(b64) {
    if (!b64) return null;
    try {
      const binStr = atob(b64);
      const bytes = Uint8Array.from(binStr, c => c.charCodeAt(0));
      let jsonStr;
      try {
        jsonStr = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch (e) {
        jsonStr = binStr;
      }
      return JSON.parse(jsonStr);
    } catch (e) {
      return null;
    }
  },

  // ฟังก์ชันหลักในการเปิด Remote Desktop
  async connect(site, machine = null) {
    const targetMachine = machine || (site.machines && site.machines.length > 0 ? site.machines[0] : null) || {
      machine_id: "MCH-1",
      machine_name: site.site_name,
      ip_address: site.ip_address,
      port: site.port || 3389,
      username: site.username,
      password: site.password,
      remote_payload: site.remote_payload
    };

    const mode = CONFIG.getConnectionMode(); // 'protocol' หรือ 'rdp_file'

    // บันทึก Audit Log และสถานะการ Remote ผ่าน API ในเบื้องหลัง
    if (Auth.isLoggedIn()) {
      API.call("logRemoteAction", {
        token: Auth.getToken(),
        siteId: site.site_id,
        siteName: site.site_name,
        machineId: targetMachine.machine_id,
        machineName: targetMachine.machine_name
      }).then(res => {
        if (res && res.online_users && typeof updateOnlineUsers === "function") {
          updateOnlineUsers(res.online_users);
        }
      });
    }

    if (mode === "protocol") {
      this.launchViaProtocol(site, targetMachine);
    } else {
      this.launchViaRdpFile(site, targetMachine);
    }
  },

  // 1. เปิดผ่าน Custom Protocol (rdpconnect://) - Zero Prompt + Clipboard/Drives Redirection
  launchViaProtocol(site, machine) {
    let dataObj = this.decodeUtf8Base64(machine.remote_payload);

    // ถ้าไม่มี remote_payload สำเร็จรูป หรือถอดรหัสไม่ได้ ให้สร้างเองจากข้อมูลเครื่อง
    if (!dataObj) {
      dataObj = {
        id: site.site_id + "_" + (machine.machine_id || "MCH-1"),
        site_id: site.site_id,
        machine_id: machine.machine_id,
        name: `${site.site_name} - ${machine.machine_name || "Machine"}`,
        ip: machine.ip_address,
        port: machine.port || 3389,
        user: machine.username,
        pass: machine.password || ""
      };
    }

    // แนบเวอร์ชันสคริปต์และค่าการอนุญาต Copy ไฟล์/ข้อความ (ตัวเลือก A)
    dataObj.v = this.HELPER_VERSION;
    dataObj.clipboard = true;
    dataObj.drives = CONFIG.getShareDrives();

    const payload = this.encodeUtf8Base64(dataObj);
    const uri = "rdpconnect://" + payload;

    // Trigger URL Scheme
    const link = document.createElement("a");
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const targetLabel = machine.machine_name ? `${site.site_name} (${machine.machine_name})` : site.site_name;
    Toast.show(`⚡ กำลังส่งคำสั่งเชื่อมต่อ Windows Remote Desktop ไปยัง "${targetLabel}"...`, "success", 4000);
  },

  // 2. สร้างและดาวน์โหลดไฟล์ .rdp มาตรฐาน (Fallback พร้อมเปิด Copy ไฟล์ + ข้อความ)
  launchViaRdpFile(site, machine) {
    const fullAddress = `${machine.ip_address}:${machine.port || 3389}`;
    const username = machine.username || "";
    const shareDrives = CONFIG.getShareDrives();

    const rdpContent = [
      "screen mode id:i:2",
      "use multimon:i:0",
      "desktopwidth:i:1920",
      "desktopheight:i:1080",
      "session bpp:i:32",
      "compression:i:1",
      "keyboardhook:i:2",
      "audiomode:i:0",
      "redirectprinters:i:0",
      "redirectcomports:i:0",
      "redirectsmartcards:i:0",
      "redirectclipboard:i:1",
      `drivestoredirect:s:${shareDrives ? "*" : ""}`,
      "redirectposdevices:i:0",
      "displayconnectionbar:i:1",
      "autoreconnection enabled:i:1",
      "authentication level:i:2",
      "prompt for credentials:i:0",
      "negotiate security layer:i:1",
      "enablecredsspsupport:i:1",
      `full address:s:${fullAddress}`,
      `username:s:${username}`
    ].join("\r\n");

    const blob = new Blob([rdpContent], { type: "application/x-rdp" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const rawSafeName = `${site.site_name || "remote"}_${machine.machine_name || "machine"}`;
    const safeName = rawSafeName.replace(/[^a-zA-Z0-9_\u0E00-\u0E7F]/g, "_");
    a.href = url;
    a.download = `${safeName}.rdp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const targetLabel = machine.machine_name ? `${site.site_name} (${machine.machine_name})` : site.site_name;
    Toast.show(`📁 ดาวน์โหลดไฟล์การเชื่อมต่อสำหรับ "${targetLabel}" เรียบร้อยแล้ว`, "info", 4000);
  },

  // 3. สั่ง Auto-Type พิมพ์คำสั่งซ่อม rdpclip.exe เข้าหน้าต่าง Remote Desktop อัตโนมัติ (รูปแบบที่ 1)
  triggerRemoteClipboardFix(cmdType = "restart_rdpclip") {
    const payload = this.encodeUtf8Base64({
      v: this.HELPER_VERSION,
      action: "fix_clipboard",
      cmdType: cmdType
    });

    const uri = "rdpconnect://" + payload;
    const link = document.createElement("a");
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Toast.show("⌨️ กำลังสลับไปหน้าต่าง Remote Desktop และพิมพ์คำสั่งซ่อม Clipboard ให้อัตโนมัติ...", "info", 5000);
  },

  // สร้างและดาวน์โหลดไฟล์ install-rdp-protocol.bat ให้ผู้ใช้งานติดตั้ง/อัปเดตได้จากหน้าเว็บทันที
  downloadProtocolInstaller() {
    const cacheTs = Date.now();
    const batContent = `@echo off
chcp 65001 >nul
echo ========================================================
echo   RDP Manager: 1-Click Zero-Prompt Protocol Setup v2.0
echo   (Clipboard ^& File Copy Redirection Enabled)
echo   (clangu89 / rdp-manager)
echo ========================================================
echo.

set "SCRIPT_URL=https://raw.githubusercontent.com/clangu89/rdp-manager/main/helper/install-rdp-protocol.ps1?t=${cacheTs}"
set "TMP_PS1=%TEMP%\\install-rdp-protocol.ps1"

echo [*] Downloading installer script v2.0 from repository...
curl.exe -sL "%SCRIPT_URL%" -o "%TMP_PS1%"

if not exist "%TMP_PS1%" (
    echo [!] Download failed. Running local setup if available...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$d = Join-Path $env:LOCALAPPDATA 'RDPManager'; if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }; $rp = 'HKCU:\\Software\\Classes\\rdpconnect'; if (-not (Test-Path $rp)) { New-Item -Path $rp -Force | Out-Null }; Set-Item -Path $rp -Value 'URL:RDP Connect Protocol'; New-ItemProperty -Path $rp -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null"
) else (
    echo [*] Executing protocol installation v2.0...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TMP_PS1%"
    del "%TMP_PS1%" 2>nul
)

echo.
pause
`;

    const blob = new Blob([batContent], { type: "application/x-bat" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "install-rdp-protocol.bat";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    Toast.show("📥 ดาวน์โหลดตัวติดตั้ง v2.0 สำเร็จ (ดับเบิลคลิกไฟล์ที่ดาวน์โหลดเพื่อเปิดใช้งาน Copy ไฟล์/ข้อความ)", "success", 5500);
  }
};
