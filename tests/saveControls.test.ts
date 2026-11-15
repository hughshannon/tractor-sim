import { afterEach, describe, expect, it, vi } from 'vitest';
import { FarmSaves, SAVE_KEY } from '../src/sim/save';
import { saveControls } from '../src/ui/saveControls';

// These controls only need standard DOM events and append/setAttribute.
class Element extends EventTarget {
  className = '';
  textContent = '';
  disabled = false;
  children: (Element | string)[] = [];
  append(...children: (Element | string)[]) { this.children.push(...children); }
  setAttribute() {}
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
}

function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
  const saves = new FarmSaves(() => storage);
  const loaded = saves.load();
  const windowEvents = new EventTarget();
  const documentEvents = new EventTarget();
  let interval: () => void = () => {};
  const confirm = vi.fn(() => false);
  const reload = vi.fn();
  vi.stubGlobal('window', Object.assign(windowEvents, {
    setInterval: vi.fn((callback: () => void, delay: number) => {
      expect(delay).toBe(5000);
      interval = callback;
    }),
    confirm,
    location: { reload },
  }));
  vi.stubGlobal('document', Object.assign(documentEvents, {
    visibilityState: 'hidden',
    createElement: () => new Element(),
  }));
  const root = new Element();
  saveControls(root as unknown as HTMLElement, saves, loaded);
  const panel = root.children[0] as Element;
  const row = panel.children[0] as Element;
  return {
    loaded, values, storage, confirm, reload, windowEvents, documentEvents,
    interval: () => interval(),
    saveButton: row.children[0] as Element,
    newButton: row.children[1] as Element,
    status: panel.children[1] as Element,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('save controls', () => {
  it('saves manually, periodically, when hidden, and when leaving the page', () => {
    const env = setup();
    env.loaded.game.money = 1000;
    env.saveButton.click();
    expect(JSON.parse(env.values.get(SAVE_KEY)!).money).toBe(1000);
    env.loaded.game.money = 1100;
    env.interval();
    expect(JSON.parse(env.values.get(SAVE_KEY)!).money).toBe(1100);
    env.loaded.game.money = 1200;
    env.documentEvents.dispatchEvent(new Event('visibilitychange'));
    expect(JSON.parse(env.values.get(SAVE_KEY)!).money).toBe(1200);
    env.loaded.game.money = 1300;
    env.windowEvents.dispatchEvent(new Event('pagehide'));
    expect(JSON.parse(env.values.get(SAVE_KEY)!).money).toBe(1300);
  });

  it('does not touch the current save or game when a fresh start is cancelled', () => {
    const env = setup();
    env.loaded.game.money = 1000;
    env.saveButton.click();
    const previous = env.values.get(SAVE_KEY);
    env.newButton.click();
    expect(env.confirm).toHaveBeenCalledOnce();
    expect(env.values.get(SAVE_KEY)).toBe(previous);
    expect(env.loaded.game.money).toBe(1000);
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('keeps the fresh save intact through lifecycle events during reload', () => {
    const env = setup();
    env.loaded.game.money = 1000;
    env.saveButton.click();
    env.confirm.mockReturnValue(true);
    env.newButton.click();
    expect(env.reload).toHaveBeenCalledOnce();
    env.windowEvents.dispatchEvent(new Event('pagehide'));
    env.interval();
    expect(JSON.parse(env.values.get(SAVE_KEY)!).money).toBe(3000);
  });

  it('shows a persistent error and keeps playing if saving fails', () => {
    const env = setup();
    env.saveButton.click();
    const previous = env.values.get(SAVE_KEY);
    env.storage.setItem.mockImplementation(() => { throw new Error('Full'); });
    env.loaded.game.money = 100;
    env.saveButton.click();
    expect(env.status.textContent).toContain('Save failed');
    expect(env.values.get(SAVE_KEY)).toBe(previous);
    env.confirm.mockReturnValue(true);
    env.newButton.click();
    expect(env.status.textContent).toContain('Could not start a new farm');
    expect(env.reload).not.toHaveBeenCalled();
    expect(env.loaded.game.money).toBe(100);
  });
});
