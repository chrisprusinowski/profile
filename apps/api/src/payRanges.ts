export interface PayRangeRecord {
  id: number;
  rangeName: string | null;
  jobFamily: string | null;
  positionType: string | null;
  jobTitleReference: string | null;
  level: string | null;
  geography: string | null;
  geoTier: string | null;
  currency: string;
  salaryMin: number;
  salaryMid: number;
  salaryMax: number;
  effectiveDate: string | null;
  isActive: boolean;
}

export interface EmployeeMatchInput {
  title?: string | null;
  department?: string | null;
  positionType?: string | null;
  geography?: string | null;
  level?: string | null;
  salary: number;
}

function norm(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function equalsMaybe(a?: string | null, b?: string | null): boolean {
  return norm(a) && norm(b) ? norm(a) === norm(b) : false;
}

function hasValue(value?: string | null): boolean {
  return Boolean(norm(value));
}

function specificity(range: PayRangeRecord): number {
  return [range.positionType, range.jobFamily, range.jobTitleReference, range.level, range.geography, range.geoTier]
    .filter(hasValue).length;
}

function withBand(range: PayRangeRecord, salary: number) {
  const bandStatus = salary < range.salaryMin ? 'below_range' : salary > range.salaryMax ? 'above_range' : 'in_range';
  const compaRatio = range.salaryMid > 0 ? salary / range.salaryMid : null;
  const spread = range.salaryMax - range.salaryMin;
  const rawPen = spread > 0 ? (salary - range.salaryMin) / spread : null;
  const rangePenetration = rawPen === null ? null : Math.max(0, Math.min(1, rawPen));

  return {
    payRangeId: range.id,
    payRangeName: range.rangeName,
    matchedRangeMin: range.salaryMin,
    matchedRangeMid: range.salaryMid,
    matchedRangeMax: range.salaryMax,
    matchedRangeCurrency: range.currency,
    bandStatus,
    compaRatio,
    rangePenetration,
    matchedBy: undefined as string | undefined
  };
}

export function findBestPayRange(employee: EmployeeMatchInput, ranges: PayRangeRecord[]) {
  const active = ranges.filter((r) => r.isActive);

  const checks: Array<{ key: string; filter: (range: PayRangeRecord) => boolean }> = [
    {
      key: 'position_type+geography',
      filter: (r) =>
        (equalsMaybe(r.positionType, employee.positionType) || equalsMaybe(r.jobFamily, employee.department)) &&
        equalsMaybe(r.geography, employee.geography) &&
        (!hasValue(r.level) || equalsMaybe(r.level, employee.level))
    },
    {
      key: 'title+geography',
      filter: (r) =>
        equalsMaybe(r.jobTitleReference, employee.title) &&
        equalsMaybe(r.geography, employee.geography) &&
        (!hasValue(r.level) || equalsMaybe(r.level, employee.level))
    },
    {
      key: 'position_type_only',
      filter: (r) =>
        (equalsMaybe(r.positionType, employee.positionType) || equalsMaybe(r.jobFamily, employee.department)) &&
        (!hasValue(r.level) || equalsMaybe(r.level, employee.level))
    },
    {
      key: 'title_only',
      filter: (r) =>
        equalsMaybe(r.jobTitleReference, employee.title) &&
        (!hasValue(r.level) || equalsMaybe(r.level, employee.level))
    }
  ];

  for (const check of checks) {
    const matches = active.filter(check.filter);
    if (!matches.length) continue;

    matches.sort((a, b) => {
      const specificityDiff = specificity(b) - specificity(a);
      if (specificityDiff !== 0) return specificityDiff;
      const aDate = a.effectiveDate ? new Date(a.effectiveDate).getTime() : 0;
      const bDate = b.effectiveDate ? new Date(b.effectiveDate).getTime() : 0;
      if (bDate !== aDate) return bDate - aDate;
      return b.id - a.id;
    });

    return { ...withBand(matches[0], employee.salary), matchedBy: check.key };
  }

  return {
    payRangeId: null,
    payRangeName: null,
    matchedRangeMin: null,
    matchedRangeMid: null,
    matchedRangeMax: null,
    matchedRangeCurrency: null,
    bandStatus: 'no_range',
    compaRatio: null,
    rangePenetration: null,
    matchedBy: null
  };
}
