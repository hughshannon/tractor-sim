import { FarmSaves, snapshot, type LoadResult, type Players } from '../sim/save';
import { h } from './dom';

/** Keeps browser-storage failures visible, not just in a disappearing toast. */
export function saveControls(root: HTMLElement, saves: FarmSaves, loaded: LoadResult, players?: Players) {
  const status = h('div.save-status', { role: 'status', 'aria-live': 'polite' }, loaded.message);
  let reloading = false;
  const save = () => {
    if (reloading || loaded.status === 'protected' || loaded.status === 'unavailable') return;
    try {
      saves.save(loaded.game);
      status.textContent = 'Saved in this browser · autosave on';
    } catch {
      status.textContent = 'Save failed. Previous save kept; keep this tab open and allow browser storage.';
    }
  };
  const fresh = () => {
    if (!window.confirm('Start a fresh farm? This replaces your current progress in this browser. The previous saved farm will be kept as a backup. Cancel to keep playing.')) return;
    try {
      saves.startFresh();
      reloading = true;
      window.location.reload();
    } catch {
      status.textContent = 'Could not start a new farm. Your current farm and save have not been replaced.';
    }
  };
  const switchPlayer = (name: string | null) => {
    if (!players || name === null || name.trim() === saves.player) return;
    save();
    try {
      players.switchTo(name);
      reloading = true;
      window.location.reload();
    } catch {
      status.textContent = 'Could not switch player. Check the name and browser storage.';
    }
  };
  const playerRow = players && h('div.row.player-row', {},
    h('select.player-select', {
      'aria-label': 'Player',
      onchange: (e: Event) => switchPlayer((e.target as HTMLSelectElement).value),
    }, ...players.list().map((name) =>
      h('option', { value: name, selected: name === saves.player ? 'selected' : undefined }, name))),
    h('button.btn.ghost', { onclick: () => switchPlayer(window.prompt('New player name:')) }, 'New player'),
  );
  const canSave = loaded.status !== 'protected' && loaded.status !== 'unavailable';
  const exportFarm = () => {
    const blob = new Blob([JSON.stringify(snapshot(loaded.game))], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: `tractor-farm-${saves.player.replace(/[^\w-]+/g, '_')}.json` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Farm exported. Open Import farm in the other browser and pick this file.';
  };
  const importFile = async (file: File | undefined) => {
    if (!file || !players) return;
    const raw = await file.text();
    const name = window.prompt('Import this farm as which player? (Use a new name to keep every existing farm.)', 'Imported farmer')?.trim();
    if (!name) return;
    if (players.list().includes(name)
      && !window.confirm(`Replace ${name}'s farm with the imported one? Their current farm will be kept as a backup.`)) return;
    try {
      save();
      reloading = true;
      players.importAs(name, raw);
      window.location.reload();
    } catch {
      reloading = false;
      status.textContent = 'That file is not a valid farm save. Nothing was changed.';
    }
  };
  const fileInput = h('input', {
    type: 'file', accept: '.json,application/json', hidden: true,
    onchange: (e: Event) => {
      const input = e.target as HTMLInputElement;
      void importFile(input.files?.[0]);
      input.value = '';
    },
  });
  const transferRow = players && h('div.row.player-row', {},
    h('button.btn.ghost', { onclick: exportFarm, disabled: !canSave }, 'Export farm'),
    h('button.btn.ghost', { onclick: () => fileInput.click() }, 'Import farm'),
    fileInput,
  );
  root.append(h('div.panel.save-controls', {},
    h('div.row', {},
      h('button.btn.ghost', { onclick: save, disabled: loaded.status === 'protected' || loaded.status === 'unavailable' }, 'Save farm'),
      h('button.btn.ghost', { onclick: fresh }, 'New farm'),
    ),
    status,
    playerRow ?? null,
    transferRow ?? null,
  ));
  window.setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);
  return save;
}
