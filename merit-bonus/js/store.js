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
    name:         '2025 Annual Merit Cycle',
    type:         'merit',
    openDate:     '2025-03-01',
    closeDate:    '2025-04-15',
    effectiveDate:'2025-07-01',
    totalPayroll: 40000000,
    budgetPct:    3.5,
    budgetTotal:  1400000,
    guidelineMin: 0,
    guidelineMax: 10,
    status:       'open',
  };

  const DEFAULT_FINANCE_MODULE = {
    defaultMeritPct: 3.5,
    defaultBonusPct: 8,
    departments: {},
  };

  return {

    // ── Employees ───────────────────────────────────────────────
    getEmployees()    { return get('employees') || []; },
    setEmployees(arr) { set('employees', arr); },
    hasEmployees()    { return (get('employees') || []).length > 0; },

    // ── Cycle config ────────────────────────────────────────────
    getCycle()        { return get('cycle') || { ...DEFAULT_CYCLE }; },
    setCycle(obj)     { set('cycle', obj); },


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
      const employees = get('employees') || [];
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
      const cycle     = this.getCycle();
      const budget    = cycle.budgetTotal || (cycle.totalPayroll * cycle.budgetPct / 100);
      let allocated = 0, sumPct = 0;

      employees.forEach(e => {
        const pct  = (recs[e.id]?.meritPct) || 0;
        allocated += e.salary * (pct / 100);
        sumPct    += pct;
      });

      return {
        budget,
        allocated,
        remaining: budget - allocated,
        avgPct:    employees.length ? sumPct / employees.length : 0,
        pctUsed:   budget ? allocated / budget : 0,
      };
    },

    getStatusCounts() {
      const employees = get('employees') || [];
      const recs      = get('recommendations') || {};
      const counts    = { Draft: 0, Submitted: 0, Approved: 0, Flagged: 0 };
      employees.forEach(e => {
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
