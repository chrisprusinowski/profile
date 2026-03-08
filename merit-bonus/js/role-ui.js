(function () {
  const PAGE_ACCESS = {
    'index.html': ['hr', 'manager', 'exec'],
    'employees.html': ['hr', 'manager'],
    'merit.html': ['hr', 'manager'],
    'import.html': ['hr'],
    'admin.html': ['hr'],
    'executive.html': ['hr', 'exec'],
  };

  const DEFAULT_PAGE = { hr: 'index.html', manager: 'merit.html', exec: 'executive.html' };

  function pageName() {
    const name = window.location.pathname.split('/').pop();
    return name || 'index.html';
  }

  function allowed(role) {
    return (PAGE_ACCESS[pageName()] || ['hr', 'manager', 'exec']).includes(role);
  }

  function syncRoleSelect() {
    const select = document.querySelector('.role-switcher select');
    if (!select) return;
    const role = Store.getCurrentRole();
    const users = Store.getUsersByRole(role);
    const active = Store.getCurrentUser();

    select.value = role;

    if (!document.getElementById('viewing-as-user')) {
      const badge = document.createElement('div');
      badge.id = 'viewing-as-user';
      badge.style.cssText = 'margin-top:8px; font-size:12px; color:#dbeafe;';
      select.parentElement.appendChild(badge);
    }

    document.getElementById('viewing-as-user').textContent = active
      ? `${active.name} · ${active.title}`
      : `${role.toUpperCase()} role`;

    if (!users.length) return;
  }

  function enforcePageAccess() {
    const role = Store.getCurrentRole();
    if (allowed(role)) return;
    window.location.href = DEFAULT_PAGE[role] || 'index.html';
  }

  function applyNavAccess() {
    const role = Store.getCurrentRole();
    document.querySelectorAll('.sidebar-nav a[href]').forEach((link) => {
      const name = link.getAttribute('href');
      const ok = (PAGE_ACCESS[name] || ['hr', 'manager', 'exec']).includes(role);
      link.style.display = ok ? '' : 'none';
    });
  }

  function bindRoleChange() {
    const select = document.querySelector('.role-switcher select');
    if (!select || select.dataset.roleBound) return;
    select.dataset.roleBound = '1';

    select.addEventListener('change', function () {
      Store.setCurrentRole(this.value);
      const firstUser = Store.getUsersByRole(this.value)[0];
      if (firstUser) Store.setCurrentUser(firstUser.id);
      document.body.setAttribute('data-role', this.value);
      const next = allowed(this.value) ? pageName() : (DEFAULT_PAGE[this.value] || 'index.html');
      window.location.href = next;
    });
  }

  window.RoleUI = {
    init() {
      Store.initDemoData();
      const role = Store.getCurrentRole();
      document.body.setAttribute('data-role', role);
      bindRoleChange();
      syncRoleSelect();
      applyNavAccess();
      enforcePageAccess();
    },
  };
})();
