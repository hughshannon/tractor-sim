import { describe, expect, it } from 'vitest';
import { DAY_LENGTH, START_HOUR, clockText, hourAt, lampsOn, nightFactor, sunHeight } from '../src/sim/daylight';

const atHour = (h: number) => ((h - START_HOUR) / 24) * DAY_LENGTH;

describe('day/night clock', () => {
  it('starts in the morning and wraps every day', () => {
    expect(hourAt(0)).toBeCloseTo(START_HOUR);
    expect(clockText(0)).toBe('07:30');
    expect(hourAt(DAY_LENGTH * 3 + 1)).toBeCloseTo(hourAt(1));
  });

  it('is bright at noon and dark at midnight', () => {
    expect(sunHeight(atHour(12))).toBeCloseTo(1);
    expect(nightFactor(atHour(12))).toBe(0);
    expect(nightFactor(atHour(0))).toBe(1);
    expect(lampsOn(atHour(12))).toBe(false);
    expect(lampsOn(atHour(23))).toBe(true);
  });

  it('fades smoothly through dusk', () => {
    const dusk = [17, 17.5, 18, 18.5, 19].map((h) => nightFactor(atHour(h)));
    for (let i = 1; i < dusk.length; i++) expect(dusk[i]).toBeGreaterThanOrEqual(dusk[i - 1]);
    expect(dusk[2]).toBeGreaterThan(0.2);
    expect(dusk[2]).toBeLessThan(0.8);
  });
});
