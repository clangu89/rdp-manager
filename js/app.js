/**
 * ====================================================================
 * RDP Manager - Main Application Logic
 * ====================================================================
 */

// Global State
const State = {
  sites: [],
  groups: [],
  users: [],
  allSitesForPerm: [],
  searchTerm: "",
  selectedGroup: "ALL",
  viewMode: localStorage.getItem("rdp_view_mode") || "grid",
  editingSiteId: null,
  editingGroupId: null,
  editingUserId: null,
  isLoading: false,
  // PIN Login State
  pinUsername: "",
  pinExpireInterval: null,
  pinCooldownInterval: null
};


// Toast Notifications System
const Toast = {
  show(message, type = "info", duration = 3500) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast p-4 rounded-xl shadow-lg border flex items-center space-x-3 text-sm font-medium ${
      type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
      type === "error" ? "bg-rose-50 border-rose-200 text-rose-800" :
      type === "warning" ? "bg-amber-50 border-amber-200 text-amber-800" :
      "bg-slate-900 border-slate-700 text-white"
    }`;

    const iconSvg = type === "success" 
      ? `<svg class="w-5 h-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`
      : type === "error"
      ? `<svg class="w-5 h-5 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`
      : type === "warning"
      ? `<svg class="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`
      : `<svg class="w-5 h-5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

    toast.innerHTML = `
      ${iconSvg}
      <span class="flex-1">${message}</span>
      <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-slate-600 focus:outline-none">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
      </button>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("toast-show"));

    setTimeout(() => {
      toast.classList.remove("toast-show");
      toast.classList.add("toast-hide");
      setTimeout(() => toast.remove(), 350);
    }, duration);
  }
};

// Clipboard Helper
async function copyToClipboard(text, label = "คัดลอกสำเร็จ") {
  try {
    await navigator.clipboard.writeText(text);
    Toast.show(`📋 ${label}: ${text}`, "success", 2000);
  } catch (err) {
    const input = document.createElement("input");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
    Toast.show(`📋 ${label}: ${text}`, "success", 2000);
  }
}

// --------------------------------------------------------------------
// UI Controllers & Rendering
// --------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

function initApp() {
  // ตรวจสอบสถานะการล็อกอิน
  if (Auth.isLoggedIn()) {
    showDashboardView();
  } else {
    showLoginView();
  }

  // ผูก Event Listeners ต่างๆ
  setupEventListeners();
}

function showLoginView() {
  document.getElementById("login-view").classList.remove("hidden");
  document.getElementById("dashboard-view").classList.add("hidden");
  showRequestPinView();
}

function showRequestPinView() {
  clearPinTimers();
  document.getElementById("login-request-pin-form")?.classList.remove("hidden");
  document.getElementById("login-verify-pin-form")?.classList.add("hidden");
  document.getElementById("login-password-form")?.classList.add("hidden");
}

function showPasswordFallbackView() {
  clearPinTimers();
  document.getElementById("login-request-pin-form")?.classList.add("hidden");
  document.getElementById("login-verify-pin-form")?.classList.add("hidden");
  document.getElementById("login-password-form")?.classList.remove("hidden");
}

function startPinTimers(expireSeconds = 300, cooldownSeconds = 60) {
  clearPinTimers();

  // 1. Expire Timer (5 mins)
  let expireRemaining = expireSeconds;
  const expireEl = document.getElementById("pin-expire-timer");
  const updateExpireDisplay = () => {
    const mins = Math.floor(expireRemaining / 60);
    const secs = expireRemaining % 60;
    if (expireEl) {
      expireEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    if (expireRemaining <= 0) {
      clearInterval(State.pinExpireInterval);
      Toast.show("⚠️ รหัส PIN หมดอายุแล้ว กรุณากดขอรหัสใหม่", "warning");
      const btnVerify = document.querySelector("#login-verify-pin-form button[type='submit']");
      if (btnVerify) btnVerify.disabled = true;
    }
    expireRemaining--;
  };
  updateExpireDisplay();
  State.pinExpireInterval = setInterval(updateExpireDisplay, 1000);

  // 2. Cooldown Timer (60s)
  let cooldownRemaining = cooldownSeconds;
  const btnResend = document.getElementById("btn-resend-pin");
  const cooldownSpan = document.getElementById("pin-cooldown-timer");
  if (btnResend) {
    btnResend.disabled = true;
    btnResend.innerHTML = `ขอรหัสใหม่ (<span id="pin-cooldown-timer">${cooldownRemaining}</span>s)`;
  }

  const updateCooldownDisplay = () => {
    const liveCooldownSpan = document.getElementById("pin-cooldown-timer");
    if (liveCooldownSpan) liveCooldownSpan.textContent = cooldownRemaining;
    if (cooldownRemaining <= 0) {
      clearInterval(State.pinCooldownInterval);
      if (btnResend) {
        btnResend.disabled = false;
        btnResend.textContent = "ขอรหัสใหม่";
      }
    }
    cooldownRemaining--;
  };
  State.pinCooldownInterval = setInterval(updateCooldownDisplay, 1000);
}

function clearPinTimers() {
  if (State.pinExpireInterval) clearInterval(State.pinExpireInterval);
  if (State.pinCooldownInterval) clearInterval(State.pinCooldownInterval);
  State.pinExpireInterval = null;
  State.pinCooldownInterval = null;
}

function showDashboardView() {
  document.getElementById("login-view").classList.add("hidden");
  document.getElementById("dashboard-view").classList.remove("hidden");

  const user = Auth.getUser();
  if (user) {
    document.getElementById("user-display-name").textContent = user.displayName || user.username;
    document.getElementById("user-role-badge").textContent = user.role === "admin" ? "Admin" : "User";
    
    // แสดง/ซ่อน เมนูเฉพาะ Admin
    const adminElements = document.querySelectorAll(".admin-only");
    adminElements.forEach(el => {
      if (user.role === "admin") {
        el.classList.remove("hidden");
      } else {
        el.classList.add("hidden");
      }
    });
  }

  // แจ้งเตือนหากใช้งาน Demo Mode
  const gasUrl = CONFIG.getGasApiUrl();
  const banner = document.getElementById("demo-mode-banner");
  if (!gasUrl) {
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  loadGroups();
  loadSites();
}

async function loadGroups() {
  try {
    const res = await API.call("getGroups", { token: Auth.getToken() });
    if (res.success) {
      State.groups = res.groups || [];
      populateSiteGroupDropdown();
      updateGroupFilters();
      const groupsModal = document.getElementById("groups-modal");
      if (groupsModal && !groupsModal.classList.contains("hidden")) {
        renderGroupsTable();
      }
    }
  } catch (err) {
    console.error("loadGroups error:", err);
  }
}

function populateSiteGroupDropdown(selectedGroupName = "") {
  const select = document.getElementById("form-site-group");
  if (!select) return;

  if (State.groups.length === 0) {
    select.innerHTML = '<option value="">-- ไม่พบกลุ่มงาน (กรุณาเพิ่มกลุ่มก่อน) --</option>';
    return;
  }

  select.innerHTML = State.groups.map(g => `
    <option value="${g.group_name}" ${g.group_name.toLowerCase() === selectedGroupName.toLowerCase() ? 'selected' : ''}>
      ${g.group_name}
    </option>
  `).join("");

  if (selectedGroupName) {
    select.value = selectedGroupName;
  }
}

async function loadSites() {
  showLoading(true);
  try {
    const res = await API.call("getSites", { token: Auth.getToken() });
    if (res.success) {
      State.sites = res.sites || [];
      updateGroupFilters();
      renderSites();
    } else {
      Toast.show(res.message || "ไม่สามารถโหลดข้อมูลไซต์งานได้", "error");
      if (res.message && res.message.includes("Session หมดอายุ")) {
        Auth.logout();
      }
    }
  } catch (err) {
    Toast.show("เกิดข้อผิดพลาดในการโหลดข้อมูล", "error");
  } finally {
    showLoading(false);
  }
}

function updateGroupFilters() {
  const select = document.getElementById("group-filter-select");
  if (!select) return;
  const currentVal = State.selectedGroup;

  select.innerHTML = `<option value="ALL">ทุกหมวดหมู่ (${State.sites.length})</option>`;

  // ดึงกลุ่มทั้งหมดจาก State.groups รวมกับไซต์งาน
  const groupNames = new Set(State.groups.map(g => g.group_name));
  State.sites.forEach(s => {
    if (s.group_name) groupNames.add(s.group_name);
  });

  groupNames.forEach(gName => {
    const count = State.sites.filter(s => (s.group_name || "").toLowerCase() === gName.toLowerCase()).length;
    select.innerHTML += `<option value="${gName}">${gName} (${count})</option>`;
  });

  select.value = currentVal;
}


function renderSites() {
  const container = document.getElementById("sites-container");
  const filtered = State.sites.filter(site => {
    const matchesSearch = 
      site.site_name.toLowerCase().includes(State.searchTerm.toLowerCase()) ||
      site.ip_address.toLowerCase().includes(State.searchTerm.toLowerCase()) ||
      (site.username && site.username.toLowerCase().includes(State.searchTerm.toLowerCase())) ||
      (site.description && site.description.toLowerCase().includes(State.searchTerm.toLowerCase()));

    const matchesGroup = State.selectedGroup === "ALL" || site.group_name === State.selectedGroup;

    return matchesSearch && matchesGroup;
  });

  document.getElementById("sites-count-badge").textContent = `${filtered.length} ไซต์`;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-16 text-center">
        <div class="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </div>
        <h3 class="text-base font-semibold text-slate-700">ไม่พบข้อมูลไซต์งาน</h3>
        <p class="text-sm text-slate-400 mt-1">ลองเปลี่ยนคำค้นหา หรือเพิ่มไซต์งานใหม่เข้าระบบ</p>
      </div>
    `;
    return;
  }

  const isAdmin = Auth.isAdmin();

  if (State.viewMode === "grid") {
    container.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5";
    container.innerHTML = filtered.map(site => `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group">
        <div class="p-5">
          <!-- Card Header -->
          <div class="flex items-start justify-between gap-3 mb-3">
            <div>
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 mb-1.5">
                ${site.group_name || 'General'}
              </span>
              <h3 class="text-base font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                ${site.site_name}
              </h3>
            </div>
            
            ${isAdmin ? `
              <div class="flex items-center space-x-1">
                <button onclick="openSiteModal('${site.site_id}')" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="แก้ไข">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button onclick="confirmDeleteSite('${site.site_id}', '${site.site_name}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="ลบ">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>
            ` : ''}
          </div>

          <!-- Description if exists -->
          ${site.description ? `<p class="text-xs text-slate-500 mb-4 line-clamp-2">${site.description}</p>` : ''}

          <!-- Connection Details -->
          <div class="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs font-mono">
            <!-- IP & Port -->
            <div class="flex items-center justify-between">
              <span class="text-slate-400 font-sans">IP / Port:</span>
              <div class="flex items-center space-x-1.5">
                <span class="font-semibold text-slate-700">${site.ip_address}:${site.port || 3389}</span>
                <button onclick="copyToClipboard('${site.ip_address}:${site.port || 3389}', 'คัดลอก IP')" class="text-slate-400 hover:text-slate-700" title="คัดลอก IP">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                </button>
              </div>
            </div>

            <!-- Username -->
            <div class="flex items-center justify-between">
              <span class="text-slate-400 font-sans">User:</span>
              <div class="flex items-center space-x-1.5">
                <span class="text-slate-700">${site.username}</span>
                <button onclick="copyToClipboard('${site.username}', 'คัดลอก Username')" class="text-slate-400 hover:text-slate-700" title="คัดลอก Username">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                </button>
              </div>
            </div>

            <!-- Password Status (Protected from regular users) -->
            <div class="flex items-center justify-between">
              <span class="text-slate-400 font-sans">Password:</span>
              <span class="text-slate-400 tracking-widest">••••••••</span>
            </div>
          </div>
        </div>

        <!-- Action Button -->
        <div class="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-3">
          <div class="text-[11px] text-slate-400 flex items-center">
            <span class="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1.5 animate-pulse"></span>
            พร้อมเชื่อมต่อ
          </div>
          
          <button onclick="triggerRemote('${site.site_id}')" class="btn-remote-pulse inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-blue-500/20 active:scale-95 transition-all">
            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
            Remote
          </button>
        </div>
      </div>
    `).join("");
  } else {
    // Table View
    container.className = "bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden";
    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
            <tr>
              <th class="px-5 py-3.5">ชื่อไซต์งาน</th>
              <th class="px-5 py-3.5">กลุ่ม</th>
              <th class="px-5 py-3.5">IP Address : Port</th>
              <th class="px-5 py-3.5">Username</th>
              <th class="px-5 py-3.5 text-right">ดำเนินการ</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${filtered.map(site => `
              <tr class="hover:bg-slate-50/70 transition-colors">
                <td class="px-5 py-4">
                  <div class="font-bold text-slate-800">${site.site_name}</div>
                  ${site.description ? `<div class="text-xs text-slate-400 mt-0.5">${site.description}</div>` : ''}
                </td>
                <td class="px-5 py-4">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    ${site.group_name || 'General'}
                  </span>
                </td>
                <td class="px-5 py-4 font-mono text-xs text-slate-700">
                  <div class="flex items-center space-x-1.5">
                    <span>${site.ip_address}:${site.port || 3389}</span>
                    <button onclick="copyToClipboard('${site.ip_address}:${site.port || 3389}', 'คัดลอก IP')" class="text-slate-400 hover:text-slate-700">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </button>
                  </div>
                </td>
                <td class="px-5 py-4 font-mono text-xs text-slate-700">
                  ${site.username}
                </td>
                <td class="px-5 py-4 text-right whitespace-nowrap">
                  <div class="flex items-center justify-end space-x-2">
                    <button onclick="triggerRemote('${site.site_id}')" class="btn-remote-pulse inline-flex items-center px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm">
                      <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                      Remote
                    </button>
                    ${isAdmin ? `
                      <button onclick="openSiteModal('${site.site_id}')" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="แก้ไข">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                      </button>
                      <button onclick="confirmDeleteSite('${site.site_id}', '${site.site_name}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="ลบ">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }
}

function triggerRemote(siteId) {
  const site = State.sites.find(s => s.site_id === siteId);
  if (!site) return;
  RdpLauncher.connect(site);
}

// --------------------------------------------------------------------
// Modals & Forms
// --------------------------------------------------------------------

function openSiteModal(siteId = null) {
  State.editingSiteId = siteId;
  const form = document.getElementById("site-form");
  form.reset();

  const titleEl = document.getElementById("site-modal-title");

  if (siteId) {
    titleEl.textContent = "แก้ไขข้อมูลไซต์งาน";
    const site = State.sites.find(s => s.site_id === siteId);
    if (site) {
      document.getElementById("form-site-name").value = site.site_name || "";
      populateSiteGroupDropdown(site.group_name || "");
      document.getElementById("form-site-ip").value = site.ip_address || "";
      document.getElementById("form-site-port").value = site.port || 3389;
      document.getElementById("form-site-user").value = site.username || "";
      document.getElementById("form-site-pass").value = site.password || "";
      document.getElementById("form-site-desc").value = site.description || "";
    }
  } else {
    titleEl.textContent = "เพิ่มไซต์งานใหม่";
    populateSiteGroupDropdown(State.groups.length > 0 ? State.groups[0].group_name : "");
    document.getElementById("form-site-port").value = "3389";
  }

  showModal("site-modal");
}

async function handleSiteSubmit(e) {
  e.preventDefault();
  const siteData = {
    site_id: State.editingSiteId,
    site_name: document.getElementById("form-site-name").value.trim(),
    group_name: document.getElementById("form-site-group").value.trim(),
    ip_address: document.getElementById("form-site-ip").value.trim(),
    port: parseInt(document.getElementById("form-site-port").value.trim(), 10) || 3389,
    username: document.getElementById("form-site-user").value.trim(),
    password: document.getElementById("form-site-pass").value,
    description: document.getElementById("form-site-desc").value.trim()
  };

  if (!siteData.site_name || !siteData.ip_address || !siteData.username || !siteData.group_name) {
    Toast.show("กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน รวมทั้งเลือกกลุ่มงาน", "warning");
    return;
  }

  showLoading(true);
  try {
    const res = await API.call("saveSite", {
      token: Auth.getToken(),
      siteData: siteData
    });

    if (res.success) {
      Toast.show(res.message || "บันทึกข้อมูลเรียบร้อย", "success");
      hideModal("site-modal");
      loadSites();
    } else {
      Toast.show(res.message || "เกิดข้อผิดพลาดในการบันทึก", "error");
    }
  } catch (err) {
    Toast.show("เกิดข้อผิดพลาดในการส่งข้อมูล", "error");
  } finally {
    showLoading(false);
  }
}

async function confirmDeleteSite(siteId, siteName) {
  if (confirm(`คุณต้องการลบไซต์งาน "${siteName}" ใช่หรือไม่?`)) {
    showLoading(true);
    try {
      const res = await API.call("deleteSite", {
        token: Auth.getToken(),
        siteId: siteId
      });

      if (res.success) {
        Toast.show(res.message || "ลบไซต์งานสำเร็จ", "success");
        loadSites();
      } else {
        Toast.show(res.message || "เกิดข้อผิดพลาดในการลบ", "error");
      }
    } catch (err) {
      Toast.show("เกิดข้อผิดพลาดในการส่งข้อมูล", "error");
    } finally {
      showLoading(false);
    }
  }
}

// --------------------------------------------------------------------
// User & Permission Management (Admin Only)
// --------------------------------------------------------------------

async function openUsersModal() {
  showLoading(true);
  try {
    const res = await API.call("getUsers", { token: Auth.getToken() });
    if (res.success) {
      State.users = res.users || [];
      State.allSitesForPerm = res.all_sites || [];
      renderUsersTable();
      resetUserForm();
      showModal("users-modal");
    } else {
      Toast.show(res.message || "ไม่สามารถดึงข้อมูลผู้ใช้งานได้", "error");
    }
  } catch (err) {
    Toast.show("เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
  } finally {
    showLoading(false);
  }
}

function renderUsersTable() {
  const container = document.getElementById("users-table-body");
  const currentUserId = Auth.getUser()?.userId;

  container.innerHTML = State.users.map(u => {
    const isSelf = u.user_id === currentUserId;
    const permText = u.role === "admin" || (u.allowed_sites && u.allowed_sites.includes("*"))
      ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">เห็นทุกไซต์งาน (All)</span>`
      : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">${u.allowed_sites.length} ไซต์</span>`;

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-4 py-3 font-semibold text-slate-800">
          ${u.username}
          ${isSelf ? '<span class="ml-1 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">(คุณ)</span>' : ''}
        </td>
        <td class="px-4 py-3 text-slate-600 text-xs">${u.display_name || '-'}</td>
        <td class="px-4 py-3">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'}">
            ${u.role}
          </span>
        </td>
        <td class="px-4 py-3">
          ${u.telegram_chat_id 
            ? `<span class="inline-flex items-center space-x-1 font-mono text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                <span>✈️</span><span>${u.telegram_chat_id}</span>
               </span>`
            : `<span class="text-slate-400 text-[11px] italic">ยังไม่ระบุ</span>`}
        </td>
        <td class="px-4 py-3">${permText}</td>
        <td class="px-4 py-3 text-right space-x-1">
          <button onclick="editUser('${u.user_id}')" class="p-1 text-slate-400 hover:text-blue-600 rounded">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          </button>
          ${!isSelf ? `
            <button onclick="confirmDeleteUser('${u.user_id}', '${u.username}')" class="p-1 text-slate-400 hover:text-rose-600 rounded">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          ` : ''}
        </td>
      </tr>
    `;
  }).join("");
}

function resetUserForm() {
  State.editingUserId = null;
  document.getElementById("user-form").reset();
  document.getElementById("user-form-title").textContent = "➕ เพิ่มผู้ใช้ใหม่และกำหนดสิทธิ์";
  document.getElementById("user-form-pass").required = false;
  document.getElementById("user-form-pass-hint").textContent = "(รหัสผ่านสำหรับโหมดสำรอง)";
  document.getElementById("user-form-telegram").value = "";

  renderSitePermissionCheckboxes([]);
}

function editUser(userId) {
  const user = State.users.find(u => u.user_id === userId);
  if (!user) return;

  State.editingUserId = userId;
  document.getElementById("user-form-title").textContent = `✏️ แก้ไขผู้ใช้: ${user.username}`;
  document.getElementById("user-form-username").value = user.username;
  document.getElementById("user-form-display").value = user.display_name || "";
  document.getElementById("user-form-role").value = user.role;
  document.getElementById("user-form-telegram").value = user.telegram_chat_id || "";
  document.getElementById("user-form-pass").value = "";
  document.getElementById("user-form-pass").required = false;
  document.getElementById("user-form-pass-hint").textContent = "(เว้นว่างไว้หากไม่ต้องการเปลี่ยนรหัสผ่าน)";

  renderSitePermissionCheckboxes(user.allowed_sites || []);
}

function renderSitePermissionCheckboxes(allowedSites = []) {
  const container = document.getElementById("site-permissions-container");
  const isAll = allowedSites.includes("*");

  container.innerHTML = `
    <div class="mb-2">
      <label class="inline-flex items-center space-x-2 cursor-pointer font-semibold text-xs text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 w-full">
        <input type="checkbox" id="perm-all-sites" class="rounded text-blue-600 focus:ring-blue-500" ${isAll ? 'checked' : ''} onchange="toggleAllSitePermissions(this.checked)">
        <span>🌟 สิทธิ์พิเศษ: มองเห็นได้ทุกไซต์งาน (All Sites)</span>
      </label>
    </div>
    <div id="site-checkboxes-list" class="space-y-1.5 max-h-40 overflow-y-auto pr-1 ${isAll ? 'opacity-50 pointer-events-none' : ''}">
      ${State.allSitesForPerm.map(s => {
        const checked = isAll || allowedSites.includes(s.site_id);
        return `
          <label class="flex items-center space-x-2 text-xs text-slate-700 hover:bg-slate-100 p-1.5 rounded cursor-pointer">
            <input type="checkbox" name="site_perm" value="${s.site_id}" class="site-perm-checkbox rounded text-blue-600 focus:ring-blue-500" ${checked ? 'checked' : ''}>
            <span class="truncate">${s.site_name} <span class="font-mono text-slate-400">(${s.ip_address})</span></span>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function toggleAllSitePermissions(isAll) {
  const list = document.getElementById("site-checkboxes-list");
  if (isAll) {
    list.classList.add("opacity-50", "pointer-events-none");
  } else {
    list.classList.remove("opacity-50", "pointer-events-none");
  }
}

async function handleUserSubmit(e) {
  e.preventDefault();

  const isAll = document.getElementById("perm-all-sites").checked;
  let allowedSites = [];

  if (isAll) {
    allowedSites = ["*"];
  } else {
    const checkboxes = document.querySelectorAll(".site-perm-checkbox:checked");
    checkboxes.forEach(cb => allowedSites.push(cb.value));
  }

  const userData = {
    user_id: State.editingUserId,
    username: document.getElementById("user-form-username").value.trim(),
    display_name: document.getElementById("user-form-display").value.trim(),
    role: document.getElementById("user-form-role").value,
    telegram_chat_id: document.getElementById("user-form-telegram").value.trim(),
    password: document.getElementById("user-form-pass").value,
    allowed_sites: allowedSites
  };

  showLoading(true);
  try {
    const res = await API.call("saveUser", {
      token: Auth.getToken(),
      userData: userData
    });

    if (res.success) {
      Toast.show(res.message || "บันทึกข้อมูลผู้ใช้เรียบร้อย", "success");
      openUsersModal(); // รีโหลดตาราง
    } else {
      Toast.show(res.message || "เกิดข้อผิดพลาดในการบันทึก", "error");
    }
  } catch (err) {
    Toast.show("เกิดข้อผิดพลาดในการส่งข้อมูล", "error");
  } finally {
    showLoading(false);
  }
}

async function confirmDeleteUser(userId, username) {
  if (confirm(`คุณต้องการลบผู้ใช้ "${username}" ใช่หรือไม่?`)) {
    showLoading(true);
    try {
      const res = await API.call("deleteUser", {
        token: Auth.getToken(),
        userId: userId
      });

      if (res.success) {
        Toast.show(res.message || "ลบผู้ใช้สำเร็จ", "success");
        openUsersModal();
      } else {
        Toast.show(res.message || "เกิดข้อผิดพลาด", "error");
      }
    } catch (err) {
      Toast.show("เกิดข้อผิดพลาดในการส่งข้อมูล", "error");
    } finally {
      showLoading(false);
    }
  }
}

// --------------------------------------------------------------------
// Group Management Modals & Handlers (Admin Only)
// --------------------------------------------------------------------

function openGroupsModal() {
  if (!Auth.isAdmin()) {
    Toast.show("สิทธิ์ไม่เพียงพอ (เฉพาะ Admin เท่านั้น)", "warning");
    return;
  }
  resetGroupForm();
  renderGroupsTable();
  showModal("groups-modal");
}

function renderGroupsTable() {
  const container = document.getElementById("groups-table-body");
  if (!container) return;

  if (State.groups.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="4" class="px-4 py-8 text-center text-slate-400">
          ยังไม่มีกลุ่มงานในระบบ กรุณาเพิ่มกลุ่มใหม่
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = State.groups.map(g => {
    // นับจำนวนไซต์งานในกลุ่มนี้
    const siteCount = State.sites.filter(s => 
      (s.group_name || "").toLowerCase() === g.group_name.toLowerCase()
    ).length;

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-4 py-3 font-semibold text-slate-800">
          ${g.group_name}
        </td>
        <td class="px-4 py-3 text-slate-500 text-xs">
          ${g.description || '-'}
        </td>
        <td class="px-4 py-3 text-center">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${siteCount > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-500'}">
            ${siteCount} ไซต์
          </span>
        </td>
        <td class="px-4 py-3 text-right space-x-1 whitespace-nowrap">
          <button onclick="editGroup('${g.group_id}')" class="p-1 text-slate-400 hover:text-blue-600 rounded" title="แก้ไข">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          </button>
          <button onclick="confirmDeleteGroup('${g.group_id}', '${g.group_name}', ${siteCount})" class="p-1 text-slate-400 hover:text-rose-600 rounded" title="ลบ">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

function resetGroupForm() {
  State.editingGroupId = null;
  const form = document.getElementById("group-form");
  if (form) form.reset();
  const title = document.getElementById("group-form-title");
  if (title) title.textContent = "➕ เพิ่มกลุ่มใหม่";
}

function editGroup(groupId) {
  const g = State.groups.find(x => x.group_id === groupId);
  if (!g) return;

  State.editingGroupId = groupId;
  document.getElementById("group-form-title").textContent = `✏️ แก้ไขกลุ่ม: ${g.group_name}`;
  document.getElementById("group-form-name").value = g.group_name;
  document.getElementById("group-form-desc").value = g.description || "";
}

async function handleGroupSubmit(e) {
  e.preventDefault();
  const groupData = {
    group_id: State.editingGroupId,
    group_name: document.getElementById("group-form-name").value.trim(),
    description: document.getElementById("group-form-desc").value.trim()
  };

  if (!groupData.group_name) {
    Toast.show("กรุณาระบุชื่อกลุ่มงาน", "warning");
    return;
  }

  showLoading(true);
  try {
    const res = await API.call("saveGroup", {
      token: Auth.getToken(),
      groupData: groupData
    });

    if (res.success) {
      Toast.show(res.message || "บันทึกข้อมูลกลุ่มเรียบร้อย", "success");
      resetGroupForm();
      await loadGroups();
      await loadSites();
    } else {
      Toast.show(res.message || "เกิดข้อผิดพลาดในการบันทึก", "error");
    }
  } catch (err) {
    Toast.show("เกิดข้อผิดพลาดในการส่งข้อมูล", "error");
  } finally {
    showLoading(false);
  }
}

async function confirmDeleteGroup(groupId, groupName, siteCount) {
  // กฎตัวเลือก B (Enforced): ห้ามลบหากมีไซต์งานอยู่ในกลุ่ม
  if (siteCount > 0) {
    alert(`⚠️ ไม่สามารถลบกลุ่ม "${groupName}" ได้\n\nเนื่องจากยังมีไซต์งานผูกอยู่กับกลุ่มนี้จำนวน ${siteCount} ไซต์ กรุณาย้ายหรือเปลี่ยนกลุ่มของไซต์งานก่อนลบ`);
    return;
  }

  if (confirm(`คุณต้องการลบกลุ่ม "${groupName}" ใช่หรือไม่?`)) {
    showLoading(true);
    try {
      const res = await API.call("deleteGroup", {
        token: Auth.getToken(),
        groupId: groupId
      });

      if (res.success) {
        Toast.show(res.message || "ลบกลุ่มสำเร็จ", "success");
        await loadGroups();
      } else {
        Toast.show(res.message || "เกิดข้อผิดพลาดในการลบ", "error");
      }
    } catch (err) {
      Toast.show("เกิดข้อผิดพลาดในการส่งข้อมูล", "error");
    } finally {
      showLoading(false);
    }
  }
}

// --------------------------------------------------------------------
// Settings & Protocol Setup Modals
// --------------------------------------------------------------------

async function openSettingsModal() {
  document.getElementById("setting-gas-url").value = CONFIG.getGasApiUrl();
  document.getElementById("setting-conn-mode").value = CONFIG.getConnectionMode();
  const testStatus = document.getElementById("telegram-test-status");
  if (testStatus) testStatus.textContent = "";

  showModal("settings-modal");

  // Load Telegram bot settings if logged in as Admin
  if (Auth.isAdmin()) {
    try {
      const res = await API.call("getSettings", { token: Auth.getToken() });
      if (res.success && res.settings) {
        const tokenInput = document.getElementById("setting-telegram-token");
        if (tokenInput) tokenInput.value = res.settings.telegram_bot_token || "";
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();
  const url = document.getElementById("setting-gas-url").value.trim();
  const mode = document.getElementById("setting-conn-mode").value;
  const botToken = document.getElementById("setting-telegram-token") ? document.getElementById("setting-telegram-token").value.trim() : "";

  CONFIG.setGasApiUrl(url);
  CONFIG.setConnectionMode(mode);

  if (Auth.isAdmin()) {
    try {
      await API.call("saveSettings", {
        token: Auth.getToken(),
        settingsData: {
          telegram_bot_token: botToken
        }
      });
    } catch (err) {
      console.error("Save remote settings error:", err);
    }
  }

  Toast.show("⚙️ บันทึกการตั้งค่าเรียบร้อยแล้ว", "success");
  hideModal("settings-modal");
  
  // รีเฟรชสถานะ
  const banner = document.getElementById("demo-mode-banner");
  if (!url) {
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }
  loadSites();
}

async function handleTestTelegramBot() {
  const tokenInput = document.getElementById("setting-telegram-token");
  const statusEl = document.getElementById("telegram-test-status");
  const botToken = tokenInput ? tokenInput.value.trim() : "";

  if (!botToken) {
    if (statusEl) statusEl.innerHTML = `<span class="text-rose-500">กรุณาระบุ Token ก่อน</span>`;
    return;
  }

  if (statusEl) statusEl.innerHTML = `<span class="text-slate-400">⏳ กำลังตรวจสอบ...</span>`;

  try {
    const res = await API.call("testTelegramBot", {
      token: Auth.getToken(),
      botToken: botToken
    });

    if (res.success) {
      if (statusEl) statusEl.innerHTML = `<span class="text-emerald-600 font-semibold">✅ เชื่อมต่อสำเร็จ (@${res.bot?.username || ''})</span>`;
      Toast.show(`🤖 เชื่อมต่อบอท @${res.bot?.username || ''} สำเร็จ!`, "success");
    } else {
      if (statusEl) statusEl.innerHTML = `<span class="text-rose-500">❌ ${res.message}</span>`;
      Toast.show(res.message, "error");
    }
  } catch (err) {
    if (statusEl) statusEl.innerHTML = `<span class="text-rose-500">❌ เกิดข้อผิดพลาด</span>`;
  }
}

function openProtocolGuideModal() {
  showModal("protocol-guide-modal");
}

// --------------------------------------------------------------------
// Event Listeners & Modal Controls
// --------------------------------------------------------------------

// Step 1: Request PIN
async function handleRequestPinSubmit(e) {
  if (e) e.preventDefault();
  const username = document.getElementById("login-pin-username").value.trim();
  if (!username) {
    Toast.show("กรุณากรอกชื่อผู้ใช้งาน", "warning");
    return;
  }

  showLoading(true);
  try {
    const res = await Auth.requestPin(username);
    showLoading(false);

    if (res.success) {
      State.pinUsername = username;
      const badge = document.getElementById("verify-pin-username-badge");
      if (badge) badge.textContent = username;
      
      const pinInput = document.getElementById("login-pin-code");
      if (pinInput) pinInput.value = "";
      
      const btnVerify = document.querySelector("#login-verify-pin-form button[type='submit']");
      if (btnVerify) btnVerify.disabled = false;

      // Show Step 2
      document.getElementById("login-request-pin-form")?.classList.add("hidden");
      document.getElementById("login-verify-pin-form")?.classList.remove("hidden");
      document.getElementById("login-password-form")?.classList.add("hidden");

      startPinTimers(res.expireSeconds || 300, res.cooldownSeconds || 60);
      Toast.show(res.message || "ส่งรหัส PIN ไปยัง Telegram เรียบร้อยแล้ว", "success");
      setTimeout(() => document.getElementById("login-pin-code")?.focus(), 150);
    } else {
      Toast.show(res.message, "error");
    }
  } catch (err) {
    showLoading(false);
    Toast.show("เกิดข้อผิดพลาดในการเชื่อมต่อ", "error");
  }
}

// Step 2: Verify PIN
async function handleVerifyPinSubmit(e) {
  e.preventDefault();
  const pin = document.getElementById("login-pin-code").value.trim();
  if (pin.length !== 6) {
    Toast.show("กรุณากรอกรหัส PIN 6 หลักให้ครบถ้วน", "warning");
    return;
  }

  showLoading(true);
  try {
    const res = await Auth.loginWithPin(State.pinUsername, pin);
    showLoading(false);

    if (res.success) {
      clearPinTimers();
      Toast.show(`ยินดีต้อนรับคุณ ${res.user.displayName || res.user.username}`, "success");
      showDashboardView();
    } else {
      Toast.show(res.message, "error");
      const pinInput = document.getElementById("login-pin-code");
      if (pinInput) {
        pinInput.value = "";
        pinInput.focus();
      }
    }
  } catch (err) {
    showLoading(false);
    Toast.show("เกิดข้อผิดพลาดในการเข้าสู่ระบบ", "error");
  }
}

// Fallback: Password Login Submit
async function handleFallbackLoginSubmit(e) {
  e.preventDefault();
  const u = document.getElementById("login-fallback-username").value.trim();
  const p = document.getElementById("login-fallback-password").value;

  showLoading(true);
  const res = await Auth.login(u, p);
  showLoading(false);

  if (res.success) {
    clearPinTimers();
    Toast.show(`ยินดีต้อนรับคุณ ${res.user.displayName || res.user.username}`, "success");
    showDashboardView();
  } else {
    Toast.show(res.message, "error");
  }
}

function setupEventListeners() {
  // Login Forms & View Toggles
  document.getElementById("login-request-pin-form")?.addEventListener("submit", handleRequestPinSubmit);
  document.getElementById("login-verify-pin-form")?.addEventListener("submit", handleVerifyPinSubmit);
  document.getElementById("login-password-form")?.addEventListener("submit", handleFallbackLoginSubmit);

  document.getElementById("btn-show-password-login")?.addEventListener("click", showPasswordFallbackView);
  document.getElementById("btn-back-to-pin-login")?.addEventListener("click", showRequestPinView);
  document.getElementById("btn-back-to-request")?.addEventListener("click", showRequestPinView);
  document.getElementById("btn-resend-pin")?.addEventListener("click", () => handleRequestPinSubmit(null));

  // Test Telegram Bot
  document.getElementById("btn-test-bot")?.addEventListener("click", handleTestTelegramBot);

  // Logout Button
  const logoutBtn = document.getElementById("btn-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (confirm("คุณต้องการออกจากระบบหรือไม่?")) {
        Auth.logout();
      }
    });
  }

  // Search Input
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      State.searchTerm = e.target.value;
      renderSites();
    });
  }

  // Group Filter
  const groupSelect = document.getElementById("group-filter-select");
  if (groupSelect) {
    groupSelect.addEventListener("change", (e) => {
      State.selectedGroup = e.target.value;
      renderSites();
    });
  }

  // View Mode Toggles
  const btnGridView = document.getElementById("btn-view-grid");
  const btnTableView = document.getElementById("btn-view-table");

  if (btnGridView && btnTableView) {
    btnGridView.addEventListener("click", () => {
      State.viewMode = "grid";
      localStorage.setItem("rdp_view_mode", "grid");
      btnGridView.classList.add("bg-blue-600", "text-white");
      btnGridView.classList.remove("text-slate-400");
      btnTableView.classList.remove("bg-blue-600", "text-white");
      btnTableView.classList.add("text-slate-400");
      renderSites();
    });

    btnTableView.addEventListener("click", () => {
      State.viewMode = "table";
      localStorage.setItem("rdp_view_mode", "table");
      btnTableView.classList.add("bg-blue-600", "text-white");
      btnTableView.classList.remove("text-slate-400");
      btnGridView.classList.remove("bg-blue-600", "text-white");
      btnGridView.classList.add("text-slate-400");
      renderSites();
    });
  }

  // Forms
  document.getElementById("site-form")?.addEventListener("submit", handleSiteSubmit);
  document.getElementById("user-form")?.addEventListener("submit", handleUserSubmit);
  document.getElementById("group-form")?.addEventListener("submit", handleGroupSubmit);
  document.getElementById("settings-form")?.addEventListener("submit", handleSaveSettings);
}

function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove("hidden");
  requestAnimationFrame(() => modal.classList.add("modal-open"));
}

function hideModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove("modal-open");
  setTimeout(() => modal.classList.add("hidden"), 200);
}

function showLoading(show) {
  State.isLoading = show;
  const loader = document.getElementById("global-loader");
  if (!loader) return;
  if (show) {
    loader.classList.remove("hidden");
  } else {
    loader.classList.add("hidden");
  }
}
