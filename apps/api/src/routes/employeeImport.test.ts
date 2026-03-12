import { describe, expect, it } from 'vitest';
import {
  parseCsv,
  parseDate,
  parseSalary,
  prepareEmployeeImport,
  toCanonicalHeader
} from './employeeImport.js';

describe('employee import parsing utilities', () => {
  it('parses BOM and quoted CSV rows', () => {
    const parsed = parseCsv('\uFEFFid,name,email,department,title,salary,manager,hire_date\r\n"E-1","Doe, Jane",jane@demo.com,Engineering,Developer,"$78,000.00",,2024-01-04');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.name).toBe('Doe, Jane');
  });

  it('normalizes header aliases', () => {
    expect(toCanonicalHeader('Hire Date')).toBe('hire_date');
    expect(toCanonicalHeader('Employee ID')).toBe('id');
    expect(toCanonicalHeader('Base Salary')).toBe('salary');
    expect(toCanonicalHeader('Job Title')).toBe('title');
    expect(toCanonicalHeader('Dept')).toBe('department');
  });

  it('normalizes salary values', () => {
    expect(parseSalary('78000')).toBe(78000);
    expect(parseSalary('78,000')).toBe(78000);
    expect(parseSalary('$78,000.00')).toBe(78000);
    expect(parseSalary('')).toBeNull();
    expect(parseSalary('abc')).toBeNull();
  });

  it('normalizes dates across common formats', () => {
    expect(parseDate('2024-01-31')).toBe('2024-01-31');
    expect(parseDate('01/31/2024')).toBe('2024-01-31');
    expect(parseDate('January 31 2024')).toBe('2024-01-31');
    expect(parseDate('2024-02-30')).toBeNull();
  });
});

describe('prepareEmployeeImport', () => {
  it('returns preview and normalized rows for valid csv', () => {
    const csv = [
      'Employee ID,Name,Email,Department,Job Title,Base Salary,Manager,Hire Date,Position Type,Geography,Level,Extra Field',
      'E1, Jane   Doe , JANE@DEMO.COM , Engineering , Software Engineer ,"$78,000.00", , 1/15/2024 , Full Time , US , L4 , ignored'
    ].join('\n');

    const result = prepareEmployeeImport(csv);
    expect(result.preview.rowsReceived).toBe(1);
    expect(result.preview.rowsValid).toBe(1);
    expect(result.preview.rowsInvalid).toBe(0);
    expect(result.validRows[0]).toMatchObject({
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
    const result = prepareEmployeeImport(csv);
    expect(result.preview.errors[0]?.message).toContain('Missing required columns');
  });

  it('reports invalid and duplicate rows', () => {
    const csv = [
      'id,name,email,department,title,salary,manager,hire_date',
      'E1,,bad-email,Engineering,Engineer,abc,Leader,2024-13-01',
      'E1,Good Name,bad-email,Engineering,Engineer,100000,Leader,2024-01-01',
      'E2,Another,bad-email,Engineering,Engineer,100000,Leader,2024-01-01'
    ].join('\n');

    const result = prepareEmployeeImport(csv);
    expect(result.validRows).toHaveLength(0);
    expect(result.preview.errors.map((err) => err.message)).toEqual(
      expect.arrayContaining([
        'Missing name',
        'Salary could not be parsed',
        'Invalid hire_date: "2024-13-01"',
        'Invalid email: "bad-email"',
        'Duplicate id in file: "E1"',
        'Duplicate email in file: "bad-email"'
      ])
    );
  });


  it('normalizes manager email when manager column contains an email', () => {
    const csv = [
      'id,name,email,department,title,salary,manager,hire_date',
      'E77,Email Manager Person,e77@demo.com,Eng,Engineer,100000,manager@demo.com,2024-01-01'
    ].join('\n');

    const result = prepareEmployeeImport(csv);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0]).toMatchObject({
      manager: '',
      managerEmail: 'manager@demo.com'
    });
    expect(result.preview.warnings.map((warn) => warn.message)).toContain(
      'manager looked like an email; normalized to manager_email for manager-scope visibility'
    );
  });

  it('warns when recommended fields are missing and supports missing id for UUID generation', () => {
    const csv = [
      'id,name,email,department,title,salary,manager,hire_date',
      ',No Id Person,,,Engineer,100000,Leader,2024-01-01'
    ].join('\n');

    const result = prepareEmployeeImport(csv);
    expect(result.validRows).toHaveLength(1);
    expect(result.preview.warnings.map((warn) => warn.message)).toEqual(
      expect.arrayContaining([
        'Missing id, UUID will be generated on commit',
        'Recommended field missing: email',
        'Recommended field missing: department'
      ])
    );
  });
});
