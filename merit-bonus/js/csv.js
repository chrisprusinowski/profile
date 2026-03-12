/* MeritCycle — CSV parser, column mapper, normalizer, and validator
   Handles: BOM, quoted fields, embedded commas/newlines, CRLF,
   header alias matching, salary/date normalization, row-level errors. */

const CSV = (() => {

  // ── CSV Parsing ──────────────────────────────────────────────────

  /** Parse raw CSV text → { headers: string[], rows: object[] }
      Handles: BOM, quoted fields (RFC 4180), embedded commas/newlines, CRLF */
  function parse(text) {
    if (!text || typeof text !== 'string') return { headers: [], rows: [] };
    text = text.replace(/^\uFEFF/, ''); // strip UTF-8 BOM

    const rows = [];
    let row = [], field = '', inQ = false, i = 0;

    while (i < text.length) {
      const c = text[i], n = text[i + 1];

      if (inQ) {
        if (c === '"' && n === '"') { field += '"'; i += 2; continue; }
        if (c === '"')              { inQ = false; i++;     continue; }
        field += c;
      } else {
        if (c === '"') { inQ = true; i++; continue; }
        if (c === ',') { row.push(field.trim()); field = ''; i++; continue; }
        if (c === '\r' && n === '\n') { row.push(field.trim()); rows.push(row); row = []; field = ''; i += 2; continue; }
        if (c === '\n' || c === '\r') { row.push(field.trim()); rows.push(row); row = []; field = ''; i++;     continue; }
        field += c;
      }
      i++;
    }
    if (field || row.length) { row.push(field.trim()); rows.push(row); }

    // Drop fully-empty rows
    const nonEmpty = rows.filter(r => r.some(f => f !== ''));
    if (!nonEmpty.length) return { headers: [], rows: [] };

    const headers = nonEmpty[0];
    return {
      headers,
      rows: nonEmpty.slice(1).map(r => {
        const obj = {};
        headers.forEach((h, j) => { obj[h] = (r[j] || '').trim(); });
        return obj;
      }),
    };
  }

  // ── Header Alias Matching ────────────────────────────────────────

  /** Normalize a header string for comparison: lowercase, strip non-alphanumeric */
  function _normKey(h) {
    return h.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /** Patterns for auto-detecting which CSV column maps to each target field */
  const HEADER_PATTERNS = {
    id:           ['employeeid','empid','id','eid','employeenumber','number'],
    fullName:     ['fullname','name','employeename','employee','displayname'],
    firstName:    ['firstname','fname','givenname','first'],
    lastName:     ['lastname','lname','familyname','surname','last'],
    email:        ['email','emailaddress','mail','workemail','e_mail'],
    title:        ['jobtitle','title','role','jobcode','jobname','jobrole'],
    department:   ['department','dept','division','team','org','bu','businessunit'],
    manager:      ['managername','manager','supervisor','reportsto','mgr','directmanager',
                   'manageremail','managermail'],
    salary:       ['basesalary','salary','annualsalary','basepay','currentsal','currentbase',
                   'compensation','pay','wage','annualbase','currentannualsalary','currentsalary'],
    hireDate:     ['hiredate','startdate','dateofhire','joindate','datestarted','employmentdate',
                   'hire_date','start_date','datestarted','datehired'],
    rating:       ['performancerating','rating','performancescore','review','score','perfrating'],
    positionType: ['positiontype','position_type','emptype','employeetype','employmenttype','type','ftpt'],
    geography:    ['geography','geo','location','region','country','office','worklocation'],
    level:        ['level','grade','band','joblevel','jobgrade','careerlevel'],
  };

  /** Auto-detect which CSV column maps to each target field.
      Returns { fieldKey: 'Original CSV Header', ... } */
  function autoDetect(headers) {
    const normed = headers.map(_normKey);
    const mapping = {};
    const used = new Set(); // prevent double-mapping

    Object.entries(HEADER_PATTERNS).forEach(([field, keywords]) => {
      const idx = normed.findIndex((h, i) =>
        !used.has(i) && (
          keywords.includes(h) ||
          keywords.some(kw => h === kw || (h.length > 2 && kw.length > 2 && (h.includes(kw) || kw.includes(h))))
        )
      );
      if (idx !== -1) {
        mapping[field] = headers[idx];
        used.add(idx);
      }
    });

    return mapping;
  }

  // ── Field Normalization ──────────────────────────────────────────

  /** Normalize a salary string to a number. Returns { value, error } */
  function normalizeSalary(str) {
    if (str === undefined || str === null || str === '') return { value: 0, error: null };
    const cleaned = String(str).replace(/[$€£¥,\s]/g, '');
    if (cleaned === '') return { value: 0, error: null };
    const n = parseFloat(cleaned);
    if (isNaN(n) || !isFinite(n)) return { value: null, error: `could not parse salary "${str}"` };
    if (n < 0) return { value: null, error: `salary cannot be negative: "${str}"` };
    return { value: Math.round(n * 100) / 100, error: null };
  }

  /** Normalize a date string to YYYY-MM-DD. Returns { value, error } */
  function normalizeDate(str) {
    if (!str || typeof str !== 'string') return { value: '', error: null };
    const trimmed = str.trim();
    if (!trimmed) return { value: '', error: null };

    let year, month, day;

    // ISO format: YYYY-MM-DD or YYYY/MM/DD
    let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
    if (m) {
      year = parseInt(m[1], 10);
      month = parseInt(m[2], 10);
      day = parseInt(m[3], 10);
    }

    // US format: MM/DD/YYYY or MM-DD-YYYY
    if (!m) {
      m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(trimmed);
      if (m) {
        month = parseInt(m[1], 10);
        day = parseInt(m[2], 10);
        year = parseInt(m[3], 10);
      }
    }

    // Formats like "Jan 15, 2021" or "January 15, 2021" or "15 Jan 2021"
    if (!m) {
      const MONTHS = {
        jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,
        may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,
        sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12
      };

      // "Jan 15, 2021" or "January 15 2021"
      let wm = /^([a-z]+)\s+(\d{1,2}),?\s*(\d{4})$/i.exec(trimmed);
      if (wm) {
        const mn = MONTHS[wm[1].toLowerCase()];
        if (mn) { month = mn; day = parseInt(wm[2], 10); year = parseInt(wm[3], 10); m = true; }
      }

      // "15 Jan 2021" or "15-Jan-2021"
      if (!m) {
        wm = /^(\d{1,2})[-\s]+([a-z]+)[-\s,]+(\d{4})$/i.exec(trimmed);
        if (wm) {
          const mn = MONTHS[wm[2].toLowerCase()];
          if (mn) { month = mn; day = parseInt(wm[1], 10); year = parseInt(wm[3], 10); m = true; }
        }
      }
    }

    if (!m && !year) return { value: null, error: `could not parse date "${str}"` };

    // Validate the date
    if (year < 1900 || year > 2100) return { value: null, error: `date year out of range: "${str}"` };
    if (month < 1 || month > 12) return { value: null, error: `date month invalid: "${str}"` };
    if (day < 1 || day > 31) return { value: null, error: `date day invalid: "${str}"` };

    // Check actual date validity
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (dt.getUTCFullYear() !== year || dt.getUTCMonth() + 1 !== month || dt.getUTCDate() !== day) {
      return { value: null, error: `invalid date: "${str}"` };
    }

    const pad = n => String(n).padStart(2, '0');
    return { value: `${year}-${pad(month)}-${pad(day)}`, error: null };
  }

  /** Normalize a text field: trim, collapse multiple spaces */
  function normalizeText(str) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().replace(/\s{2,}/g, ' ');
  }

  /** Normalize an email: trim, lowercase */
  function normalizeEmail(str) {
    if (!str || typeof str !== 'string') return '';
    const trimmed = str.trim().toLowerCase();
    if (!trimmed) return '';
    // Basic email format check (lenient)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return trimmed; // store as-is, warn later
    return trimmed;
  }

  /** Check if email looks valid (lenient) */
  function isValidEmail(email) {
    if (!email) return true; // empty is OK for optional
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ── Employee Conversion + Validation ─────────────────────────────

  /** Required fields for the target schema */
  const REQUIRED_FIELDS = ['id', 'name', 'email', 'department', 'title', 'salary', 'manager', 'hire_date'];

  /** Convert parsed rows + field mapping → { employees, warnings, errors }
      errors = row-level errors that would prevent import
      warnings = issues that were auto-fixed or are non-critical */
  function toEmployees(rows, mapping) {
    const COLORS = ['#4F46E5','#0891B2','#059669','#D97706','#DC2626',
                    '#7C3AED','#0D9488','#EA580C','#BE185D','#B45309'];
    const warnings = [];
    const errors = [];
    const usedIds = new Set();

    const employees = rows.map((row, i) => {
      const rowNum = i + 2; // 1-indexed, header is row 1
      const rowErrors = [];
      const rowWarnings = [];

      // Resolve name
      let name = '';
      if (mapping.fullName && row[mapping.fullName]) {
        name = normalizeText(row[mapping.fullName]);
      } else if (mapping.firstName || mapping.lastName) {
        name = normalizeText(
          [row[mapping.firstName] || '', row[mapping.lastName] || ''].join(' ')
        );
      }
      if (!name) {
        rowErrors.push('name is required');
      }

      // Resolve salary
      const salaryStr = mapping.salary ? row[mapping.salary] : '';
      const salaryResult = normalizeSalary(salaryStr);
      if (salaryResult.error) {
        rowErrors.push(salaryResult.error);
      }
      const salary = salaryResult.value ?? 0;

      // Email
      const rawEmail = mapping.email ? row[mapping.email] : '';
      const email = normalizeEmail(rawEmail);
      if (email && !isValidEmail(email)) {
        rowWarnings.push(`email "${rawEmail}" may not be valid`);
      }

      // Department, title, manager — normalize text
      const department = normalizeText(mapping.department ? row[mapping.department] : '');
      const title = normalizeText(mapping.title ? row[mapping.title] : '');
      const manager = normalizeText(mapping.manager ? row[mapping.manager] : '');

      // Hire date — normalize
      const rawDate = mapping.hireDate ? row[mapping.hireDate] : '';
      const dateResult = normalizeDate(rawDate);
      if (dateResult.error) {
        rowWarnings.push(dateResult.error + ' — stored as empty');
      }
      const hireDate = dateResult.value || '';

      // Optional fields
      const positionType = normalizeText(mapping.positionType ? row[mapping.positionType] : '');
      const geography = normalizeText(mapping.geography ? row[mapping.geography] : '');
      const level = normalizeText(mapping.level ? row[mapping.level] : '');

      // ID — use provided or auto-generate
      const idBase = (mapping.id && row[mapping.id])
        ? String(row[mapping.id]).trim()
        : (name ? `emp-${i + 1}-${name.replace(/\s+/g, '').slice(0, 8).toLowerCase()}` : `emp-${i + 1}`);
      const { id, deduped } = ensureUniqueId(idBase, usedIds, i);
      if (deduped) {
        rowWarnings.push(`duplicate id "${idBase}" → stored as "${id}"`);
      }

      // Rating (bonus field, not in required schema but useful)
      const rating = normalizeText(mapping.rating ? row[mapping.rating] : '');

      // Collect warnings/errors
      if (rowErrors.length) {
        errors.push({ row: rowNum, name: name || `(row ${rowNum})`, errors: rowErrors });
        return null;
      }
      rowWarnings.forEach(w => warnings.push(`Row ${rowNum} (${name}): ${w}`));

      // Initials for avatar
      const parts = name.trim().split(/\s+/);
      const initials = ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase();

      return {
        id,
        name,
        email,
        title,
        department,
        manager,
        salary,
        hireDate,
        positionType,
        geography,
        level,
        rating,
        initials,
        avatarColor: COLORS[i % COLORS.length],
      };
    }).filter(Boolean);

    return { employees, warnings, errors };
  }

  function ensureUniqueId(id, usedIds, rowIdx) {
    const fallback = `emp-${rowIdx + 1}`;
    const base = id || fallback;

    if (!usedIds.has(base)) {
      usedIds.add(base);
      return { id: base, deduped: false };
    }

    let suffix = 2;
    let candidate = `${base}-${suffix}`;
    while (usedIds.has(candidate)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }

    usedIds.add(candidate);
    return { id: candidate, deduped: true };
  }

  // ── Public API ───────────────────────────────────────────────────

  return {
    parse,
    autoDetect,
    toEmployees,
    // Expose normalizers for testing and reuse
    normalizeSalary,
    normalizeDate,
    normalizeText,
    normalizeEmail,
    isValidEmail,
    HEADER_PATTERNS,
  };
})();

// Support Node.js / test environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CSV;
}
