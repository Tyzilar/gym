import seedProgram from "./seed-program.json";
import hypertrophyProgram from "./hypertrophy-program.json";
import {
  DEFAULT_SETTINGS,
  cleanDayMetrics,
  cleanSettings,
  isIsoDate,
  isoDate,
  sanitizeDay,
  sanitizeLog,
  sanitizePlan,
} from "./domain";
import type { DailyMetrics, DayMetrics, DayRecord, GymBackup, GymSettings, GymState, TrainingPlan } from "./types";

// Everything lives on this phone, in the browser's storage for this site:
//
//   gym:v1:log        one entry per day
//   gym:v1:program    the active program (sessions + targets)
//   gym:v1:programs   every saved program (the dropdown)
//   gym:v1:metrics    body weight per day
//   gym:v1:settings   targets, Library shortlist, rest-timer lengths
//   gym:v1:snap:<day> a full copy taken on the first change of each day (last 3 kept)
//
// There is no server and no account. "Export backup" on the Program page saves
// a file you can keep somewhere safe (or move to a new phone with "Import").

const PREFIX = "gym:v1:";
const SNAP_PREFIX = `${PREFIX}snap:`;
const KEEP_SNAPSHOTS = 3;
const EXPORTED_KEY = `${PREFIX}lastExport`;

const KEYS: Record<keyof GymState, string> = {
  log: `${PREFIX}log`,
  program: `${PREFIX}program`,
  programs: `${PREFIX}programs`,
  metrics: `${PREFIX}metrics`,
  settings: `${PREFIX}settings`,
};

const UPPER_LOWER = sanitizePlan(seedProgram)!;
const HYPERTROPHY = sanitizePlan(hypertrophyProgram)!;

let cache: GymState | null = null;

function readJson(key: string): unknown {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return undefined;
  }
  if (raw == null) return undefined;
  try {
    return JSON.parse(raw);
  } catch (error) {
    // A corrupt value is kept aside rather than overwritten by the next save.
    try {
      localStorage.setItem(`${key}.unreadable-${Date.now()}`, raw);
    } catch {
      /* no room to keep it */
    }
    console.error(`[gym] ${key} could not be read; moved aside.`, error);
    return undefined;
  }
}

function load(): GymState {
  const [log, program, programs, metrics, settings] = (["log", "program", "programs", "metrics", "settings"] as const).map((k) => readJson(KEYS[k]));
  const issues: string[] = [];
  const cleanMetrics: DailyMetrics = {};
  if (metrics && typeof metrics === "object") {
    for (const [date, value] of Object.entries(metrics)) {
      const m = isIsoDate(date) ? cleanDayMetrics(value) : null;
      if (m) cleanMetrics[date] = { ...m, updatedAt: (value as DayMetrics)?.updatedAt };
    }
  }
  const active = sanitizePlan(program) ?? HYPERTROPHY;
  const library = Array.isArray(programs) ? programs.map(sanitizePlan).filter((p): p is TrainingPlan => !!p) : [HYPERTROPHY, UPPER_LOWER];
  const state: GymState = {
    log: sanitizeLog(log, issues),
    program: active,
    programs: [active, ...library.filter((p) => p.id !== active.id)],
    metrics: cleanMetrics,
    settings: cleanSettings(settings, DEFAULT_SETTINGS),
  };
  if (issues.length) console.warn(`[gym] ${issues.length} issue(s) while reading the log:`, issues.slice(0, 5));
  return state;
}

/** Fresh copy of everything saved on this phone. */
export function getGymState(fresh = false): GymState {
  if (!cache || fresh) cache = load();
  return cache;
}

/** True once anything has been saved on this phone (used for the first-run welcome). */
export function hasSavedData(): boolean {
  try {
    return localStorage.getItem(KEYS.log) !== null || localStorage.getItem(KEYS.program) !== null;
  } catch {
    return false;
  }
}

function snapshotKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(SNAP_PREFIX)) keys.push(k);
    }
  } catch {
    /* storage unavailable */
  }
  return keys.sort();
}

function dropOldestSnapshot(): boolean {
  const oldest = snapshotKeys()[0];
  if (!oldest) return false;
  try {
    localStorage.removeItem(oldest);
  } catch {
    return false;
  }
  return true;
}

class StorageFullError extends Error {}

/** Write one value; if the phone's storage for this site is full, old daily snapshots make room first. */
function persist(key: string, value: unknown) {
  const text = JSON.stringify(value);
  for (;;) {
    try {
      localStorage.setItem(key, text);
      return;
    } catch (error) {
      const quota = error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22);
      if (quota && dropOldestSnapshot()) continue;
      if (quota) throw new StorageFullError("this phone's storage for the app is full — export a backup, then delete old workouts");
      throw new Error("this browser isn't letting the app save (private browsing?)");
    }
  }
}

/** First change of each day keeps a copy of everything as it was, then prunes old copies. */
function dailySnapshot(state: GymState) {
  const key = `${SNAP_PREFIX}${isoDate(new Date())}`;
  try {
    if (localStorage.getItem(key) !== null) return;
    localStorage.setItem(key, JSON.stringify(exportBackup(state)));
  } catch {
    // No room for a snapshot is fine; the live data matters more.
    return;
  }
  const keys = snapshotKeys();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_SNAPSHOTS))) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

function mutate<T>(fn: (state: GymState) => T, files: (keyof GymState)[]): T {
  const state = getGymState();
  dailySnapshot(state);
  const result = fn(state);
  for (const key of files) persist(KEYS[key], state[key]);
  return result;
}

export function saveDay(date: string, raw: unknown): DayRecord {
  const issues: string[] = [];
  const day = sanitizeDay(raw, date, issues);
  if (!day) throw new Error("that workout couldn't be read");
  day.updatedAt = new Date().toISOString();
  return mutate((s) => {
    s.log = { ...s.log, [date]: day };
    return day;
  }, ["log"]);
}

export function deleteDay(date: string) {
  mutate((s) => {
    const next = { ...s.log };
    delete next[date];
    s.log = next;
  }, ["log"]);
}

/** Save the program being edited; it becomes (or stays) the active one. */
export function saveProgram(raw: unknown): TrainingPlan {
  const plan = sanitizePlan(raw);
  if (!plan) throw new Error("Program needs a name and at least one session.");
  plan.updatedAt = new Date().toISOString();
  return mutate((s) => {
    s.program = plan;
    s.programs = [plan, ...s.programs.filter((p) => p.id !== plan.id)].slice(0, 30);
    return plan;
  }, ["program", "programs"]);
}

/** Switch the active program (from the dropdown). */
export function activateProgram(id: string): TrainingPlan {
  const plan = getGymState().programs.find((p) => p.id === id);
  if (!plan) throw new Error("That program doesn't exist.");
  return mutate((s) => {
    s.program = plan;
    s.programs = [plan, ...s.programs.filter((p) => p.id !== id)];
    return plan;
  }, ["program", "programs"]);
}

/** Remove a saved program (never the active one). Past workouts keep their own copy of the sessions. */
export function deleteProgram(id: string) {
  if (getGymState().program.id === id) throw new Error("Switch to another program before deleting this one.");
  mutate((s) => {
    s.programs = s.programs.filter((p) => p.id !== id);
  }, ["programs"]);
}

export function saveSettings(raw: unknown): GymSettings {
  return mutate((s) => (s.settings = cleanSettings(raw, s.settings)), ["settings"]);
}

export function saveMetrics(date: string, raw: unknown): DailyMetrics {
  if (!isIsoDate(date)) throw new Error("Bad date");
  const metrics = raw === null ? null : cleanDayMetrics(raw);
  return mutate((s) => {
    const next = { ...s.metrics };
    if (metrics) next[date] = { ...next[date], ...metrics, sources: { ...next[date]?.sources, ...metrics.sources }, updatedAt: new Date().toISOString() };
    else delete next[date];
    s.metrics = next;
    return next;
  }, ["metrics"]);
}

export function exportBackup(state: GymState): GymBackup {
  return {
    format: "fitness-grid-workouts",
    version: 2,
    createdAt: new Date().toISOString(),
    log: state.log,
    program: state.program,
    programs: state.programs,
    dailyMetrics: state.metrics,
    settings: state.settings,
  };
}

/** Import a backup file. Whole days are kept or replaced, never spliced. */
export function importBackup(raw: unknown, policy: "keep" | "import", includeProgram: boolean) {
  const b = raw as Partial<GymBackup>;
  if (!b || b.format !== "fitness-grid-workouts" || (b.version !== 1 && b.version !== 2)) throw new Error("That isn't a gym backup file.");
  const issues: string[] = [];
  const log = sanitizeLog(b.log, issues);
  const plan = includeProgram ? sanitizePlan(b.program) : null;
  const metrics: DailyMetrics = {};
  for (const [date, value] of Object.entries(b.dailyMetrics ?? {})) {
    const m = isIsoDate(date) ? cleanDayMetrics(value) : null;
    if (m) metrics[date] = m;
  }
  return mutate((s) => {
    const conflicts = Object.keys(log).filter((d) => s.log[d]).length;
    s.log = policy === "keep" ? { ...log, ...s.log } : { ...s.log, ...log };
    s.metrics = policy === "keep" ? { ...metrics, ...s.metrics } : { ...s.metrics, ...metrics };
    if (plan) {
      s.program = plan;
      s.programs = [plan, ...s.programs.filter((p) => p.id !== plan.id)].slice(0, 30);
    }
    return { days: Object.keys(log).length, conflicts, skipped: issues.length, program: !!plan };
  }, ["log", "metrics", "program", "programs"]);
}

// ------------------------------------------------------------ backup files

export function lastExportedAt(): string | null {
  try {
    return localStorage.getItem(EXPORTED_KEY);
  } catch {
    return null;
  }
}

function markExported() {
  try {
    localStorage.setItem(EXPORTED_KEY, new Date().toISOString());
  } catch {
    /* ignore */
  }
}

/**
 * Save a backup file. On phones this opens the share sheet ("Save to Files",
 * AirDrop, Messages…); elsewhere it downloads. Returns how it was handed over,
 * or null if the person closed the share sheet without saving.
 */
export async function downloadBackup(): Promise<"shared" | "downloaded" | null> {
  const name = `gym-backup-${isoDate(new Date())}.json`;
  const text = JSON.stringify(exportBackup(getGymState(true)), null, 1);
  const file = new File([text], name, { type: "application/json" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "Gym backup" });
      markExported();
      return "shared";
    } catch (error) {
      if ((error as Error).name === "AbortError") return null;
      // Fall through to a plain download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  markExported();
  return "downloaded";
}

/** Ask the browser not to clear this site's storage when the phone runs low on space. */
export function requestPersistentStorage() {
  try {
    void navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* not supported */
  }
}
