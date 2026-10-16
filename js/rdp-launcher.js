/**
 * ====================================================================
 * RDP Manager - RDP Launcher & Protocol Bridge
 * ====================================================================
 * จัดการการเปิดโปรแกรม Remote Desktop Connection (mstsc.exe)
 * รองรับทั้ง Zero-Prompt Protocol (rdpconnect://) และ .rdp File Generator
 */

const RdpLauncher = {
  // ฟังก์ชันหลักในการเปิด Remote Desktop
  async connect(site) {
    const mode = CONFIG.getConnectionMode(); // 'protocol' หรือ 'rdp_file'

    // บันทึก Audit Log ผ่าน API ในเบื้องหลัง
    if (Auth.isLoggedIn()) {
      API.call("logRemoteAction", {
        token: Auth.getToken(),
        siteId: site.site_id
      });
    }

    if (mode === "protocol") {
      this.launchViaProtocol(site);
    } else {
      this.launchViaRdpFile(site);
    }
  },

  // 1. เปิดผ่าน Custom Protocol (rdpconnect://) - Zero Prompt
  launchViaProtocol(site) {
    let payload = site.remote_payload;

    // ถ้าไม่มี remote_payload สำเร็จรูป ให้สร้างเองจากข้อมูลไซต์
    if (!payload) {
      const data = {
        id: site.site_id,
        name: site.site_name,
        ip: site.ip_address,
        port: site.port || 3389,
        user: site.username,
        pass: site.password || ""
      };
      payload = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    }

    const uri = "rdpconnect://" + payload;

    // Trigger URL Scheme
    const link = document.createElement("a");
    link.href = uri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Toast.show(`⚡ กำลังส่งคำสั่งเชื่อมต่อ Windows Remote Desktop ไปยัง "${site.site_name}"...`, "success", 4000);
  },

  // 2. สร้างและดาวน์โหลดไฟล์ .rdp มาตรฐาน (Fallback)
  launchViaRdpFile(site) {
    const fullAddress = `${site.ip_address}:${site.port || 3389}`;
    const username = site.username || "";

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
      "redirectposdevices:i:0",
      "displayconnectionbar:i:1",
      "autoreconnection enabled:i:1",
      "authentication level:i:2",
      "prompt for credentials:i:0",
      "negotiate security layer:i:1",
      `full address:s:${fullAddress}`,
      `username:s:${username}`
    ].join("\r\n");

    const blob = new Blob([rdpContent], { type: "application/x-rdp" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (site.site_name || "remote").replace(/[^a-zA-Z0-9_\u0E00-\u0E7F]/g, "_");
    a.href = url;
    a.download = `${safeName}.rdp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    Toast.show(`📁 ดาวน์โหลดไฟล์การเชื่อมต่อสำหรับ "${site.site_name}" เรียบร้อยแล้ว`, "info", 4000);
  },

  // สร้างและดาวน์โหลดไฟล์ install-rdp-protocol.bat ให้ผู้ใช้งานติดตั้งได้จากหน้าเว็บทันที
  downloadProtocolInstaller() {
    const batContent = `@echo off
chcp 65001 >nul
echo ========================================================
echo   RDP Manager: 1-Click Zero-Prompt Protocol Setup
echo   (clangu89 / rdp-manager)
echo ========================================================
echo.

set "SCRIPT_URL=https://raw.githubusercontent.com/clangu89/rdp-manager/main/helper/install-rdp-protocol.ps1"
set "TMP_PS1=%TEMP%\\install-rdp-protocol.ps1"

echo [*] Downloading installer script from repository...
curl.exe -sL "%SCRIPT_URL%" -o "%TMP_PS1%"

if not exist "%TMP_PS1%" (
    echo [!] Download failed. Running local setup if available...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$d = Join-Path $env:LOCALAPPDATA 'RDPManager'; if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }; $rp = 'HKCU:\\Software\\Classes\\rdpconnect'; if (-not (Test-Path $rp)) { New-Item -Path $rp -Force | Out-Null }; Set-Item -Path $rp -Value 'URL:RDP Connect Protocol'; New-ItemProperty -Path $rp -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null"
) else (
    echo [*] Executing protocol installation...
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

    Toast.show("📥 ดาวน์โหลดไฟล์ติดตั้งตัวเชื่อมต่อ 1-Click สำเร็จ (ให้ดับเบิลคลิกไฟล์ที่ดาวน์โหลด 1 ครั้ง)", "success", 5000);
  }
};
