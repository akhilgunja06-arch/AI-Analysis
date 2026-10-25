import { describe, expect, it } from 'vitest';
import {
  cn,
  formatDuration,
  formatSessionTime,
  initials,
  minutesToTime,
  pluralise,
  timeToMinutes,
  truncate,
  weekdayName,
} from '@/lib/utils';

describe('utils', () => {
  it('joins only the truthy class names', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
    expect(cn()).toBe('');
  });

  it('names weekdays with Sunday as 0', () => {
    expect(weekdayName(0)).toBe('Sunday');
    expect(weekdayName(1)).toBe('Monday');
    expect(weekdayName(6, true)).toBe('Sat');
  });

  it('round-trips minutes and HH:MM in both directions', () => {
    expect(minutesToTime(0)).toBe('00:00');
    expect(minutesToTime(570)).toBe('09:30');
    expect(minutesToTime(1439)).toBe('23:59');
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('00:00')).toBe(0);
  });

  it('formats durations in the largest sensible unit', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(90)).toBe('1 hr 30 min');
    expect(formatDuration(120)).toBe('2 hrs');
    expect(formatDuration(1500)).toBe('25 hrs');
  });

  it('pluralises using the count, with an optional irregular plural', () => {
    expect(pluralise(1, 'session')).toBe('session');
    expect(pluralise(2, 'session')).toBe('sessions');
    expect(pluralise(0, 'session')).toBe('sessions');
    expect(pluralise(1, 'reply', 'replies')).toBe('reply');
    expect(pluralise(3, 'reply', 'replies')).toBe('replies');
  });

  it('builds initials from a display name', () => {
    expect(initials('Amara Okafor')).toBe('AO');
    expect(initials('Priya')).toBe('PR');
    expect(initials('  spaced   out  name ')).toBe('SN');
    expect(initials('')).toBe('?');
  });

  it('truncates to the requested width including the ellipsis', () => {
    expect(truncate('short', 10)).toBe('short');
    // The result never exceeds `max` characters, ellipsis included.
    expect(truncate('a much longer value', 10)).toBe('a much lo…');
    expect(truncate('a much longer value', 10)).toHaveLength(10);
  });

  it('shows session times in the viewer timezone and names the host timezone', () => {
    const instant = '2026-10-11T04:12:00.000Z';
    const viewer = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Same timezone: no redundant suffix.
    expect(formatSessionTime(instant, viewer)).toBe(
      formatSessionTime(instant, null),
    );

    // A different host timezone is appended so nobody has to convert manually.
    const other = viewer === 'Asia/Kolkata' ? 'Europe/London' : 'Asia/Kolkata';
    const withSuffix = formatSessionTime(instant, other);
    expect(withSuffix).toContain(other.replace(/_/g, ' '));
    expect(withSuffix.length).toBeGreaterThan(formatSessionTime(instant, null).length);
  });
});
