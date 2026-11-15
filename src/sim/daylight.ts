/** Real seconds of game time per in-game day. */
export const DAY_LENGTH = 600;
/** Clock hour at game time 0, so a new farm starts in the morning. */
export const START_HOUR = 7.5;

/** Hour of day (0..24) at game time t. */
export function hourAt(t: number): number {
  const h = (START_HOUR + (t / DAY_LENGTH) * 24) % 24;
  return h < 0 ? h + 24 : h;
}

/** "07:30"-style clock string. */
export function clockText(t: number): string {
  const h = hourAt(t);
  const mins = Math.floor(h * 60) % (24 * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/**
 * Sun elevation as sin(angle above the horizon), -1..1. Sunrise is 06:00, noon 12:00, sunset 18:00.
 */
export function sunHeight(t: number): number {
  return Math.sin(((hourAt(t) - 6) / 24) * Math.PI * 2);
}

/** 0 in full daylight, 1 at full night, with a smooth dusk/dawn transition around the horizon. */
export function nightFactor(t: number): number {
  const s = sunHeight(t);
  const k = Math.max(0, Math.min(1, (0.15 - s) / 0.3));
  return k * k * (3 - 2 * k);
}

/** Lamps switch on a little before it gets properly dark. */
export function lampsOn(t: number): boolean {
  return nightFactor(t) > 0.25;
}
