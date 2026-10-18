/**
 * ====================================================================
 * RDP Manager - Authentication & Session
 * ====================================================================
 * จัดการการล็อกอิน สถานะผู้ใช้ และสิทธิ์การเข้าถึง
 */

// เคลียร์ Token เก่าที่เคยบันทึกค้างไว้ใน localStorage ของเบราว์เซอร์อัตโนมัติ
try {
  localStorage.removeItem("rdp_auth_token");
  localStorage.removeItem("rdp_auth_user");
} catch (e) {}

const Auth = {
  TOKEN_KEY: "rdp_auth_token",
  USER_KEY: "rdp_auth_user",

  async login(username, password) {
    const res = await API.call("login", {
      username: username,
      password: password
    });

    if (res.success && res.token) {
      sessionStorage.setItem(this.TOKEN_KEY, res.token);
      sessionStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
      return { success: true, user: res.user };
    } else {
      return { success: false, message: res.message || "เข้าสู่ระบบไม่สำเร็จ" };
    }
  },

  async requestPin(username) {
    const res = await API.call("requestLoginPin", {
      username: username
    });
    return res;
  },

  async loginWithPin(username, pin) {
    const res = await API.call("loginWithPin", {
      username: username,
      pin: pin
    });

    if (res.success && res.token) {
      sessionStorage.setItem(this.TOKEN_KEY, res.token);
      sessionStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
      return { success: true, user: res.user };
    } else {
      return { success: false, message: res.message || "เข้าสู่ระบบไม่สำเร็จ" };
    }
  },

  async logout() {
    const token = this.getToken();
    if (token) {
      try {
        await API.call("logout", { token: token });
      } catch (e) {}
    }
    sessionStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    window.location.reload();
  },

  getToken() {
    return sessionStorage.getItem(this.TOKEN_KEY);
  },

  getUser() {
    const userStr = sessionStorage.getItem(this.USER_KEY);
    try {
      return userStr ? JSON.parse(userStr) : null;
    } catch (e) {
      return null;
    }
  },

  isLoggedIn() {
    return Boolean(this.getToken() && this.getUser());
  },

  isAdmin() {
    const user = this.getUser();
    return user && user.role === "admin";
  }
};
