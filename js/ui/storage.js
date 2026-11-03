// What the browser remembers between visits: the player's display settings and a life in progress.
// Everything lives under one localStorage key, in this browser only. Every read and write is wrapped,
// because storage can be missing, full or blocked (private windows, blocked site data), and the game
// must work the same without it.

const KEY = 'lifeSim.v1';
export const SAVE_VERSION = 1;

// A store that remembers nothing, for when storage is not available.
export function createNoStore() {
  return {
    available: false,
    loadSettings: () => ({}), saveSettings: () => false,
    loadLife: () => null, saveLife: () => false, clearLife: () => {},
  };
}

export function createStore(storage) {
  const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
  const read = () => {
    const parsed = safe(() => JSON.parse(storage.getItem(KEY) ?? 'null'), null);
    return parsed && typeof parsed === 'object' ? parsed : {};
  };
  const write = (record) => safe(() => { storage.setItem(KEY, JSON.stringify(record)); return true; }, false);
  const available = safe(() => { storage.setItem('__probe', '1'); storage.removeItem('__probe'); return true; }, false);
  if (!available) return createNoStore();

  return {
    available,
    loadSettings: () => read().settings ?? {},
    saveSettings: (settings) => write({ ...read(), settings }),
    // A life in progress, or null. The caller checks it still fits the current game (see flow.js).
    loadLife: () => {
      const life = read().life;
      return life && life.v === SAVE_VERSION ? life : null;
    },
    saveLife: (life) => write({ ...read(), life: { ...life, v: SAVE_VERSION, savedAt: Date.now() } }),
    clearLife: () => {
      const record = read();
      delete record.life;
      write(record);
    },
  };
}

// The browser's own storage, or a store that remembers nothing if it is blocked.
export function browserStore() {
  try { return createStore(globalThis.localStorage); } catch { return createNoStore(); }
}
