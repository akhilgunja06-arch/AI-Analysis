/** Small, dependency-light helpers used across the UI. */

/** Joins class names, dropping falsy values. */
export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdayName(weekday: number, short = false): string {
  const list = short ? WEEKDAYS_SHORT : WEEKDAYS;
  return list[weekday] ?? '—';
}

/** 570 -> "09:30" */
export function minutesToTime(minutes: number): string {
  const safe = Math.max(0, Math.min(1440, minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "09:30" -> 570 */
export function timeToMinutes(value: string): number {
  const [h, m] = value.split(':').map((n) => Number.parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

export function formatDate(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, options ?? { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(value: string | Date, timeZone?: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/**
 * Session times are shown in the viewer's own timezone — the promise the footer
 * makes — with the session's host timezone appended when it differs, so nobody
 * has to convert in their head. Day grouping elsewhere also uses local time.
 */
export function formatSessionTime(value: string | Date, sessionTimezone?: string | null): string {
  const local = formatDateTime(value);
  const viewerTimezone = detectTimezone();
  if (!sessionTimezone || sessionTimezone === viewerTimezone) return local;
  return `${local} (${sessionTimezone.replace(/_/g, ' ')}: ${formatDateTime(value, sessionTimezone)})`;
}

export function formatTime(value: string | Date, timeZone?: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    timeStyle: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

/** "3 hours ago", "in 2 days" */
export function relativeTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['week', 7 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
  ];

  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return rtf.format(Math.round(diffMs / 1000), 'second');
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return `${hours} hr${hours === 1 ? '' : 's'}`;
  return `${hours} hr ${rest} min`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/**
 * Deterministic avatar tint so the same member always gets the same colour.
 * Purely decorative; it carries no meaning about the person.
 */
export function avatarTint(seed: string): string {
  const palette = [
    'from-brand-500 to-violet-500',
    'from-electric-500 to-brand-600',
    'from-violet-500 to-rose-500',
    'from-emerald-500 to-electric-500',
    'from-amber-500 to-rose-500',
    'from-brand-600 to-electric-400',
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length]!;
}

/** A compact list of IANA timezones for the picker. */
export const COMMON_TIMEZONES = [
  'UTC',
  'Africa/Accra', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Cairo', 'Africa/Johannesburg',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Mexico_City', 'America/Sao_Paulo', 'America/Bogota', 'America/Toronto',
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore',
  'Asia/Seoul', 'Asia/Jakarta', 'Asia/Amman', 'Asia/Karachi', 'Asia/Dhaka',
  'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland',
  'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'Europe/Rome', 'Europe/Lisbon', 'Europe/Amsterdam', 'Europe/Warsaw', 'Europe/Vienna',
  'Europe/Stockholm', 'Europe/Moscow', 'Europe/Istanbul', 'Europe/Kyiv',
];

export const COMMON_LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch',
  'Mandarin', 'Cantonese', 'Japanese', 'Korean', 'Hindi', 'Tamil', 'Bengali',
  'Urdu', 'Arabic', 'Hebrew', 'Turkish', 'Russian', 'Polish', 'Ukrainian',
  'Swahili', 'Yoruba', 'Twi', 'Zulu', 'Indonesian', 'Vietnamese', 'Thai',
];

/** Debounce for search inputs. */
export function debounce<T extends (...args: never[]) => void>(fn: T, delay = 350) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Reads the user's timezone, falling back to UTC. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
