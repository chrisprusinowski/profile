import { describe, expect, it } from 'vitest';
import {
  parseCsv,
  parseDate,
  parseSalary,
  toCanonicalHeader,
  validateAndNormalizeRows
} from './employeeImport.js';

describe('employee import parsing utilities', () => {
  it('parses BOM and quoted CSV rows', () => {
    const parsed = parseCsv('\uFEFFid,name,email,department,title,salary,manager,hire_date\n"E-1","Doe, Jane",jane@demo.com,Engineering,Developer,"$78,000.00",,2024-01-04');
    expect(parsed.headers[0]).toBe('id');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0][1]).toBe('Doe, Jane');
  });

  it('normalizes header aliases', () => {
    expect(toCanonicalHeader('Hire Date')).toBe('hire_date');
    expect(toCanonicalHeader('Employee ID')).toBe('id');
    expect(toCanonicalHeader('Base Salary')).toBe('salary');
  });

  it('normalizes salary values', () => {
    expect(parseSalary('78000')).toBe(78000);
    expect(parseSalary('78,000')).toBe(78000);
    expect(parseSalary('$78,000.00')).toBe(78000);
    expect(parseSalary('abc')).toBeNull();
  });

  it('normalizes dates across common formats', () => {
    expect(parseDate('2024-01-31')).toBe('2024-01-31');
    expect(parseDate('01/31/2024')).toBe('2024-01-31');
    expect(parseDate('Jan 31, 2024')).toBe('2024-01-31');
    expect(parseDate('2024-02-30')).toBeNull();
  });
});

describe('validateAndNormalizeRows', () => {
  it('accepts required+optional schema with blank manager and ignores unknown extra columns', () => {
    const csv = [
      'Employee ID,Name,Email,Department,Title,Base Salary,Manager,Hire Date,Position Type,Geography,Level,Extra Field',
      'E1, Jane   Doe , JANE@DEMO.COM , Engineering , Software Engineer , "$78,000.00", , 1/15/2024 , Full Time , US , L4 , ignored'
    ].join('\n');

    const result = validateAndNormalizeRows(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: 'E1',
      name: 'Jane Doe',
      email: 'jane@demo.com',
      manager: '',
      salary: 78000,
      hireDate: '2024-01-15',
      positionType: 'Full Time',
      geography: 'US',
      level: 'L4'
    });
    expect(result.unknownColumns).toContain('extra_field');
  });

  it('reports missing required header columns', () => {
    const csv = 'id,name,salary\nE1,Jane,100';
    const result = validateAndNormalizeRows(csv);
    expect(result.errors[0]?.error).toContain('Missing required columns');
  });

  it('reports row-level errors for unusable data', () => {
    const csv = [
      'id,name,email,department,title,salary,manager,hire_date',
      'E1,,not-an-email,Engineering,Engineer,abc,Leader,2024-13-01'
    ].join('\n');

    const result = validateAndNormalizeRows(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.map((err) => err.error)).toEqual(
      expect.arrayContaining([
        'name is required',
        'salary is invalid: "abc"',
        'hire_date could not be parsed: "2024-13-01"',
        'email is invalid: "not-an-email"'
      ])
    );
  });

  it('detects malformed/empty csv', () => {
    const result = validateAndNormalizeRows('');
    expect(result.errors[0]).toEqual({ row: 1, error: 'CSV is empty or malformed' });
  });

  it('supports pasted CSV with BOM', () => {
    const csv = '\uFEFFid,name,email,department,title,salary,manager,hire_date\nE2,John Doe,john@demo.com,Sales,AE,90000,Manager,2024/05/01';
    const result = validateAndNormalizeRows(csv);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.hireDate).toBe('2024-05-01');
  });
});
