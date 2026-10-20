import { describe, expect, it } from 'vitest';
import {
  buildMonthGrid,
  clampISO,
  isWithin,
  monthBounds,
  shiftISODays,
  shiftISOMonths,
  DAYS_IN_WEEK,
  WEEKS,
} from './calendarGrid';

describe('buildMonthGrid', () => {
  it('is always six rows, so the panel never changes height', () => {
    // February 2027 is 28 days starting on a Monday — four rows of real days.
    // October 2026 is 31 starting on a Thursday, which needs six.
    for (const [month, year] of [
      [2, 2027],
      [10, 2026],
      [2, 2026],
      [8, 2026],
    ] as const) {
      expect(buildMonthGrid(month, year)).toHaveLength(WEEKS * DAYS_IN_WEEK);
    }
  });

  it('starts every row on a Sunday, matching getDay() and weeklyOffDays', () => {
    const cells = buildMonthGrid(10, 2026);
    for (let row = 0; row < WEEKS; row += 1) {
      const first = cells[row * DAYS_IN_WEEK];
      expect(new Date(`${first.iso}T12:00:00`).getDay()).toBe(0);
    }
  });

  it('runs consecutively with no gap or repeat across the whole grid', () => {
    const cells = buildMonthGrid(3, 2026);
    for (let at = 1; at < cells.length; at += 1) {
      expect(cells[at].iso).toBe(shiftISODays(cells[at - 1].iso, 1));
    }
  });

  it('marks the days either side as outside, and the month itself as not', () => {
    // October 2026 starts on a Thursday, so Sun 27 – Wed 30 September lead it.
    const cells = buildMonthGrid(10, 2026);
    expect(cells[0]).toEqual({ iso: '2026-09-27', day: 27, outside: true });
    expect(cells[4]).toEqual({ iso: '2026-10-01', day: 1, outside: false });

    const inside = cells.filter((cell) => !cell.outside);
    expect(inside).toHaveLength(31);
    expect(inside[30].iso).toBe('2026-10-31');
  });

  it('crosses a year end', () => {
    const cells = buildMonthGrid(1, 2026);
    expect(cells[0].iso).toBe('2025-12-28');
    expect(cells.some((cell) => cell.iso === '2026-01-01')).toBe(true);
  });

  it('places the leap day', () => {
    const inside = buildMonthGrid(2, 2028).filter((cell) => !cell.outside);
    expect(inside).toHaveLength(29);
    expect(inside[28].iso).toBe('2028-02-29');
  });
});

describe('isWithin / clampISO', () => {
  it('treats both bounds as inclusive', () => {
    expect(isWithin('2026-10-20', '2026-10-20', '2026-10-20')).toBe(true);
    expect(isWithin('2026-10-19', '2026-10-20', undefined)).toBe(false);
    expect(isWithin('2026-10-21', undefined, '2026-10-20')).toBe(false);
  });

  it('allows anything when a bound is absent', () => {
    expect(isWithin('1999-01-01')).toBe(true);
    expect(isWithin('2099-01-01')).toBe(true);
  });

  it('clamps to the nearest day offered', () => {
    expect(clampISO('2026-12-01', undefined, '2026-10-20')).toBe('2026-10-20');
    expect(clampISO('2020-01-01', '2026-10-01', undefined)).toBe('2026-10-01');
    expect(clampISO('2026-10-10', '2026-10-01', '2026-10-20')).toBe('2026-10-10');
  });
});

describe('shiftISODays', () => {
  it('crosses months, years and the leap day', () => {
    expect(shiftISODays('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftISODays('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftISODays('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftISODays('2026-10-20', 7)).toBe('2026-10-27');
  });
});

describe('shiftISOMonths', () => {
  it('keeps the day of the month where the month is long enough', () => {
    expect(shiftISOMonths('2026-10-20', -1)).toBe('2026-09-20');
    expect(shiftISOMonths('2026-10-20', 1)).toBe('2026-11-20');
    expect(shiftISOMonths('2026-01-15', -1)).toBe('2025-12-15');
  });

  /**
   * The reason this is not `new Date(y, m - 1 + delta, d)`: that reads 31
   * February as 3 March, so PageUp from 31 March then PageDown would land on
   * the 3rd — a grid that does not come back to where it started.
   */
  it('pins to the end of a shorter month rather than overflowing into the next', () => {
    expect(shiftISOMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftISOMonths('2026-05-31', 1)).toBe('2026-06-30');
    expect(shiftISOMonths('2028-03-31', -1)).toBe('2028-02-29');
  });
});

describe('monthBounds', () => {
  it('gives the first and last day, so a month can be tested against a range', () => {
    expect(monthBounds(10, 2026)).toEqual({ first: '2026-10-01', last: '2026-10-31' });
    expect(monthBounds(2, 2026)).toEqual({ first: '2026-02-01', last: '2026-02-28' });
    expect(monthBounds(2, 2028)).toEqual({ first: '2028-02-01', last: '2028-02-29' });
    expect(monthBounds(12, 2026)).toEqual({ first: '2026-12-01', last: '2026-12-31' });
  });
});
