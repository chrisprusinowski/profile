/* MeritCycle — CSV parser + column mapper */

const CSV = (() => {

  /* Parse raw CSV text → { headers: string[], rows: object[] }
     Handles: BOM, quoted fields, embedded commas/newlines, CRLF */
  function parse(text) {
    text = text.replace(/^\uFEFF/, ''); // strip BOM
    const rows = [];
    let row = [], field = '', inQ = false, i = 0;

    while (i < text.length) {
      const c = text[i], n = text[i + 1];

      if (inQ) {
        if (c === '"' && n === '"') { field += '"'; i += 2; continue; } // escaped quote
        if (c === '"')              { inQ = false; i++;     continue; } // end quote
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
    // Flush last field / row
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

  /* Auto-detect which CSV column maps to each target field.
     Returns { fieldKey: 'CSV Header', ... } */
  function autoDetect(headers) {
    const norm    = h => h.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normed  = headers.map(norm);
    const mapping = {};

    const PATTERNS = {
      id:         ['employeeid','empid','id','eid','employeenumber','number'],
      fullName:   ['fullname','name','employeename','employee','displayname'],
      firstName:  ['firstname','fname','givenname','first'],
      lastName:   ['lastname','lname','familyname','surname','last'],
      email:      ['email','emailaddress','mail','workemail'],
      title:      ['jobtitle','title','position','role','jobcode','jobname'],
      department: ['department','dept','division','team','org','bu','businessunit'],
      manager:    ['managername','manager','supervisor','reportsto','mgr','directmanager'],
      salary:     ['basesalary','salary','annualsalary','basepay','currentsal','currentbase',
                   'compensation','pay','wage','annualbase','currentannualsalary'],
      hireDate:   ['hiredate','startdate','dateofhire','joindate','datestarted','employmentdate'],
      rating:     ['performancerating','rating','performancescore','review','score','perfrating'],
    };

    Object.entries(PATTERNS).forEach(([field, keywords]) => {
      const idx = normed.findIndex(h =>
        keywords.includes(h) || keywords.some(kw => h.includes(kw) || kw.includes(h))
      );
      if (idx !== -1) mapping[field] = headers[idx];
    });

    return mapping;
  }

  /* Convert parsed rows + field mapping → employee objects + warnings */
  function toEmployees(rows, mapping) {
    const COLORS   = ['#4F46E5','#0891B2','#059669','#D97706','#DC2626',
                      '#7C3AED','#0D9488','#EA580C','#BE185D','#B45309'];
    const warnings = [];
    const usedIds  = new Set();

    const employees = rows.map((row, i) => {
      // Resolve name
      let name = '';
      if (mapping.fullName && row[mapping.fullName]) {
        name = row[mapping.fullName].trim();
      } else if (mapping.firstName || mapping.lastName) {
        name = [row[mapping.firstName] || '', row[mapping.lastName] || ''].join(' ').trim();
      }
      if (!name) {
        warnings.push(`Row ${i + 2}: no name found — skipped`);
        return null;
      }

      // Resolve salary
      const salaryStr = mapping.salary ? row[mapping.salary] : '';
      const salary    = parseSalary(salaryStr);
      if (salary === null) {
        warnings.push(`Row ${i + 2} (${name}): couldn't parse salary "${salaryStr}" — set to $0`);
      }

      // Auto-generate initials and stable id
      const parts    = name.trim().split(/\s+/);
      const initials = ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase();
      const idBase   = (mapping.id && row[mapping.id])
        ? String(row[mapping.id]).trim()
        : `emp-${i + 1}-${name.replace(/\s+/g, '').slice(0, 6).toLowerCase()}`;
      const { id, deduped } = ensureUniqueId(idBase, usedIds, i);
      if (deduped) {
        warnings.push(`Row ${i + 2} (${name}): duplicate employee id "${idBase}" — stored as "${id}"`);
      }

      return {
        id,
        name,
        email:      mapping.email      ? row[mapping.email]      : '',
        title:      mapping.title      ? row[mapping.title]      : '',
        department: mapping.department ? row[mapping.department] : '',
        manager:    mapping.manager    ? row[mapping.manager]    : '',
        salary:     salary ?? 0,
        hireDate:   mapping.hireDate   ? row[mapping.hireDate]   : '',
        rating:     mapping.rating     ? row[mapping.rating]     : '',
        initials,
        avatarColor: COLORS[i % COLORS.length],
      };
    }).filter(Boolean);

    return { employees, warnings };
  }

  function parseSalary(str) {
    if (!str && str !== 0) return 0;
    const n = parseFloat(String(str).replace(/[$,\s]/g, ''));
    return isNaN(n) ? null : Math.round(n);
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

  return { parse, autoDetect, toEmployees };
})();
