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
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function initials(name: string): string {
  return String(name || '??')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

const AVATAR_PALETTE = ['#4F46E5', '#0891B2', '#059669', '#DC2626', '#7C3AED', '#D97706', '#2563EB', '#0D9488', '#EA580C'];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    Draft: 'badge-gray',
    Submitted: 'badge-blue',
    Locked: 'badge-green',
  };
  return map[status] ?? 'badge-gray';
}

export function ratingBadgeClass(rating: string): string {
  const map: Record<string, string> = {
    Exceptional: 'badge-green',
    'Exceeds Expectations': 'badge-blue',
    'Meets Expectations': 'badge-gray',
    'Needs Improvement': 'badge-red',
  };
  return map[rating] ?? 'badge-gray';
}
