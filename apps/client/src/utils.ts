export function fmt(n: number): string {
  return '$' + Math.round(n).toLocaleString();
}

export function fmtK(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return '$' + Math.round(n / 1_000) + 'K';
  return '$' + Math.round(n);
}

export function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function initials(name: string): string {
  return String(name || '??')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

const AVATAR_PALETTE = [
  '#4F46E5',
  '#0891B2',
  '#059669',
  '#DC2626',
  '#7C3AED',
  '#D97706',
  '#2563EB',
  '#0D9488',
  '#EA580C'
];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    Draft: 'badge-gray',
    Submitted: 'badge-blue',
    Locked: 'badge-green'
  };
  return map[status] ?? 'badge-gray';
}

export function ratingBadgeClass(rating: string): string {
  const map: Record<string, string> = {
    Exceptional: 'badge-green',
    'Exceeds Expectations': 'badge-blue',
    'Meets Expectations': 'badge-gray',
    'Needs Improvement': 'badge-red'
  };
  return map[rating] ?? 'badge-gray';
}

export type EligibilityResult = {
  eligibilityPercent: number;
  ineligible: boolean;
  label: string;
};

export function getEligibility(
  employeeHireDate: string | undefined,
  cycle: {
    effectiveDate?: string;
    minTenureDays?: number;
    enableProration?: boolean;
    prorationStartDate?: string;
    eligibilityCutoffDate?: string;
  } | null
): EligibilityResult {
  if (!cycle || !employeeHireDate)
    return { eligibilityPercent: 1, ineligible: false, label: '100%' };
  const hireDate = new Date(employeeHireDate);
  if (Number.isNaN(hireDate.getTime()))
    return { eligibilityPercent: 1, ineligible: false, label: '100%' };

  const asOf = cycle.effectiveDate ? new Date(cycle.effectiveDate) : new Date();
  const minTenureDays = Number(cycle.minTenureDays ?? 0);
  const tenureDays = Math.floor(
    (asOf.getTime() - hireDate.getTime()) / 86400000
  );
  if (tenureDays < minTenureDays)
    return { eligibilityPercent: 0, ineligible: true, label: 'Ineligible' };

  if (
    !cycle.enableProration ||
    !cycle.prorationStartDate ||
    !cycle.eligibilityCutoffDate
  ) {
    return { eligibilityPercent: 1, ineligible: false, label: '100%' };
  }

  const prorationStart = new Date(cycle.prorationStartDate);
  const cutoff = new Date(cycle.eligibilityCutoffDate);
  if (
    Number.isNaN(prorationStart.getTime()) ||
    Number.isNaN(cutoff.getTime()) ||
    prorationStart >= cutoff
  ) {
    return { eligibilityPercent: 1, ineligible: false, label: '100%' };
  }

  if (hireDate < prorationStart)
    return { eligibilityPercent: 1, ineligible: false, label: '100%' };
  if (hireDate >= cutoff)
    return { eligibilityPercent: 0, ineligible: true, label: 'Ineligible' };

  const span = cutoff.getTime() - prorationStart.getTime();
  const eligible = cutoff.getTime() - hireDate.getTime();
  const pct = Math.max(0, Math.min(1, eligible / span));
  return {
    eligibilityPercent: pct,
    ineligible: pct <= 0,
    label: `${(pct * 100).toFixed(1)}%`
  };
}
