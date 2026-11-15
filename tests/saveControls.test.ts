import { afterEach, describe, expect, it, vi } from 'vitest';
import { FarmSaves, SAVE_KEY } from '../src/sim/save';
import { saveControls } from '../src/ui/saveControls';

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
  }));
  const warn = vi.fn();
  const controls = saveControls(saves, loaded, warn);
  return {
    loaded, values, storage, confirm, reload, windowEvents, documentEvents, warn,
    interval: () => interval(),
    save: () => controls.save(),
    startFresh: () => controls.startFresh(),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('autosave', () => {
  it('saves manually, periodically, when hidden, and when leaving the page', () => {
    const env = setup();
    env.loaded.game.money = 1000;
    env.save();
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
    env.save();
    const previous = env.values.get(SAVE_KEY);
    env.startFresh();
    expect(env.confirm).toHaveBeenCalledOnce();
    expect(env.values.get(SAVE_KEY)).toBe(previous);
    expect(env.loaded.game.money).toBe(1000);
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('keeps the fresh save intact through lifecycle events during reload', () => {
    const env = setup();
    env.loaded.game.money = 1000;
    env.save();
    env.confirm.mockReturnValue(true);
    env.startFresh();
    expect(env.reload).toHaveBeenCalledOnce();
    env.windowEvents.dispatchEvent(new Event('pagehide'));
    env.interval();
    expect(JSON.parse(env.values.get(SAVE_KEY)!).money).toBe(3000);
  });

  it('warns once when saving fails, keeps the previous save, and keeps playing', () => {
    const env = setup();
    env.save();
    const previous = env.values.get(SAVE_KEY);
    env.storage.setItem.mockImplementation(() => { throw new Error('Full'); });
    env.loaded.game.money = 100;
    env.save();
    env.interval();
    expect(env.warn).toHaveBeenCalledOnce();
    expect(env.warn.mock.calls[0][0]).toContain('Save failed');
    expect(env.values.get(SAVE_KEY)).toBe(previous);
    env.confirm.mockReturnValue(true);
    env.startFresh();
    expect(env.warn).toHaveBeenLastCalledWith(expect.stringContaining('Could not start a new farm'));
    expect(env.reload).not.toHaveBeenCalled();
    expect(env.loaded.game.money).toBe(100);
  });

  it('warns again if saving fails after recovering', () => {
    const env = setup();
    env.storage.setItem.mockImplementationOnce(() => { throw new Error('Full'); });
    env.save();
    env.save();
    env.storage.setItem.mockImplementationOnce(() => { throw new Error('Full'); });
    env.save();
    expect(env.warn).toHaveBeenCalledTimes(2);
  });
});
