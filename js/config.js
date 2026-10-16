/**
 * ====================================================================
 * RDP Manager - Configuration File
 * ====================================================================
 * กำหนด URL ของ Google Apps Script Web App ที่ได้จากการ Deploy
 */

const CONFIG = {
  // นำ URL ที่ได้จากการ Deploy Google Apps Script Web App มาวางที่นี่
  // ตัวอย่าง: "https://script.google.com/macros/s/AKfycbx.../exec"
  DEFAULT_GAS_API_URL: "https://script.google.com/macros/s/AKfycbwCfRzhKre-7Bv41SPhHuGQw2nK0_ResJ4r-_QUsNicl3AlakHyJmNGlvRIneZOVCzn/exec",

  // ฟังก์ชันดึง URL ที่ใช้งานจริง (ดึงจาก LocalStorage ก่อน หากผู้ใช้ตั้งค่าผ่านหน้าเว็บ)
  getGasApiUrl: function() {
    const savedUrl = localStorage.getItem("rdp_gas_api_url");
    if (savedUrl && savedUrl.trim() !== "") {
      return savedUrl.trim();
    }
    return this.DEFAULT_GAS_API_URL.trim();
  },

  // บันทึก URL ใหม่
  setGasApiUrl: function(url) {
    if (url && url.trim() !== "") {
      localStorage.setItem("rdp_gas_api_url", url.trim());
    } else {
      localStorage.removeItem("rdp_gas_api_url");
    }
  },

  // โหมดเชื่อมต่อเริ่มต้น: 'protocol' (Zero-Prompt) หรือ 'rdp_file' (.rdp file)
  getConnectionMode: function() {
    return localStorage.getItem("rdp_connection_mode") || "protocol";
  },

  setConnectionMode: function(mode) {
    localStorage.setItem("rdp_connection_mode", mode);
  }
};
