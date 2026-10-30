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
  editingSiteMachines: [],
  editingGroupId: null,
  editingUserId: null,
  isLoading: false,
  // PIN Login State
  pinUsername: "",
  pinExpireInterval: null,
  pinCooldownInterval: null,
  // Online Presence State
  onlineUsers: [],
  heartbeatInterval: null
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

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ฟังก์ชันกู้คืนข้อความกรณีพบ Mojibake (Latin-1 UTF-8 byte decode)
function fixMojibake(str) {
  if (!str) return "";
  const s = String(str);
  // หากมีอักขระในช่วง Latin-1 Supplement ที่เกิดจากการแปลง UTF-8 bytes ผิดพลาด
  if (/[\u00C0-\u00FF]/.test(s)) {
    try {
      const bytes = new Uint8Array([...s].map(c => c.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return decoded;
    } catch(e) {
      return s;
    }
  }
  return s;
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
  stopPresenceHeartbeat();
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
    document.getElementById("user-display-name").textContent = fixMojibake(user.displayName || user.username);
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
  startPresenceHeartbeat();
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
      if (res.online_users) {
        updateOnlineUsers(res.online_users);
      }
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
  const term = State.searchTerm.toLowerCase().trim();

  const filtered = State.sites.filter(site => {
    const matchesSite = 
      site.site_name.toLowerCase().includes(term) ||
      (site.description && site.description.toLowerCase().includes(term)) ||
      (site.group_name && site.group_name.toLowerCase().includes(term));

    const matchesMachine = (site.machines || []).some(m => 
      (m.machine_name && m.machine_name.toLowerCase().includes(term)) ||
      (m.ip_address && m.ip_address.toLowerCase().includes(term)) ||
      (m.username && m.username.toLowerCase().includes(term)) ||
      (m.note && m.note.toLowerCase().includes(term))
    );

    const matchesSearch = !term || matchesSite || matchesMachine;
    const matchesGroup = State.selectedGroup === "ALL" || site.group_name === State.selectedGroup;

    return matchesSearch && matchesGroup;
  });

  const totalMachines = filtered.reduce((sum, s) => sum + (s.machines ? s.machines.length : 1), 0);
  document.getElementById("sites-count-badge").textContent = `${filtered.length} ไซต์ (${totalMachines} เครื่อง)`;

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
    container.innerHTML = filtered.map(site => {
      const machines = (site.machines && site.machines.length > 0) ? site.machines : [
        {
          machine_id: "MCH-1",
          machine_name: "เครื่องหลัก",
          ip_address: site.ip_address,
          port: site.port || 3389,
          username: site.username,
          password: site.password,
          note: ""
        }
      ];

      return `
      <div class="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between group">
        <div class="p-5">
          <!-- Card Header -->
          <div class="flex items-start justify-between gap-3 mb-2.5">
            <div>
              <div class="flex items-center space-x-1.5 mb-1.5">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  ${site.group_name || 'General'}
                </span>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                  🖥️ ${machines.length} เครื่อง
                </span>
              </div>
              <h3 class="text-base font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                ${site.site_name}
              </h3>
            </div>
            
            ${isAdmin ? `
              <div class="flex items-center space-x-1">
                <button onclick="openSiteModal('${site.site_id}')" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="แก้ไขไซต์">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                </button>
                <button onclick="confirmDeleteSite('${site.site_id}', '${site.site_name}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" title="ลบไซต์">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>
            ` : ''}
          </div>

          <!-- Description if exists -->
          ${site.description ? `<p class="text-xs text-slate-500 mb-3 line-clamp-2">${site.description}</p>` : ''}

          <!-- Machines List inside Card (Option 1: Stacked with 1-Click Remote per machine) -->
          <div class="space-y-2.5 max-h-80 overflow-y-auto pr-0.5">
            ${machines.map(m => {
              const activeUser = getActiveRemoteForMachine(site.site_id, m.machine_id);
              return `
              <div class="bg-slate-50/90 hover:bg-blue-50/40 p-3 rounded-xl border ${activeUser ? 'border-amber-300 bg-amber-50/30 ring-1 ring-amber-300/50' : 'border-slate-200/80 hover:border-blue-200'} transition-all flex flex-col justify-between">
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="font-bold text-xs text-slate-800 flex items-center">
                      <span class="w-2 h-2 rounded-full ${activeUser ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'} mr-1.5"></span>
                      ${escapeHtml(m.machine_name)}
                    </span>
                    ${m.note ? `<span class="text-[10px] text-slate-400 truncate max-w-[120px] bg-white px-1.5 py-0.5 rounded border border-slate-100" title="${escapeHtml(m.note)}">${escapeHtml(m.note)}</span>` : ''}
                  </div>

                  ${activeUser ? `
                    <div class="mb-2 flex items-center px-2 py-1 rounded-lg text-[11px] font-semibold bg-amber-100/90 text-amber-900 border border-amber-300">
                      <span class="w-2 h-2 rounded-full bg-amber-500 mr-1.5 animate-pulse"></span>
                      <span class="truncate">👤 กำลังเชื่อมต่อ: ${escapeHtml(fixMojibake(activeUser.display_name || activeUser.username))}</span>
                    </div>
                  ` : ''}

                  <div class="space-y-1 text-xs font-mono">
                    <div class="flex items-center justify-between">
                      <span class="text-slate-400 font-sans text-[11px]">IP:</span>
                      <div class="flex items-center space-x-1">
                        <span class="font-semibold text-slate-700">${m.ip_address}:${m.port || 3389}</span>
                        <button onclick="copyToClipboard('${m.ip_address}:${m.port || 3389}', 'คัดลอก IP')" class="text-slate-400 hover:text-slate-700 p-0.5" title="คัดลอก IP">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        </button>
                      </div>
                    </div>

                    <div class="flex items-center justify-between">
                      <span class="text-slate-400 font-sans text-[11px]">User:</span>
                      <div class="flex items-center space-x-1">
                        <span class="text-slate-700">${escapeHtml(m.username)}</span>
                        <button onclick="copyToClipboard('${m.username}', 'คัดลอก Username')" class="text-slate-400 hover:text-slate-700 p-0.5" title="คัดลอก Username">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 1-Click Remote for this Machine -->
                <button onclick="triggerRemote('${site.site_id}', '${m.machine_id}')" class="btn-remote-pulse mt-2.5 w-full py-1.5 px-3 bg-gradient-to-r ${activeUser ? 'from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700' : 'from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'} text-white text-xs font-semibold rounded-lg shadow-2xs active:scale-[0.98] transition-all flex items-center justify-center space-x-1.5" ${activeUser ? `title="มีผู้ใช้กำลังใช้งานเครื่องนี้ (${escapeHtml(fixMojibake(activeUser.display_name || activeUser.username))}) คุณยังคงสามารถเชื่อมต่อได้"` : ''}>
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  <span>Remote (${escapeHtml(m.machine_name)})</span>
                </button>
              </div>
            `;
            }).join("")}
          </div>
        </div>
      </div>
      `;
    }).join("");
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
              <th class="px-5 py-3.5">รายการเครื่องในไซต์</th>
              <th class="px-5 py-3.5 text-right">จัดการไซต์</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${filtered.map(site => {
              const machines = (site.machines && site.machines.length > 0) ? site.machines : [
                {
                  machine_id: "MCH-1",
                  machine_name: "เครื่องหลัก",
                  ip_address: site.ip_address,
                  port: site.port || 3389,
                  username: site.username,
                  password: site.password,
                  note: ""
                }
              ];

              return `
              <tr class="hover:bg-slate-50/70 transition-colors">
                <td class="px-5 py-4 align-top">
                  <div class="font-bold text-slate-800">${escapeHtml(site.site_name)}</div>
                  <div class="text-xs text-blue-600 font-semibold mt-0.5">🖥️ ${machines.length} เครื่อง</div>
                  ${site.description ? `<div class="text-xs text-slate-400 mt-0.5">${escapeHtml(site.description)}</div>` : ''}
                </td>
                <td class="px-5 py-4 align-top">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    ${escapeHtml(site.group_name || 'General')}
                  </span>
                </td>
                <td class="px-5 py-4">
                  <div class="space-y-2">
                    ${machines.map(m => {
                      const activeUser = getActiveRemoteForMachine(site.site_id, m.machine_id);
                      return `
                      <div class="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-xl ${activeUser ? 'bg-amber-50/60 border-amber-300 ring-1 ring-amber-300/40' : 'bg-slate-50 border-slate-200/80'} border gap-2 text-xs">
                        <div>
                          <div class="flex items-center space-x-1.5 flex-wrap">
                            <span class="font-bold text-slate-800">${escapeHtml(m.machine_name)}</span>
                            ${m.note ? `<span class="text-[11px] text-slate-400">(${escapeHtml(m.note)})</span>` : ''}
                            ${activeUser ? `
                              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                                <span class="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1 animate-pulse"></span>
                                <span>👤 กำลังเชื่อมต่อ: ${escapeHtml(fixMojibake(activeUser.display_name || activeUser.username))}</span>
                              </span>
                            ` : ''}
                          </div>
                          <div class="font-mono text-slate-600 text-[11px] flex items-center space-x-1.5 mt-0.5">
                            <span>${m.ip_address}:${m.port || 3389}</span>
                            <button onclick="copyToClipboard('${m.ip_address}:${m.port || 3389}', 'คัดลอก IP')" class="text-slate-400 hover:text-slate-700">
                              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            </button>
                            <span class="text-slate-300">|</span>
                            <span>${escapeHtml(m.username)}</span>
                            <button onclick="copyToClipboard('${m.username}', 'คัดลอก Username')" class="text-slate-400 hover:text-slate-700">
                              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                            </button>
                          </div>
                        </div>
                        <button onclick="triggerRemote('${site.site_id}', '${m.machine_id}')" class="btn-remote-pulse inline-flex items-center px-3 py-1.5 ${activeUser ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'} text-white text-xs font-semibold rounded-lg shadow-2xs whitespace-nowrap self-start sm:self-auto" ${activeUser ? `title="มีผู้ใช้กำลังใช้งานเครื่องนี้ (${escapeHtml(fixMojibake(activeUser.display_name || activeUser.username))})"` : ''}>
                          <svg class="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                          Remote
                        </button>
                      </div>
                    `;
                    }).join("")}
                  </div>
                </td>
                <td class="px-5 py-4 text-right whitespace-nowrap align-top">
                  ${isAdmin ? `
                    <div class="flex items-center justify-end space-x-1">
                      <button onclick="openSiteModal('${site.site_id}')" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="แก้ไขไซต์">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                      </button>
                      <button onclick="confirmDeleteSite('${site.site_id}', '${site.site_name}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="ลบไซต์">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    </div>
                  ` : ''}
                </td>
              </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }
}

// --------------------------------------------------------------------
// Real-time Presence & Heartbeat Management
// --------------------------------------------------------------------

function formatActiveRemoteLabel(ar) {
  if (!ar) return "";
  const siteObj = (State.sites || []).find(s => String(s.site_id) === String(ar.siteId));
  const sName = fixMojibake((ar.siteName || siteObj?.site_name || "").trim());
  const mName = fixMojibake((ar.machineName || "").trim());

  if (sName && mName) {
    return sName.toLowerCase() === mName.toLowerCase() ? sName : `${sName}/${mName}`;
  }
  return sName || mName || "เครื่องรีโมต";
}

function getActiveRemoteForMachine(siteId, machineId) {
  if (!State.onlineUsers || State.onlineUsers.length === 0) return null;
  const now = Date.now();
  for (const u of State.onlineUsers) {
    if (u.active_remote) {
      const ar = u.active_remote;
      const matchSite = String(ar.siteId) === String(siteId);
      const matchMachine = !machineId || !ar.machineId || String(ar.machineId) === String(machineId);
      // นับว่า active หากไม่เกิน 30 นาที
      if (matchSite && matchMachine && (now - ar.connectedAt <= 30 * 60 * 1000)) {
        return u;
      }
    }
  }
  return null;
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  // ส่ง heartbeat ทุก 45 วินาที
  State.heartbeatInterval = setInterval(sendPresenceHeartbeat, 45000);
}

function stopPresenceHeartbeat() {
  if (State.heartbeatInterval) {
    clearInterval(State.heartbeatInterval);
    State.heartbeatInterval = null;
  }
}

async function sendPresenceHeartbeat() {
  if (!Auth.isLoggedIn()) return;
  try {
    const res = await API.call("heartbeat", { token: Auth.getToken() });
    if (res.success && res.online_users) {
      updateOnlineUsers(res.online_users);
    }
  } catch (err) {
    console.error("Presence heartbeat error:", err);
  }
}

function updateOnlineUsers(users) {
  State.onlineUsers = Array.isArray(users) ? users : [];
  renderOnlineUsersUI();
  if (State.sites && State.sites.length > 0 && !State.isLoading) {
    renderSites();
  }
}

function renderOnlineUsersUI() {
  const users = State.onlineUsers || [];
  const count = users.length;
  
  // 1. Update Count Badges
  const countEl = document.getElementById("online-users-count");
  if (countEl) countEl.textContent = count;

  const popoverCountEl = document.getElementById("online-users-popover-count");
  if (popoverCountEl) popoverCountEl.textContent = `${count} คน`;

  // 2. Render Popover List
  const listEl = document.getElementById("online-users-list");
  if (listEl) {
    if (count === 0) {
      listEl.innerHTML = `<div class="p-4 text-center text-xs text-slate-400">ยังไม่มีผู้ใช้งานออนไลน์</div>`;
    } else {
      const currentUserId = Auth.getUser()?.userId;
      const currentUsername = Auth.getUser()?.username;

      listEl.innerHTML = users.map(u => {
        const isSelf = (currentUserId && String(u.user_id) === String(currentUserId)) ||
                       (currentUsername && u.username && currentUsername.toLowerCase() === u.username.toLowerCase());
        const roleLabel = u.role === "admin" ? "Admin" : "User";
        const roleClass = u.role === "admin" ? "bg-purple-100 text-purple-700 border-purple-200" : "bg-slate-100 text-slate-600 border-slate-200";

        const rawDisplayName = fixMojibake(u.display_name || u.username || "");
        const rawUsername = fixMojibake(u.username || "");

        let remoteBadge = "";
        if (u.active_remote) {
          const ar = u.active_remote;
          const label = formatActiveRemoteLabel(ar);
          remoteBadge = `
            <div class="mt-1 flex items-center space-x-1 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/80" title="กำลัง Remote: ${escapeHtml(label)}">
              <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
              <span class="font-medium truncate max-w-[220px]">🖥️ กำลัง Remote: ${escapeHtml(label)}</span>
            </div>
          `;
        }

        return `
          <div class="p-2.5 hover:bg-slate-50 transition-colors flex items-start space-x-2.5 rounded-xl">
            <div class="relative shrink-0 mt-0.5">
              <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                ${escapeHtml((rawDisplayName || rawUsername || "U").charAt(0).toUpperCase())}
              </div>
              <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"></span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-800 truncate">
                  ${escapeHtml(rawDisplayName)}
                  ${isSelf ? '<span class="text-[10px] text-blue-600 bg-blue-50 px-1 py-0.2 rounded font-normal ml-1">(คุณ)</span>' : ''}
                </span>
                <span class="text-[10px] px-1.5 py-0.2 rounded-full font-semibold border ${roleClass}">
                  ${roleLabel}
                </span>
              </div>
              <div class="text-[10px] text-slate-400 font-mono">@${escapeHtml(rawUsername)}</div>
              ${remoteBadge}
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // 3. Update Users Table if modal is open
  const usersModal = document.getElementById("users-modal");
  if (usersModal && !usersModal.classList.contains("hidden")) {
    renderUsersTable();
  }
}

function toggleOnlineUsersPopover(e) {
  if (e) e.stopPropagation();
  const popover = document.getElementById("online-users-popover");
  if (!popover) return;
  const isHidden = popover.classList.contains("hidden");
  if (isHidden) {
    popover.classList.remove("hidden");
  } else {
    popover.classList.add("hidden");
  }
}

// ปิด Popover เมื่อคลิกพื้นที่อื่น
document.addEventListener("click", (e) => {
  const container = document.getElementById("online-users-container");
  const popover = document.getElementById("online-users-popover");
  if (container && popover && !container.contains(e.target)) {
    popover.classList.add("hidden");
  }
});

function triggerRemote(siteId, machineId = null) {
  const site = State.sites.find(s => s.site_id === siteId);
  if (!site) return;
  const machine = (site.machines && site.machines.length > 0)
    ? (site.machines.find(m => m.machine_id === machineId) || site.machines[0])
    : null;
  RdpLauncher.connect(site, machine);
}

// --------------------------------------------------------------------
// Modals & Forms
// --------------------------------------------------------------------

function openSiteModal(siteId = null) {
  State.editingSiteId = siteId;
  const form = document.getElementById("site-form");
  if (form) form.reset();

  const titleEl = document.getElementById("site-modal-title");

  if (siteId) {
    titleEl.textContent = "แก้ไขข้อมูลไซต์งาน";
    const site = State.sites.find(s => s.site_id === siteId);
    if (site) {
      document.getElementById("form-site-name").value = site.site_name || "";
      populateSiteGroupDropdown(site.group_name || "");
      document.getElementById("form-site-desc").value = site.description || "";
      
      // Load machines
      if (Array.isArray(site.machines) && site.machines.length > 0) {
        State.editingSiteMachines = JSON.parse(JSON.stringify(site.machines));
      } else {
        State.editingSiteMachines = [
          {
            machine_id: "MCH-1",
            machine_name: "เครื่องหลัก",
            ip_address: site.ip_address || "",
            port: site.port || 3389,
            username: site.username || "",
            password: site.password || "",
            note: ""
          }
        ];
      }
    }
  } else {
    titleEl.textContent = "เพิ่มไซต์งานใหม่";
    populateSiteGroupDropdown(State.groups.length > 0 ? State.groups[0].group_name : "");
    document.getElementById("form-site-name").value = "";
    document.getElementById("form-site-desc").value = "";
    State.editingSiteMachines = [
      {
        machine_id: "MCH-" + Date.now(),
        machine_name: "เครื่องหลัก",
        ip_address: "",
        port: 3389,
        username: "Administrator",
        password: "",
        note: ""
      }
    ];
  }

  renderMachineFormRows();
  showModal("site-modal");
}

function syncMachineFormValuesFromDom() {
  const container = document.getElementById("machines-form-container");
  if (!container) return;

  const rows = container.querySelectorAll(".machine-form-row");
  rows.forEach((row, idx) => {
    if (State.editingSiteMachines[idx]) {
      const nameInput = row.querySelector(".mch-name");
      const ipInput = row.querySelector(".mch-ip");
      const portInput = row.querySelector(".mch-port");
      const userInput = row.querySelector(".mch-user");
      const passInput = row.querySelector(".mch-pass");
      const noteInput = row.querySelector(".mch-note");

      if (nameInput) State.editingSiteMachines[idx].machine_name = nameInput.value.trim();
      if (ipInput) State.editingSiteMachines[idx].ip_address = ipInput.value.trim();
      if (portInput) State.editingSiteMachines[idx].port = parseInt(portInput.value.trim(), 10) || 3389;
      if (userInput) State.editingSiteMachines[idx].username = userInput.value.trim();
      if (passInput && passInput.value) State.editingSiteMachines[idx].password = passInput.value;
      if (noteInput) State.editingSiteMachines[idx].note = noteInput.value.trim();
    }
  });
}

function renderMachineFormRows() {
  const container = document.getElementById("machines-form-container");
  if (!container) return;

  const countBadge = document.getElementById("form-machines-count-badge");
  if (countBadge) {
    countBadge.textContent = `${State.editingSiteMachines.length} เครื่อง`;
  }

  container.innerHTML = State.editingSiteMachines.map((m, idx) => `
    <div class="machine-form-row bg-slate-50 p-3.5 rounded-2xl border border-slate-200 transition-all" data-index="${idx}">
      
      <!-- Row Header -->
      <div class="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-200/80">
        <div class="flex items-center space-x-2">
          <span class="w-5 h-5 rounded-md bg-blue-600 text-white font-bold flex items-center justify-center text-[10px] shrink-0">
            ${idx + 1}
          </span>
          <span class="text-xs font-bold text-slate-700">เครื่องที่ ${idx + 1}</span>
          <span class="text-[10px] font-mono text-slate-400">(${m.machine_id || 'NEW'})</span>
        </div>

        <div class="flex items-center space-x-1.5">
          ${State.editingSiteMachines.length > 1 ? `
            <button type="button" onclick="removeMachineFormRow(${idx})" class="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors" title="ลบเครื่องนี้">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          ` : `
            <span class="text-[10px] text-slate-400 italic">เครื่องหลัก</span>
          `}
        </div>
      </div>

      <!-- Input Grid -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-2.5 text-xs">
        
        <!-- ชื่อเครื่อง / หน้าที่ -->
        <div class="md:col-span-4">
          <label class="block text-[11px] font-semibold text-slate-600 mb-0.5">ชื่อเครื่อง / หน้าที่ <span class="text-rose-500">*</span></label>
          <input type="text" required placeholder="เช่น App Server, DB Server, POS-01" value="${escapeHtml(m.machine_name || '')}" class="mch-name w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
        </div>

        <!-- IP Address / Domain -->
        <div class="md:col-span-5">
          <label class="block text-[11px] font-semibold text-slate-600 mb-0.5">IP Address หรือ Domain <span class="text-rose-500">*</span></label>
          <input type="text" required placeholder="เช่น 192.168.1.10" value="${escapeHtml(m.ip_address || '')}" class="mch-ip w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono">
        </div>

        <!-- Port -->
        <div class="md:col-span-3">
          <label class="block text-[11px] font-semibold text-slate-600 mb-0.5">Port <span class="text-rose-500">*</span></label>
          <input type="number" required value="${m.port || 3389}" class="mch-port w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono">
        </div>

        <!-- Username -->
        <div class="md:col-span-4">
          <label class="block text-[11px] font-semibold text-slate-600 mb-0.5">Username RDP <span class="text-rose-500">*</span></label>
          <input type="text" required placeholder="Administrator" value="${escapeHtml(m.username || '')}" class="mch-user w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono">
        </div>

        <!-- Password -->
        <div class="md:col-span-4">
          <label class="block text-[11px] font-semibold text-slate-600 mb-0.5">Password RDP</label>
          <input type="password" placeholder="${m.password ? '•••••••• (คงเดิม)' : 'ระบุรหัสผ่าน'}" value="" class="mch-pass w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-mono">
        </div>

        <!-- หมายเหตุเครื่อง -->
        <div class="md:col-span-4">
          <label class="block text-[11px] font-semibold text-slate-600 mb-0.5">หมายเหตุเครื่อง</label>
          <input type="text" placeholder="เช่น SQL Server, สำรอง" value="${escapeHtml(m.note || '')}" class="mch-note w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500">
        </div>

      </div>

    </div>
  `).join("");
}

function escapeHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function addMachineFormRow(prefill = null) {
  syncMachineFormValuesFromDom();
  const nextNum = State.editingSiteMachines.length + 1;
  const newMachine = prefill ? { ...prefill, machine_id: "MCH-" + Date.now() } : {
    machine_id: "MCH-" + Date.now(),
    machine_name: `เครื่องที่ ${nextNum}`,
    ip_address: "",
    port: 3389,
    username: "Administrator",
    password: "",
    note: ""
  };
  State.editingSiteMachines.push(newMachine);
  renderMachineFormRows();
  
  // Scroll to bottom
  const container = document.getElementById("machines-form-container");
  if (container && container.lastElementChild) {
    container.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function duplicateLastMachineRow() {
  syncMachineFormValuesFromDom();
  if (State.editingSiteMachines.length === 0) {
    addMachineFormRow();
    return;
  }
  const last = State.editingSiteMachines[State.editingSiteMachines.length - 1];
  const nextNum = State.editingSiteMachines.length + 1;
  const cloned = {
    machine_id: "MCH-" + Date.now(),
    machine_name: `เครื่องที่ ${nextNum}`,
    ip_address: last.ip_address || "",
    port: last.port || 3389,
    username: last.username || "Administrator",
    password: last.password || "",
    note: last.note || ""
  };
  State.editingSiteMachines.push(cloned);
  renderMachineFormRows();
  Toast.show("📋 คัดลอกข้อมูลเครื่องล่าสุดเรียบร้อย", "info", 1500);

  const container = document.getElementById("machines-form-container");
  if (container && container.lastElementChild) {
    container.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function removeMachineFormRow(index) {
  if (State.editingSiteMachines.length <= 1) {
    Toast.show("ไซต์งานต้องมีอย่างน้อย 1 เครื่อง", "warning");
    return;
  }
  syncMachineFormValuesFromDom();
  State.editingSiteMachines.splice(index, 1);
  renderMachineFormRows();
}

async function handleSiteSubmit(e) {
  e.preventDefault();
  syncMachineFormValuesFromDom();

  const siteName = document.getElementById("form-site-name").value.trim();
  const groupName = document.getElementById("form-site-group").value.trim();
  const desc = document.getElementById("form-site-desc").value.trim();

  if (!siteName || !groupName) {
    Toast.show("กรุณาระบุชื่อไซต์งานและเลือกกลุ่มงาน", "warning");
    return;
  }

  if (State.editingSiteMachines.length === 0) {
    Toast.show("กรุณาระบุข้อมูลอย่างน้อย 1 เครื่อง", "warning");
    return;
  }

  // Validate each machine
  for (let i = 0; i < State.editingSiteMachines.length; i++) {
    const m = State.editingSiteMachines[i];
    if (!m.machine_name || !m.ip_address || !m.username) {
      Toast.show(`กรุณากรอกชื่อเครื่อง, IP Address และ Username ของเครื่องที่ ${i + 1} ให้ครบถ้วน`, "warning");
      return;
    }
  }

  const siteData = {
    site_id: State.editingSiteId,
    site_name: siteName,
    group_name: groupName,
    description: desc,
    machines: State.editingSiteMachines
  };

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
      if (res.online_users) {
        updateOnlineUsers(res.online_users);
      }
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
  const currentUsername = Auth.getUser()?.username;

  container.innerHTML = State.users.map(u => {
    const isSelf = (currentUserId && String(u.user_id) === String(currentUserId)) ||
                   (currentUsername && u.username && currentUsername.toLowerCase() === u.username.toLowerCase());
    const onlineUserObj = (State.onlineUsers || []).find(ou => 
      String(ou.user_id) === String(u.user_id) || 
      (ou.username && u.username && ou.username.toLowerCase() === u.username.toLowerCase())
    );
    const isOnline = Boolean(onlineUserObj);
    const activeRemote = onlineUserObj?.active_remote;

    const permText = u.role === "admin" || (u.allowed_sites && u.allowed_sites.includes("*"))
      ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">เห็นทุกไซต์งาน (All)</span>`
      : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">${u.allowed_sites.length} ไซต์</span>`;

    return `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-3 py-2.5 text-center whitespace-nowrap">
          ${isOnline 
            ? `<div>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse"></span>ออนไลน์
                </span>
                ${activeRemote ? `
                  <div class="mt-1 text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 truncate max-w-[150px] mx-auto font-medium" title="กำลัง Remote: ${escapeHtml(formatActiveRemoteLabel(activeRemote))}">
                    🖥️ ${escapeHtml(formatActiveRemoteLabel(activeRemote))}
                  </div>
                ` : ''}
               </div>`
            : `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-normal text-slate-400 bg-slate-50 border border-slate-200">
                <span class="w-1.5 h-1.5 rounded-full bg-slate-300 mr-1"></span>ออฟไลน์
               </span>`
          }
        </td>
        <td class="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">
          ${escapeHtml(fixMojibake(u.username))}
          ${isSelf ? '<span class="ml-1 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-normal">(คุณ)</span>' : ''}
        </td>
        <td class="px-3 py-2.5 text-slate-600 text-xs">${escapeHtml(fixMojibake(u.display_name)) || '-'}</td>
        <td class="px-3 py-2.5 whitespace-nowrap">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'}">
            ${u.role}
          </span>
        </td>
        <td class="px-3 py-2.5 whitespace-nowrap">
          ${u.telegram_chat_id 
            ? `<span class="inline-flex items-center space-x-1 font-mono text-[11px] text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                <span>✈️</span><span>${u.telegram_chat_id}</span>
               </span>`
            : `<span class="text-slate-400 text-[11px] italic">ยังไม่ระบุ</span>`}
        </td>
        <td class="px-3 py-2.5 whitespace-nowrap">${permText}</td>
        <td class="px-3 py-2.5 text-right space-x-1.5 whitespace-nowrap">
          <button onclick="editUser('${u.user_id}')" class="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors" title="แก้ไขข้อมูล">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
            <span>แก้ไข</span>
          </button>
          ${!isSelf ? `
            <button onclick="confirmDeleteUser('${u.user_id}', '${u.username}')" class="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors" title="ลบผู้ใช้">
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
  document.getElementById("user-form-title").textContent = `✏️ แก้ไขผู้ใช้: ${fixMojibake(user.username)}`;
  document.getElementById("user-form-username").value = fixMojibake(user.username);
  document.getElementById("user-form-display").value = fixMojibake(user.display_name || "");
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
  const shareDrivesCheckbox = document.getElementById("setting-share-drives");
  if (shareDrivesCheckbox) shareDrivesCheckbox.checked = CONFIG.getShareDrives();
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
  const shareDrivesCheckbox = document.getElementById("setting-share-drives");
  const shareDrives = shareDrivesCheckbox ? shareDrivesCheckbox.checked : true;
  const botToken = document.getElementById("setting-telegram-token") ? document.getElementById("setting-telegram-token").value.trim() : "";

  CONFIG.setGasApiUrl(url);
  CONFIG.setConnectionMode(mode);
  CONFIG.setShareDrives(shareDrives);

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

function openProtocolGuideModal(defaultTab = "setup") {
  switchProtocolModalTab(defaultTab);
  showModal("protocol-guide-modal");
}

function switchProtocolModalTab(tab) {
  const tabSetup = document.getElementById("protocol-tab-setup");
  const tabTrouble = document.getElementById("protocol-tab-troubleshoot");
  const panelSetup = document.getElementById("protocol-panel-setup");
  const panelTrouble = document.getElementById("protocol-panel-troubleshoot");

  if (!tabSetup || !tabTrouble || !panelSetup || !panelTrouble) return;

  if (tab === "troubleshoot") {
    panelSetup.classList.add("hidden");
    panelTrouble.classList.remove("hidden");
    tabSetup.className = "px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-all";
    tabTrouble.className = "px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 border-amber-600 text-amber-800 bg-white transition-all";
  } else {
    panelTrouble.classList.add("hidden");
    panelSetup.classList.remove("hidden");
    tabTrouble.className = "px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-all";
    tabSetup.className = "px-3.5 py-2 text-xs font-bold rounded-t-xl border-b-2 border-blue-600 text-blue-700 bg-white transition-all";
  }
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
