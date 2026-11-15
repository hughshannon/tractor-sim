import { FarmSaves, type LoadResult } from '../sim/save';

export interface SaveControls {
  /** Save now (also runs every 5 s, when the tab is hidden, and on leaving the page). */
  save(): void;
  /** Ask, then replace the farm with a fresh one (the old save is kept as a backup) and reload. */
  startFresh(): void;
}

/**
 * Background autosave with no on-screen panel. Failures are reported through `warn` (shown as a toast),
 * and only once until a save succeeds again, so a full or blocked storage doesn't spam every 5 seconds.
 */
export function saveControls(saves: FarmSaves, loaded: LoadResult, warn: (message: string) => void): SaveControls {
  let reloading = false;
  let failing = false;
  const save = () => {
    if (reloading || loaded.status === 'protected' || loaded.status === 'unavailable') return;
    try {
      saves.save(loaded.game);
      failing = false;
    } catch {
      if (!failing) warn('Save failed. Previous save kept; keep this tab open and allow browser storage.');
      failing = true;
    }
  };
  const startFresh = () => {
    if (!window.confirm('Start a fresh farm? This replaces your current progress in this browser. The previous saved farm will be kept as a backup. Cancel to keep playing.')) return;
    try {
      saves.startFresh();
      reloading = true;
      window.location.reload();
    } catch {
      warn('Could not start a new farm. Your current farm and save have not been replaced.');
    }
  };
  window.setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);
  return { save, startFresh };
}
