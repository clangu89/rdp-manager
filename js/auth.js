/**
 * ====================================================================
 * RDP Manager - Authentication & Session
 * ====================================================================
 * จัดการการล็อกอิน สถานะผู้ใช้ และสิทธิ์การเข้าถึง
 */

const Auth = {
  TOKEN_KEY: "rdp_auth_token",
  USER_KEY: "rdp_auth_user",

  async login(username, password) {
    const res = await API.call("login", {
      username: username,
      password: password
    });

    if (res.success && res.token) {
      localStorage.setItem(this.TOKEN_KEY, res.token);
      localStorage.setItem(this.USER_KEY, JSON.stringify(res.user));
      return { success: true, user: res.user };
    } else {
      return { success: false, message: res.message || "เข้าสู่ระบบไม่สำเร็จ" };
    }
  },

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    window.location.reload();
  },

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  getUser() {
    const userStr = localStorage.getItem(this.USER_KEY);
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
