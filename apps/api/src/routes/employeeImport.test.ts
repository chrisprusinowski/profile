import { describe, expect, it } from 'vitest';
import {
  parseCsv,
  parseDate,
  parseLooseNumber,
  prepareEmployeeImport,
  toCanonicalHeader
} from './employeeImport.js';

describe('employee import parsing utilities', () => {
  it('parses BOM and quoted CSV rows', () => {
    const parsed = parseCsv('\uFEFFEID,Employee Name,Current Salary\r\n"E-1","Doe, Jane","$78,000.00"');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.['Employee Name']).toBe('Doe, Jane');
  });

  it('normalizes header aliases', () => {
    expect(toCanonicalHeader('Hire Date')).toBe('hire_date');
    expect(toCanonicalHeader('Employee ID')).toBe('employee_id');
    expect(toCanonicalHeader('Base Salary')).toBe('current_salary');
    expect(toCanonicalHeader('Job Title')).toBe('job_title');
    expect(toCanonicalHeader('Dept')).toBe('department');
    expect(toCanonicalHeader('Unexpected Custom Field')).toBeNull();
  });

  it('normalizes loose numeric values', () => {
    expect(parseLooseNumber('78000')).toBe(78000);
    expect(parseLooseNumber('78,000')).toBe(78000);
    expect(parseLooseNumber('USD 78,000.00')).toBe(78000);
    expect(parseLooseNumber('Compa Ratio: 1.09')).toBe(1.09);
    expect(parseLooseNumber('')).toBeNull();
    expect(parseLooseNumber('abc')).toBeNull();
  });

  it('normalizes dates across common formats', () => {
    expect(parseDate('2024-01-31')).toBe('2024-01-31');
    expect(parseDate('01/31/2024')).toBe('2024-01-31');
    expect(parseDate('January 31 2024')).toBe('2024-01-31');
    expect(parseDate('2024-02-30')).toBeNull();
  });
});

describe('prepareEmployeeImport', () => {
  it('normalizes rows without rejecting malformed values', () => {
    const csv = [
      'EID,Employee Name,Current Salary,Hire Date,Bonus Target,Unmapped Field',
      'E1, Jane   Doe ,"USD 110,000.00",1/15/2024,8.33,kept',
      ', Missing Salary Person ,not-a-number,13/40/2024,,still-kept'
    ].join('\n');

    const result = prepareEmployeeImport(csv);
    expect(result.preview.rowsReceived).toBe(2);
    expect(result.preview.rowsNormalized).toBe(2);
    expect(result.preview.errors).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({
      employeeId: 'E1',
      normalized: {
        employee_id: 'E1',
        full_name: 'Jane Doe',
        current_salary: 110000,
        hire_date: '2024-01-15',
        bonus_target_percent: 8.33
      },
      unmappedAttributes: {
        unmapped_field: 'kept'
      }
    });
    expect(result.rows[1]?.warnings).toEqual(
      expect.arrayContaining([
        'Missing employee identifier; generated fallback id during ingest',
        'Could not parse numeric field current_salary; preserved raw value',
        'Could not parse date field hire_date; preserved raw value',
        'Missing current salary',
        'No bonus target provided'
      ])
    );
  });

  it('returns malformed csv as file-level error', () => {
    const result = prepareEmployeeImport('"broken');
    expect(result.preview.rowsReceived).toBe(0);
    expect(result.preview.errors[0]?.message).toContain('unreadable or malformed');
  });
});
