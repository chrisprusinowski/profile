/**
 * Tests for merit-bonus/js/csv.js — CSV parsing, normalization, validation
 *
 * Loads the browser-targeted IIFE module via eval to test in Node/Vitest.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CSV: any;

beforeAll(() => {
  const csvPath = resolve(__dirname, '../../../merit-bonus/js/csv.js');
  const code = readFileSync(csvPath, 'utf-8');
  // Evaluate in a function scope to capture the IIFE result
  // The file assigns `const CSV = (() => { ... })()` and then does module.exports
  // We need to simulate a CommonJS-like env
  const fn = new Function('module', 'exports', code + '\nreturn CSV;');
  const mod = { exports: {} };
  CSV = fn(mod, mod.exports);
});

// ── CSV Parsing ─────────────────────────────────────────────────

describe('CSV.parse', () => {
  it('parses simple CSV', () => {
    const result = CSV.parse('name,salary\nAlice,100000\nBob,90000');
    expect(result.headers).toEqual(['name', 'salary']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe('Alice');
    expect(result.rows[0].salary).toBe('100000');
  });

  it('handles CRLF line endings', () => {
    const result = CSV.parse('name,salary\r\nAlice,100000\r\nBob,90000\r\n');
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].name).toBe('Alice');
  });

  it('handles CR-only line endings', () => {
    const result = CSV.parse('name,salary\rAlice,100000\rBob,90000');
    expect(result.rows).toHaveLength(2);
  });

  it('strips UTF-8 BOM', () => {
    const result = CSV.parse('\uFEFFname,salary\nAlice,100000');
    expect(result.headers).toEqual(['name', 'salary']);
    expect(result.rows).toHaveLength(1);
  });

  it('handles quoted fields with commas', () => {
    const result = CSV.parse('name,title\n"Smith, John","Sr. Engineer, Platform"');
    expect(result.rows[0].name).toBe('Smith, John');
    expect(result.rows[0].title).toBe('Sr. Engineer, Platform');
  });

  it('handles escaped quotes in fields', () => {
    const result = CSV.parse('name,note\nAlice,"She said ""hello"""');
    expect(result.rows[0].note).toBe('She said "hello"');
  });

  it('skips blank lines', () => {
    const result = CSV.parse('name,salary\n\nAlice,100000\n\n\nBob,90000\n');
    expect(result.rows).toHaveLength(2);
  });

  it('trims field values', () => {
    const result = CSV.parse('name , salary \n  Alice  ,  100000  ');
    expect(result.rows[0]['name']).toBe('Alice');
  });

  it('returns empty for empty/null input', () => {
    expect(CSV.parse('')).toEqual({ headers: [], rows: [] });
    expect(CSV.parse(null)).toEqual({ headers: [], rows: [] });
    expect(CSV.parse(undefined)).toEqual({ headers: [], rows: [] });
  });

  it('handles missing values in rows (fewer fields than headers)', () => {
    const result = CSV.parse('name,salary,department\nAlice,80000\nBob,90000,Engineering');
    expect(result.rows[0].department).toBe('');
    expect(result.rows[1].department).toBe('Engineering');
  });
});

// ── Header Auto-Detection ───────────────────────────────────────

describe('CSV.autoDetect', () => {
  it('matches exact canonical headers', () => {
    const m = CSV.autoDetect(['id', 'name', 'email', 'department', 'title', 'salary', 'manager', 'hire_date']);
    expect(m.id).toBe('id');
    expect(m.fullName).toBe('name');
    expect(m.email).toBe('email');
    expect(m.department).toBe('department');
    expect(m.title).toBe('title');
    expect(m.salary).toBe('salary');
    expect(m.manager).toBe('manager');
    expect(m.hireDate).toBe('hire_date');
  });

  it('matches case-insensitive headers', () => {
    const m = CSV.autoDetect(['ID', 'Name', 'Email', 'Department', 'Title', 'Salary', 'Manager', 'Hire Date']);
    expect(m.id).toBe('ID');
    expect(m.fullName).toBe('Name');
    expect(m.salary).toBe('Salary');
    expect(m.hireDate).toBe('Hire Date');
  });

  it('matches common aliases', () => {
    const m = CSV.autoDetect(['Employee ID', 'Full Name', 'Email Address', 'Dept', 'Job Title', 'Base Salary', 'Supervisor', 'Start Date']);
    expect(m.id).toBe('Employee ID');
    expect(m.fullName).toBe('Full Name');
    expect(m.email).toBe('Email Address');
    expect(m.department).toBe('Dept');
    expect(m.title).toBe('Job Title');
    expect(m.salary).toBe('Base Salary');
    expect(m.manager).toBe('Supervisor');
    expect(m.hireDate).toBe('Start Date');
  });

  it('matches optional field aliases', () => {
    const m = CSV.autoDetect(['name', 'salary', 'Position Type', 'Geography', 'Level']);
    expect(m.positionType).toBe('Position Type');
    expect(m.geography).toBe('Geography');
    expect(m.level).toBe('Level');
  });

  it('handles headers with underscores/hyphens/spaces', () => {
    const m = CSV.autoDetect(['employee_id', 'hire-date', 'base salary']);
    expect(m.id).toBe('employee_id');
    expect(m.hireDate).toBe('hire-date');
    expect(m.salary).toBe('base salary');
  });
});

// ── Salary Normalization ────────────────────────────────────────

describe('CSV.normalizeSalary', () => {
  it('parses plain number', () => {
    expect(CSV.normalizeSalary('78000').value).toBe(78000);
  });

  it('parses number with commas', () => {
    expect(CSV.normalizeSalary('78,000').value).toBe(78000);
  });

  it('parses dollar sign', () => {
    expect(CSV.normalizeSalary('$78,000').value).toBe(78000);
  });

  it('parses dollar sign with decimals', () => {
    expect(CSV.normalizeSalary('$78,000.00').value).toBe(78000);
  });

  it('parses with spaces', () => {
    expect(CSV.normalizeSalary(' 78 000 ').value).toBe(78000);
  });

  it('parses euro sign', () => {
    expect(CSV.normalizeSalary('€78,000').value).toBe(78000);
  });

  it('returns 0 for empty', () => {
    expect(CSV.normalizeSalary('').value).toBe(0);
    expect(CSV.normalizeSalary('').error).toBeNull();
  });

  it('returns 0 for null/undefined', () => {
    expect(CSV.normalizeSalary(null).value).toBe(0);
    expect(CSV.normalizeSalary(undefined).value).toBe(0);
  });

  it('returns error for non-numeric', () => {
    const r = CSV.normalizeSalary('abc');
    expect(r.value).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it('returns error for negative', () => {
    const r = CSV.normalizeSalary('-50000');
    expect(r.value).toBeNull();
    expect(r.error).toBeTruthy();
  });
});

// ── Date Normalization ──────────────────────────────────────────

describe('CSV.normalizeDate', () => {
  it('parses ISO YYYY-MM-DD', () => {
    expect(CSV.normalizeDate('2021-03-15').value).toBe('2021-03-15');
  });

  it('parses ISO with slashes', () => {
    expect(CSV.normalizeDate('2021/03/15').value).toBe('2021-03-15');
  });

  it('parses US MM/DD/YYYY', () => {
    expect(CSV.normalizeDate('03/15/2021').value).toBe('2021-03-15');
  });

  it('parses US M/D/YYYY', () => {
    expect(CSV.normalizeDate('3/5/2021').value).toBe('2021-03-05');
  });

  it('parses US MM-DD-YYYY', () => {
    expect(CSV.normalizeDate('03-15-2021').value).toBe('2021-03-15');
  });

  it('parses "Jan 15, 2021"', () => {
    expect(CSV.normalizeDate('Jan 15, 2021').value).toBe('2021-01-15');
  });

  it('parses "January 15 2021"', () => {
    expect(CSV.normalizeDate('January 15 2021').value).toBe('2021-01-15');
  });

  it('parses "15 Jan 2021"', () => {
    expect(CSV.normalizeDate('15 Jan 2021').value).toBe('2021-01-15');
  });

  it('parses "15-Jan-2021"', () => {
    expect(CSV.normalizeDate('15-Jan-2021').value).toBe('2021-01-15');
  });

  it('returns empty for empty input', () => {
    expect(CSV.normalizeDate('').value).toBe('');
    expect(CSV.normalizeDate('').error).toBeNull();
  });

  it('returns error for garbage', () => {
    expect(CSV.normalizeDate('not a date').value).toBeNull();
    expect(CSV.normalizeDate('not a date').error).toBeTruthy();
  });

  it('returns error for Feb 30', () => {
    expect(CSV.normalizeDate('2021-02-30').value).toBeNull();
    expect(CSV.normalizeDate('2021-02-30').error).toBeTruthy();
  });

  it('trims whitespace', () => {
    expect(CSV.normalizeDate('  2021-03-15  ').value).toBe('2021-03-15');
  });
});

// ── Text/Email Normalization ────────────────────────────────────

describe('CSV.normalizeText', () => {
  it('trims whitespace', () => {
    expect(CSV.normalizeText('  hello  ')).toBe('hello');
  });

  it('collapses multiple spaces', () => {
    expect(CSV.normalizeText('John   Doe')).toBe('John Doe');
  });

  it('returns empty for null/undefined', () => {
    expect(CSV.normalizeText(null)).toBe('');
    expect(CSV.normalizeText(undefined)).toBe('');
  });
});

describe('CSV.normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(CSV.normalizeEmail('  Alice@Company.COM  ')).toBe('alice@company.com');
  });

  it('returns empty for empty/null', () => {
    expect(CSV.normalizeEmail('')).toBe('');
    expect(CSV.normalizeEmail(null)).toBe('');
  });
});

describe('CSV.isValidEmail', () => {
  it('accepts valid email', () => {
    expect(CSV.isValidEmail('test@example.com')).toBe(true);
  });

  it('accepts empty (optional)', () => {
    expect(CSV.isValidEmail('')).toBe(true);
    expect(CSV.isValidEmail(null)).toBe(true);
  });

  it('rejects invalid email', () => {
    expect(CSV.isValidEmail('notanemail')).toBe(false);
  });
});

// ── toEmployees ─────────────────────────────────────────────────

describe('CSV.toEmployees', () => {
  const stdMapping = {
    id: 'id', fullName: 'name', email: 'email', department: 'department',
    title: 'title', salary: 'salary', manager: 'manager', hireDate: 'hire_date'
  };

  it('converts standard rows', () => {
    const rows = [
      { id: 'E1', name: 'Alice Smith', email: 'alice@co.com', department: 'Eng', title: 'SWE', salary: '100000', manager: 'Bob', hire_date: '2021-01-15' },
      { id: 'E2', name: 'Carol Jones', email: 'carol@co.com', department: 'PM', title: 'PM', salary: '$120,000', manager: 'Bob', hire_date: '03/01/2020' },
    ];
    const result = CSV.toEmployees(rows, stdMapping);
    expect(result.employees).toHaveLength(2);
    expect(result.errors).toHaveLength(0);
    expect(result.employees[0].salary).toBe(100000);
    expect(result.employees[0].hireDate).toBe('2021-01-15');
    expect(result.employees[1].salary).toBe(120000);
    expect(result.employees[1].hireDate).toBe('2020-03-01');
  });

  it('auto-generates ID when not mapped', () => {
    const rows = [{ name: 'Alice', salary: '100000' }];
    const result = CSV.toEmployees(rows, { fullName: 'name', salary: 'salary' });
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].id).toMatch(/^emp-/);
  });

  it('handles first + last name', () => {
    const rows = [{ first: 'Alice', last: 'Smith', salary: '80000' }];
    const result = CSV.toEmployees(rows, { firstName: 'first', lastName: 'last', salary: 'salary' });
    expect(result.employees[0].name).toBe('Alice Smith');
  });

  it('defaults optional fields to empty string', () => {
    const rows = [{ name: 'Alice', salary: '80000' }];
    const result = CSV.toEmployees(rows, { fullName: 'name', salary: 'salary' });
    const e = result.employees[0];
    expect(e.email).toBe('');
    expect(e.department).toBe('');
    expect(e.title).toBe('');
    expect(e.manager).toBe('');
    expect(e.hireDate).toBe('');
    expect(e.positionType).toBe('');
    expect(e.geography).toBe('');
    expect(e.level).toBe('');
  });

  it('allows blank manager', () => {
    const rows = [{ name: 'Alice', salary: '80000', manager: '' }];
    const result = CSV.toEmployees(rows, { fullName: 'name', salary: 'salary', manager: 'manager' });
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].manager).toBe('');
    expect(result.errors).toHaveLength(0);
  });

  it('rejects rows with missing name', () => {
    const rows = [
      { name: '', salary: '80000' },
      { name: 'Bob', salary: '90000' },
    ];
    const result = CSV.toEmployees(rows, { fullName: 'name', salary: 'salary' });
    expect(result.employees).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].errors[0]).toContain('name');
  });

  it('rejects rows with unparseable salary', () => {
    const rows = [
      { name: 'Alice', salary: 'not-a-number' },
      { name: 'Bob', salary: '90000' },
    ];
    const result = CSV.toEmployees(rows, { fullName: 'name', salary: 'salary' });
    expect(result.employees).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].errors[0]).toContain('salary');
  });

  it('warns but does not reject for unparseable date', () => {
    const rows = [{ name: 'Alice', salary: '80000', hire_date: 'not-a-date' }];
    const result = CSV.toEmployees(rows, { fullName: 'name', salary: 'salary', hireDate: 'hire_date' });
    expect(result.employees).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.employees[0].hireDate).toBe('');
  });

  it('row-level errors include row number', () => {
    const rows = [
      { name: 'Good', salary: '80000' },
      { name: '', salary: '90000' },
    ];
    const result = CSV.toEmployees(rows, { fullName: 'name', salary: 'salary' });
    expect(result.errors[0].row).toBe(3); // header=1, data starts at 2
  });

  it('ignores extra/unknown columns', () => {
    const rows = [{ name: 'Alice', salary: '80000', favorite_color: 'blue' }];
    const result = CSV.toEmployees(rows, { fullName: 'name', salary: 'salary' });
    expect(result.employees).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('deduplicates IDs', () => {
    const rows = [
      { id: 'E1', name: 'Alice', salary: '80000' },
      { id: 'E1', name: 'Bob', salary: '90000' },
    ];
    const result = CSV.toEmployees(rows, { id: 'id', fullName: 'name', salary: 'salary' });
    expect(result.employees).toHaveLength(2);
    expect(result.employees[0].id).toBe('E1');
    expect(result.employees[1].id).toBe('E1-2');
    expect(result.warnings.some(w => w.includes('duplicate'))).toBe(true);
  });
});

// ── End-to-End Pipeline ─────────────────────────────────────────

describe('End-to-end pipeline', () => {
  it('full pipeline with realistic CSV', () => {
    const csv = `id,name,email,department,title,salary,manager,hire_date,position_type,geography,level
EMP001,Alex Morgan,alex@company.com,Engineering,Sr. Software Engineer,"$145,000",Jamie Rivera,2021-03-15,Full-Time,US-West,L5
EMP002,Brianna Scott,brianna@company.com,Product,Product Manager,130000,Sam Chen,07/01/2020,Full-Time,US-East,L4
EMP003,Carlos Vega,carlos@company.com,Sales,Account Executive,95000,,Jan 10 2022,,,`;

    const parsed = CSV.parse(csv);
    expect(parsed.headers).toHaveLength(11);
    expect(parsed.rows).toHaveLength(3);

    const mapping = CSV.autoDetect(parsed.headers);
    expect(mapping.id).toBe('id');
    expect(mapping.fullName).toBe('name');
    expect(mapping.salary).toBe('salary');
    expect(mapping.hireDate).toBe('hire_date');
    expect(mapping.positionType).toBe('position_type');

    const result = CSV.toEmployees(parsed.rows, mapping);
    expect(result.employees).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.employees[0].salary).toBe(145000);
    expect(result.employees[0].hireDate).toBe('2021-03-15');
    expect(result.employees[1].hireDate).toBe('2020-07-01');
    expect(result.employees[2].hireDate).toBe('2022-01-10');
    expect(result.employees[2].manager).toBe('');
    expect(result.employees[0].positionType).toBe('Full-Time');
    expect(result.employees[0].geography).toBe('US-West');
    expect(result.employees[0].level).toBe('L5');
  });

  it('pipeline with Excel-style headers', () => {
    const csv = `Employee ID,Full Name,Email Address,Dept,Job Title,Base Salary,Supervisor,Start Date
E001,Dana Kim,dana@co.com,Engineering,QA Engineer,"$118,000",Jamie Rivera,2019-11-19`;

    const parsed = CSV.parse(csv);
    const mapping = CSV.autoDetect(parsed.headers);
    expect(mapping.id).toBe('Employee ID');
    expect(mapping.fullName).toBe('Full Name');
    expect(mapping.salary).toBe('Base Salary');

    const result = CSV.toEmployees(parsed.rows, mapping);
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].salary).toBe(118000);
  });

  it('pipeline with BOM and mixed line endings', () => {
    const csv = '\uFEFFname,salary\r\nAlice,80000\rBob,90000\nCarol,70000';
    const parsed = CSV.parse(csv);
    expect(parsed.rows).toHaveLength(3);
    const mapping = CSV.autoDetect(parsed.headers);
    const result = CSV.toEmployees(parsed.rows, mapping);
    expect(result.employees).toHaveLength(3);
  });

  it('CSV file upload simulation (FileReader text)', () => {
    // Simulates what FileReader.readAsText returns for a .csv file
    const fileContent = 'id,name,email,salary\nE1,Test User,test@test.com,50000\n';
    const parsed = CSV.parse(fileContent);
    expect(parsed.rows).toHaveLength(1);
    const mapping = CSV.autoDetect(parsed.headers);
    const result = CSV.toEmployees(parsed.rows, mapping);
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].name).toBe('Test User');
    expect(result.employees[0].email).toBe('test@test.com');
  });

  it('pasted CSV (same as file)', () => {
    const pastedText = `id,name,email,department,title,salary,manager,hire_date
EMP001,Alex Morgan,alex@company.com,Engineering,Sr. SWE,145000,Jamie Rivera,2021-03-15`;
    const parsed = CSV.parse(pastedText);
    const mapping = CSV.autoDetect(parsed.headers);
    const result = CSV.toEmployees(parsed.rows, mapping);
    expect(result.employees).toHaveLength(1);
    expect(result.employees[0].id).toBe('EMP001');
  });
});
