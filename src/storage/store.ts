// Persistent application state.
//
// For this version everything lives in the browser (localStorage) — nothing is
// synchronised between devices. All reads/writes go through `StorageAdapter`
// so a real backend (database + authentication) can replace it later without
// touching the UI.
import { useSyncExternalStore } from "react";
import type { SavedGame } from "../types";

export interface Settings {
  theme: "dark" | "light";
  boardTheme: string;
  pieceSet: string;
  coords: boolean;
  animation: "normal" | "fast" | "off";
  showLegal: boolean;
  highlightLast: boolean;
  autoQueen: boolean;
  confirmResign: boolean;
  soundEnabled: boolean;
  soundBoard: boolean;
  soundPuzzle: boolean;
  volume: number; // 0..1
  playEvalBar: boolean;
  analysisDepth: number;
  analysisLines: number;
  reviewDepth: number;
}

export interface PuzzleAttempt {
  solved: boolean;
  firstTry: boolean;
  timeMs: number;
  date: number;
  hints: number;
}

export interface PuzzleProgress {
  rating: number;
  ratingHistory: { t: number; r: number }[];
  attempts: Record<string, PuzzleAttempt>;
  streak: number;
  bestStreak: number;
  points: number;
  themeStats: Record<string, { ok: number; fail: number }>;
  daily: Record<string, { ids: string[]; done: string[] }>;
}

export interface FavoritePosition {
  id: string;
  title: string;
  fen: string;
  date: number;
}

export interface FavoriteLine {
  id: string;
  name: string;
  moves: string[]; // SAN
  date: number;
}

export interface OngoingGame {
  botId: string;
  playerColor: "w" | "b";
  timeControl: string;
  baseMs: number;
  incMs: number;
  startFen: string;
  moves: string[]; // UCI
  clocks: { w: number; b: number };
  savedAt: number;
}

export interface AppState {
  version: 1;
  profileName: string;
  settings: Settings;
  games: SavedGame[];
  puzzles: PuzzleProgress;
  lessons: { done: Record<string, number>; exercises: Record<string, boolean> };
  studySeconds: number;
  studyByDay: Record<string, number>;
  favoritePositions: FavoritePosition[];
  favoriteLines: FavoriteLine[];
  ongoing: OngoingGame | null;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  boardTheme: "floresta",
  pieceSet: "cburnett",
  coords: true,
  animation: "normal",
  showLegal: true,
  highlightLast: true,
  autoQueen: false,
  confirmResign: true,
  soundEnabled: true,
  soundBoard: true,
  soundPuzzle: true,
  volume: 0.6,
  playEvalBar: false,
  analysisDepth: 18,
  analysisLines: 3,
  reviewDepth: 14,
};

export function defaultState(): AppState {
  return {
    version: 1,
    profileName: "Jogador",
    settings: { ...DEFAULT_SETTINGS },
    games: [],
    puzzles: {
      rating: 1200,
      ratingHistory: [],
      attempts: {},
      streak: 0,
      bestStreak: 0,
      points: 0,
      themeStats: {},
      daily: {},
    },
    lessons: { done: {}, exercises: {} },
    studySeconds: 0,
    studyByDay: {},
    favoritePositions: [],
    favoriteLines: [],
    ongoing: null,
  };
}

export interface StorageAdapter {
  load(): unknown;
  save(state: AppState): void;
}

const KEY = "lance-certo:v1";

export const localAdapter: StorageAdapter = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or unavailable: keep working in memory */
    }
  },
};

/** Merge stored data over defaults so new fields never break old saves. */
export function hydrate(raw: unknown): AppState {
  const d = defaultState();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<AppState>;
  return {
    ...d,
    ...r,
    version: 1,
    settings: { ...d.settings, ...(r.settings ?? {}) },
    puzzles: { ...d.puzzles, ...(r.puzzles ?? {}) },
    lessons: { ...d.lessons, ...(r.lessons ?? {}) },
    games: Array.isArray(r.games) ? r.games : [],
    favoritePositions: Array.isArray(r.favoritePositions) ? r.favoritePositions : [],
    favoriteLines: Array.isArray(r.favoriteLines) ? r.favoriteLines : [],
    studyByDay: r.studyByDay ?? {},
    ongoing: r.ongoing ?? null,
  };
}

let adapter: StorageAdapter = localAdapter;
let state: AppState = hydrate(typeof localStorage !== "undefined" ? adapter.load() : null);
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getState(): AppState {
  return state;
}

export function setState(update: (s: AppState) => AppState) {
  state = update(state);
  listeners.forEach((l) => l());
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => adapter.save(state), 150);
}

export function flush() {
  if (saveTimer) clearTimeout(saveTimer);
  adapter.save(state);
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(state)
  );
}

export function useSettings(): Settings {
  return useAppState((s) => s.settings);
}

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function setAdapterForTests(a: StorageAdapter) {
  adapter = a;
  state = hydrate(a.load());
}

export function resetAll() {
  state = defaultState();
  flush();
  listeners.forEach((l) => l());
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addStudyTime(seconds: number) {
  if (seconds <= 0) return;
  const k = todayKey();
  setState((s) => ({
    ...s,
    studySeconds: s.studySeconds + seconds,
    studyByDay: { ...s.studyByDay, [k]: (s.studyByDay[k] ?? 0) + seconds },
  }));
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      state = hydrate(adapter.load());
      listeners.forEach((l) => l());
    }
  });
}
