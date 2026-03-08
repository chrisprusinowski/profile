/* MeritCycle — Auth / session helper
   Include on EVERY page EXCEPT login.html, AFTER store.js.
   Runs an immediate check: if no active session → redirect to login. */

const Auth = (() => {

  // ── Immediate session guard ────────────────────────────────────
  // (runs before DOM loads — no DOM access needed)
  (function guard() {
    const isLogin = window.location.pathname.endsWith('login.html');
    if (isLogin) return;
    // Re-sync session in case admin updated the user's role
    Store.refreshSession();
    if (!Store.getCurrentUser()) {
      window.location.replace('login.html');
    }
  })();

  let _previewRole = null;

  // ── Getters ────────────────────────────────────────────────────
  function getUser()        { return Store.getCurrentUser(); }
  function isAdmin()        { return getUser()?.role === 'admin'; }
  function isManager()      { return getUser()?.role === 'manager'; }
  function isExec()         { return getUser()?.role === 'exec'; }
  function getEffectiveRole() { return _previewRole || getUser()?.role || 'admin'; }

  // ── Guards ─────────────────────────────────────────────────────
  function requireAdmin() {
    if (!isAdmin()) {
      window.location.replace('login.html?reason=unauthorized');
      throw new Error('Admin access required');
    }
  }

  // ── Permission check ───────────────────────────────────────────
  // Returns true if the current user is allowed to perform `action`
  function can(action) {
    const role = getUser()?.role;
    if (!role) return false;
    const PERMS = {
      importCSV:       ['admin'],
      manageUsers:     ['admin'],
      viewSettings:    ['admin'],
      editRec:         ['admin', 'manager'],
      submitRec:       ['admin', 'manager'],
      viewExecutive:   ['admin', 'exec'],
      viewAllSalaries: ['admin', 'exec'],
    };
    if (!PERMS[action]) return true; // undefined permission = allow
    return PERMS[action].includes(role);
  }

  // ── Preview mode (admin only) ──────────────────────────────────
  function setPreviewRole(role) {
    _previewRole = role || null;
    document.body.setAttribute('data-role', getEffectiveRole());
  }

  // ── Apply user to the page UI ──────────────────────────────────
  // Call once after DOMContentLoaded. Updates sidebar, data-role, nav visibility.
  function applyUI() {
    const user = getUser();
    if (!user) return;

    document.body.setAttribute('data-role', getEffectiveRole());

    // Sidebar avatar + name + role
    const avatarEl = document.getElementById('sidebar-avatar');
    const nameEl   = document.getElementById('sidebar-user-name');
    const roleEl   = document.getElementById('sidebar-user-role');

    if (avatarEl) {
      avatarEl.textContent   = user.initials || '?';
      avatarEl.style.background = user.avatarColor || '#4F46E5';
    }
    if (nameEl) nameEl.textContent = user.name || 'Unknown';
    if (roleEl) {
      const LABELS = { admin: 'Admin', manager: 'Manager', exec: 'Executive' };
      roleEl.textContent = LABELS[user.role] || user.role;
    }

    // Show admin-only preview toggle
    const previewRow = document.getElementById('admin-preview-row');
    if (previewRow) previewRow.style.display = user.role === 'admin' ? '' : 'none';

    // Hide nav items that require a higher role
    document.querySelectorAll('[data-admin-only]').forEach(el => {
      el.style.display = user.role === 'admin' ? '' : 'none';
    });
    document.querySelectorAll('[data-exec-plus]').forEach(el => {
      el.style.display = (user.role === 'admin' || user.role === 'exec') ? '' : 'none';
    });
  }

  // ── Logout ─────────────────────────────────────────────────────
  function logout() {
    Store.logout();
    window.location.replace('login.html');
  }

  return {
    getUser, isAdmin, isManager, isExec, getEffectiveRole,
    requireAdmin, can, setPreviewRole, applyUI, logout,
  };
})();
