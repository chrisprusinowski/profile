/* MeritCycle — shared data store (localStorage)
   All pages import this via <script src="js/store.js"> before their own scripts. */

const Store = (() => {
  const P = 'mc_';

  function get(key) {
    try { return JSON.parse(localStorage.getItem(P + key)); } catch { return null; }
  }
  function set(key, val) {
    localStorage.setItem(P + key, JSON.stringify(val));
  }

  const DEFAULT_CYCLE = {
    name:                   '2025 Annual Merit Cycle',
    type:                   'merit',
    openDate:               '2025-03-01',
    closeDate:              '2025-04-15',
    effectiveDate:          '2025-07-01',
    totalPayroll:           40000000,
    budgetPct:              3.5,
    budgetTotal:            1400000,
    bonusBudgetPct:         8,
    bonusBudgetTotal:       3200000,
    guidelineMin:           0,
    guidelineMax:           10,
    status:                 'open',
    // Proration
    prorateEnabled:         true,
    prorateStartDate:       '2025-01-01',
    prorateCutoffDate:      '',
    // Eligibility
    eligibilityCutoffEnabled: true,
    eligibilityCutoffDays:  90,
    excludePIP:             true,
    excludePromoted:        false,
    excludePromotedMonths:  6,
    excludePartTime:        false,
    // Approval
    approvalLevel:          'hr+finance',
  };

  const DEFAULT_FINANCE_MODULE = {
    defaultMeritPct: 3.5,
    defaultBonusPct: 8,
    departments: {},
  };

  const DEFAULT_USERS = [
    { id: 'user-hr-001', name: 'Taylor Brooks', role: 'hr', title: 'Compensation Admin' },
    { id: 'user-mgr-001', name: 'Jamie Rivera', role: 'manager', title: 'Engineering Manager' },
    { id: 'user-exec-001', name: 'Morgan Lee', role: 'exec', title: 'VP, Product & Engineering', departments: ['Engineering', 'Product'] },
  ];

  const DEFAULT_EMPLOYEES = [
    { id: 'emp-1001', name: 'Alex Morgan', salary: 145000, department: 'Engineering', title: 'Senior Software Engineer', manager: 'Jamie Rivera', managerUserId: 'user-mgr-001', hireDate: '2021-03-15' },
    { id: 'emp-1002', name: 'Priya Nair', salary: 132000, department: 'Engineering', title: 'Software Engineer II', manager: 'Jamie Rivera', managerUserId: 'user-mgr-001', hireDate: '2022-06-01' },
    { id: 'emp-1003', name: 'Brianna Scott', salary: 130000, department: 'Product', title: 'Product Manager', manager: 'Jordan Pike', managerUserId: 'user-mgr-010', hireDate: '2020-07-01' },
    { id: 'emp-1004', name: 'Carlos Vega', salary: 95000, department: 'Sales', title: 'Account Executive', manager: 'Aisha Kofi', managerUserId: 'user-mgr-020', hireDate: '2022-01-10' },
    { id: 'emp-1005', name: 'Dana Kim', salary: 118000, department: 'Engineering', title: 'QA Engineer', manager: 'Jamie Rivera', managerUserId: 'user-mgr-001', hireDate: '2019-11-19' },
  ];

  function roleKey() { return localStorage.getItem('mc_role') || 'hr'; }

  return {

    initDemoData() {
      if (!(get('employees') || []).length) set('employees', DEFAULT_EMPLOYEES);
      if (!(get('users') || []).length) set('users', DEFAULT_USERS);
      if (!localStorage.getItem('mc_role')) localStorage.setItem('mc_role', 'hr');
      if (!localStorage.getItem('mc_activeUserId')) localStorage.setItem('mc_activeUserId', 'user-hr-001');
    },

    // ── Employees ───────────────────────────────────────────────
    getEmployees()    { return get('employees') || []; },
    setEmployees(arr) { set('employees', arr); },
    hasEmployees()    { return (get('employees') || []).length > 0; },
    getVisibleEmployees() {
      const role = roleKey();
      const employees = this.getEmployees();
      if (role === 'hr') return employees;
      if (role === 'manager') {
        const activeUserId = localStorage.getItem('mc_activeUserId');
        return employees.filter((e) => e.managerUserId === activeUserId);
      }
      if (role === 'exec') {
        const user = this.getCurrentUser();
        const departments = user?.departments || [];
        if (!departments.length) return employees;
        return employees.filter((e) => departments.includes(e.department));
      }
      return employees;
    },

    // ── Users / roles ───────────────────────────────────────────
    getUsers() { return get('users') || []; },
    getUsersByRole(role) { return this.getUsers().filter((u) => u.role === role); },
    getCurrentRole() { return roleKey(); },
    setCurrentRole(role) { localStorage.setItem('mc_role', role); },
    getCurrentUser() {
      const users = this.getUsersByRole(roleKey());
      const currentId = localStorage.getItem('mc_activeUserId');
      return users.find((u) => u.id === currentId) || users[0] || null;
    },
    setCurrentUser(id) { localStorage.setItem('mc_activeUserId', id); },

    // ── Cycle config ────────────────────────────────────────────
    getCycle()    { return { ...DEFAULT_CYCLE, ...(get('cycle') || {}) }; },
    setCycle(obj) { set('cycle', obj); },

    // ── Proration ───────────────────────────────────────────────
    // Returns { eligible: bool, factor: 0-1, reason: string }
    getEmployeeProration(employee) {
      const cycle = this.getCycle();
      if (!employee || !employee.hireDate) {
        return { eligible: true, factor: 1, reason: 'No hire date' };
      }

      const hireDate      = new Date(employee.hireDate);
      const effectiveDate = new Date(cycle.effectiveDate || cycle.closeDate);

      // Hard cutoff: hired on or after prorateCutoffDate → ineligible
      if (cycle.prorateCutoffDate) {
        const cutoff = new Date(cycle.prorateCutoffDate);
        if (hireDate >= cutoff) {
          return { eligible: false, factor: 0, reason: 'Hired after eligibility cutoff date' };
        }
      }

      // Eligibility cutoff: hired within X days of effective date → ineligible
      if (cycle.eligibilityCutoffEnabled && cycle.eligibilityCutoffDays > 0) {
        const cutoffMs = cycle.eligibilityCutoffDays * 24 * 60 * 60 * 1000;
        if (effectiveDate - hireDate < cutoffMs) {
          return { eligible: false, factor: 0, reason: `Hired within ${cycle.eligibilityCutoffDays} days of effective date` };
        }
      }

      // Proration disabled → full amount
      if (!cycle.prorateEnabled) {
        return { eligible: true, factor: 1, reason: 'No proration applied' };
      }

      // Hired before proration start → full year
      const prorateStart = new Date(cycle.prorateStartDate || '2025-01-01');
      if (hireDate <= prorateStart) {
        return { eligible: true, factor: 1, reason: 'Full year' };
      }

      // Prorated: fraction of period from prorateStart to effectiveDate
      const totalMs    = effectiveDate - prorateStart;
      const employedMs = effectiveDate - hireDate;
      if (totalMs <= 0) return { eligible: true, factor: 1, reason: 'Full year' };
      const factor = Math.max(0, Math.min(1, employedMs / totalMs));
      return { eligible: true, factor, reason: `${Math.round(factor * 100)}% prorated` };
    },

    // ── Finance module (team makeup based budgets) ─────────────
    getFinanceModule() {
      const current = get('financeModule') || {};
      return {
        ...DEFAULT_FINANCE_MODULE,
        ...current,
        departments: { ...DEFAULT_FINANCE_MODULE.departments, ...(current.departments || {}) },
      };
    },

    setFinanceModule(obj) {
      const merged = {
        ...DEFAULT_FINANCE_MODULE,
        ...(obj || {}),
        departments: { ...(obj?.departments || {}) },
      };
      set('financeModule', merged);
    },

    getTeamBudgetBreakdown() {
      const employees = get('employees') || [];
      const finance   = this.getFinanceModule();
      const byDept    = {};

      employees.forEach(e => {
        const dept = e.department || 'Unassigned';
        byDept[dept] = byDept[dept] || { headcount: 0, payroll: 0 };
        byDept[dept].headcount += 1;
        byDept[dept].payroll   += Number(e.salary) || 0;
      });

      const totalPayroll = Object.values(byDept).reduce((sum, d) => sum + d.payroll, 0);

      const rows = Object.entries(byDept)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([department, stats]) => {
          const cfg = finance.departments[department] || {};
          const meritPct = Number.isFinite(cfg.meritPct) ? cfg.meritPct : finance.defaultMeritPct;
          const bonusPct = Number.isFinite(cfg.bonusPct) ? cfg.bonusPct : finance.defaultBonusPct;
          return {
            department,
            headcount: stats.headcount,
            payroll: stats.payroll,
            payrollShare: totalPayroll ? stats.payroll / totalPayroll : 0,
            meritPct,
            bonusPct,
            meritBudget: stats.payroll * (meritPct / 100),
            bonusBudget: stats.payroll * (bonusPct / 100),
          };
        });

      return {
        totalPayroll,
        totalMeritBudget: rows.reduce((sum, r) => sum + r.meritBudget, 0),
        totalBonusBudget: rows.reduce((sum, r) => sum + r.bonusBudget, 0),
        rows,
      };
    },

    // Single helper exposing both planning models:
    //  - cycleBudget: configured cycle budget (authoritative for merit allocation tracking)
    //  - financeModel: department roll-up based on payroll mix + merit/bonus assumptions
    getPlanningSummary() {
      const employees = get('employees') || [];
      const cycle = this.getCycle();
      const team = this.getTeamBudgetBreakdown();
      const cycleBudget = Number(cycle.budgetTotal) || (Number(cycle.totalPayroll) * (Number(cycle.budgetPct) / 100));

      return {
        hasEmployees: employees.length > 0,
        employeeCount: employees.length,
        cycleBudget: {
          totalPayroll: Number(cycle.totalPayroll) || 0,
          budgetPct: Number(cycle.budgetPct) || 0,
          budgetTotal: cycleBudget,
          label: 'Cycle Budget',
        },
        financeModel: {
          totalPayroll: team.totalPayroll,
          meritBudgetTotal: team.totalMeritBudget,
          bonusBudgetTotal: team.totalBonusBudget,
          rows: team.rows,
          label: 'Finance Model Budget',
        },
        variance: {
          meritBudgetDelta: team.totalMeritBudget - cycleBudget,
          payrollDelta: team.totalPayroll - (Number(cycle.totalPayroll) || 0),
        },
      };
    },

    // ── Recommendations (one per employee id) ───────────────────
    getRecommendations() { return get('recommendations') || {}; },

    getRecommendation(id) {
      return (get('recommendations') || {})[id]
        || { meritPct: 0, rating: 'Meets Expectations', notes: '', status: 'Draft' };
    },

    setRecommendation(id, data) {
      const recs = get('recommendations') || {};
      recs[id] = { ...(recs[id] || {}), ...data, updatedAt: new Date().toISOString() };
      set('recommendations', recs);
    },

    // Mark all Draft recs as Submitted
    submitAll() {
      this.submitForEmployees((get('employees') || []).map((e) => e.id));
    },

    submitForEmployees(employeeIds = []) {
      const idSet = new Set(employeeIds);
      const employees = (get('employees') || []).filter((e) => idSet.has(e.id));
      const recs      = get('recommendations') || {};
      employees.forEach(e => {
        const r = recs[e.id] || {};
        if (!r.status || r.status === 'Draft') {
          recs[e.id] = {
            meritPct: 0, rating: 'Meets Expectations', notes: '',
            ...r, status: 'Submitted', updatedAt: new Date().toISOString(),
          };
        }
      });
      set('recommendations', recs);
    },

    // ── Computed helpers ─────────────────────────────────────────
    getBudgetSummary() {
      const employees = get('employees') || [];
      const recs      = get('recommendations') || {};
      const planning  = this.getPlanningSummary();
      const budget    = planning.cycleBudget.budgetTotal;
      let allocated = 0, sumPct = 0, eligibleCount = 0;

      employees.forEach(e => {
        const proration = this.getEmployeeProration(e);
        const pct       = (recs[e.id]?.meritPct) || 0;
        if (proration.eligible) {
          const effectivePct = pct * proration.factor;
          allocated  += e.salary * (effectivePct / 100);
          sumPct     += effectivePct;
          eligibleCount++;
        }
        // Ineligible employees contribute $0 to the budget
      });

      const cycle = this.getCycle();
      return {
        budget,
        allocated,
        remaining: budget - allocated,
        avgPct:    eligibleCount ? sumPct / eligibleCount : 0,
        pctUsed:   budget ? allocated / budget : 0,
        prorateEnabled: cycle.prorateEnabled,
      };
    },

    getStatusCounts() {
      const employees = get('employees') || [];
      const recs      = get('recommendations') || {};
      const counts    = { Draft: 0, Submitted: 0, Approved: 0, Flagged: 0, Ineligible: 0 };
      employees.forEach(e => {
        const proration = this.getEmployeeProration(e);
        if (!proration.eligible) { counts.Ineligible++; return; }
        const s = (recs[e.id]?.status) || 'Draft';
        counts[s] = (counts[s] || 0) + 1;
      });
      return counts;
    },

    getDepartments() {
      return [...new Set(
        (get('employees') || []).map(e => e.department).filter(Boolean)
      )].sort();
    },

    // Returns count of flagged recs (for sidebar badge)
    getFlaggedCount() {
      const employees = get('employees') || [];
      const recs      = get('recommendations') || {};
      return employees.filter(e => (recs[e.id]?.status) === 'Flagged').length;
    },

    // ── Clear ────────────────────────────────────────────────────
    clearEmployees()  { set('employees', []); set('recommendations', {}); },
    clearAll() {
      Object.keys(localStorage).filter(k => k.startsWith(P))
        .forEach(k => localStorage.removeItem(k));
    },
  };
})();
