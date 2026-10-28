import { SAVE_VERSION } from './generate';
import type { GameState } from './types';

/**
 * Saves go to IndexedDB: a full world is a couple of megabytes, which is
 * uncomfortably close to localStorage's quota on some phones. localStorage
 * only remembers whether a save exists, so the start screen can render
 * synchronously.
 */

const DB = 'gaffer26';
const STORE = 'saves';
const KEY = 'career';
const FLAG = 'gaffer26.hasSave';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveGame(state: GameState): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(JSON.stringify(state), KEY));
    try {
      localStorage.setItem(FLAG, '1');
    } catch {
      // Flag is only a hint for the start screen.
    }
  } catch (error) {
    console.warn('save failed', error);
  }
}

export async function loadGame(): Promise<GameState | null> {
  try {
    const raw = await tx<string | undefined>('readonly', (s) => s.get(KEY) as IDBRequest<string | undefined>);
    if (!raw) return null;
    const state = JSON.parse(raw) as GameState;
    if (state.version !== SAVE_VERSION) return null;
    return state;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

export async function clearSave(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.delete(KEY));
    localStorage.removeItem(FLAG);
  } catch {
    // Nothing to clear.
  }
}
