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

/** Clock hour the sun rises. */
export const SUNRISE_HOUR = 3;
/** Clock hour the sun sets. Night runs from here to SUNRISE_HOUR. */
export const SUNSET_HOUR = 21;

/**
 * Sun angle along its path, in radians: 0 at sunrise, PI/2 at midday, PI at sunset, 3PI/2 in the middle
 * of the night. Day and night each take half a turn, so a short night simply passes faster.
 */
export function sunAngle(t: number): number {
  const day = SUNSET_HOUR - SUNRISE_HOUR;
  const since = (hourAt(t) - SUNRISE_HOUR + 24) % 24;
  return since < day ? (since / day) * Math.PI : Math.PI + ((since - day) / (24 - day)) * Math.PI;
}

/**
 * Sun elevation as sin(angle above the horizon), -1..1. Sunrise is 03:00, midday 12:00, sunset 21:00.
 */
export function sunHeight(t: number): number {
  return Math.sin(sunAngle(t));
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
