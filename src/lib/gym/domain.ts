// Pure gym logic shared by the server store and the browser. Ported from the
// Fitness Grid Expo app's tested domain modules (workout, exerciseActions,
// progression, streaks, achievements, calendarColours, targets), with the
// audit fixes folded in:
//   P0-4  one bad set no longer drops a whole day (sanitizeDay quarantines it)
//   P2-2  an opened-but-empty workout is drawn as an outline, not a trained day
//   P2-3  a "finished" workout with zero completed sets doesn't count
//   P2-4  lift awards only count completed sets with reps, on exact exercise ids
//   P2-5  editing the program keeps its id, so progression advice survives
//   P2-6  swaps also offer same-muscle alternatives, not only an exact pattern
//   P2-7  sessions are free-form, so any split can be logged under its own name

import {
  WORKOUT_SCHEMA_VERSION,
  type DailyMetrics,
  type DayRecord,
  type ExerciseInfo,
  type ExerciseRecord,
  type ExerciseStatus,
  type ExerciseTarget,
  type GymSettings,
  type MetricName,
  METRIC_LIMITS,
  type PlanExercise,
  type SessionDef,
  type SetRecord,
  type TrainingLog,
  type TrainingPlan,
} from "./types";

// ---------------------------------------------------------------- dates

export function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
}

/** Local noon on that date (noon keeps DST shifts from flipping the day). */
export function fromIso(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

/** Monday-start weeks (AU). */
export function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(12, 0, 0, 0);
  return addDays(start, -((start.getDay() + 6) % 7));
}

export function readableDate(value: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat("en-AU", opts).format(fromIso(value));
}

export function relativeDay(value: string, today: string) {
  if (value === today) return "Today";
  if (value === isoDate(addDays(fromIso(today), -1))) return "Yesterday";
  const diff = Math.round((fromIso(today).getTime() - fromIso(value).getTime()) / 86_400_000);
  if (diff > 1 && diff < 7) return readableDate(value, { weekday: "long" });
  return readableDate(value, { day: "numeric", month: "short" });
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- targets

/** "8-10", "12", "10-12/side", "30-45s/side", "60s/side" */
export function parseTarget(text: string) {
  const match = /^(\d+)(?:-(\d+))?(s)?(\/side)?$/.exec(text.trim());
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2] ?? match[1]);
  if (min < 1 || max < min || max > 3600) return null;
  return { min, max, timed: !!match[3], perSide: !!match[4] };
}

export function targetLabel(t: ExerciseTarget) {
  const parsed = parseTarget(t.targetReps);
  const reps = parsed?.timed ? t.targetReps.replace("/side", " / side") : `${t.targetReps.replace("/side", "")} reps${parsed?.perSide ? " / side" : ""}`;
  return `${t.targetSets} × ${reps}`;
}

// ---------------------------------------------------------------- sessions & colours

export const SESSION_PALETTE = ["#3B82C4", "#D98E2B", "#2FA9A0", "#E0642B", "#8B6CF0", "#D9508A", "#5FAF5A", "#C9A227"];
export const REST_COLOR = "#5b5f6b";

/** The four Upper/Lower ids the Expo app used, with their prefs.json colours. */
export const LEGACY_SESSIONS: Record<string, { label: string; color: string }> = {
  upperA: { label: "Upper A", color: "#3B82C4" },
  lowerA: { label: "Lower A", color: "#D98E2B" },
  upperB: { label: "Upper B", color: "#2FA9A0" },
  lowerB: { label: "Lower B", color: "#E0642B" },
};

export function sessionInfo(plan: TrainingPlan, day: Pick<DayRecord, "session" | "sessionLabel" | "sessionColor">) {
  if (day.session === "rest") return { label: "Rest", color: REST_COLOR };
  const def = plan.sessions.find((s) => s.id === day.session);
  return {
    label: def?.label ?? day.sessionLabel ?? LEGACY_SESSIONS[day.session]?.label ?? day.session,
    color: def?.color ?? day.sessionColor ?? LEGACY_SESSIONS[day.session]?.color ?? "#7c8494",
  };
}

export function hexToRgb(hex: string) {
  const c = hex.replace("#", "");
  return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16) };
}

/** Mix toward the dark background (0 = background, 1 = full colour). */
export function shade(hex: string, amount: number, toward = "#17171d") {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  const mix = (x: number, y: number) => Math.round(y + (x - y) * amount).toString(16).padStart(2, "0");
  return `#${mix(a.r, b.r)}${mix(a.g, b.g)}${mix(a.b, b.b)}`;
}

export function averageRpe(day: DayRecord) {
  const rpes = day.exercises.flatMap((e) => e.sets).filter((s) => s.completedAt && s.rpe !== undefined).map((s) => s.rpe!);
  return rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : undefined;
}

/** Grid cell look for a day. Harder sessions (higher average RPE) are more saturated. */
export function dayCell(plan: TrainingPlan, day: DayRecord | undefined): { fill: string; outline?: string } | null {
  if (!day) return null;
  const { color } = sessionInfo(plan, day);
  if (day.status === "rest") return { fill: shade(REST_COLOR, 0.9) };
  if (day.status === "draft" || !isCounted(day)) return { fill: "transparent", outline: color };
  const rpe = averageRpe(day);
  const strength = rpe === undefined ? 0.85 : rpe <= 6 ? 0.6 : rpe <= 8 ? 0.85 : 1;
  return { fill: shade(color, strength) };
}

// ---------------------------------------------------------------- validation

const STATUSES = new Set(["draft", "completed", "rest"]);
const EX_STATUSES = new Set<ExerciseStatus>(["planned", "in_progress", "completed", "skipped", "stopped"]);
const SIDES = new Set(["both", "left", "right"]);
const ID_RE = /^[A-Za-z0-9][\w-]{0,79}$/;

const num = (v: unknown, min: number, max = Number.POSITIVE_INFINITY) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
const isoStamp = (v: unknown) => (typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v)) ? v : undefined);

function cleanSet(raw: unknown): SetRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const id = str(s.id, 80);
  if (!id) return null;
  const set: SetRecord = { id };
  const weightKg = num(s.weightKg, 0, 1000);
  const reps = num(s.reps, 0, 1000);
  const seconds = num(s.seconds, 0, 36_000);
  const rpe = num(s.rpe, 0, 10);
  if (weightKg !== undefined) set.weightKg = weightKg;
  if (reps !== undefined) set.reps = reps;
  if (seconds !== undefined) set.seconds = seconds;
  if (rpe !== undefined) set.rpe = rpe;
  if (typeof s.side === "string" && SIDES.has(s.side)) set.side = s.side as SetRecord["side"];
  const completedAt = isoStamp(s.completedAt);
  if (completedAt) set.completedAt = completedAt;
  return set;
}

function cleanTarget(raw: unknown): ExerciseTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const targetSets = num(t.targetSets, 0, 50);
  const targetReps = str(t.targetReps, 30);
  if (targetSets === undefined || targetReps === undefined) return null;
  return { targetSets: Math.round(targetSets), targetReps, targetRpe: t.targetRpe === null ? null : num(t.targetRpe, 0, 10) ?? null };
}

function cleanExercise(raw: unknown, issues: string[]): ExerciseRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const exerciseId = str(e.exerciseId, 80);
  const target = cleanTarget(e.target);
  if (!exerciseId || !ID_RE.test(exerciseId) || !target) return null;
  const rawSets = Array.isArray(e.sets) ? e.sets.slice(0, 60) : [];
  const sets = rawSets.map(cleanSet).filter((s): s is SetRecord => !!s);
  if (sets.length !== rawSets.length) issues.push(`Dropped ${rawSets.length - sets.length} unreadable set(s) from ${exerciseId}.`);
  const status = EX_STATUSES.has(e.status as ExerciseStatus) ? (e.status as ExerciseStatus) : "planned";
  const record: ExerciseRecord = { exerciseId, status, target, sets };
  const note = str(e.note, 2000);
  if (note) record.note = note;
  const subbedFrom = str(e.subbedFrom, 80);
  if (subbedFrom) record.subbedFrom = subbedFrom;
  const subReason = str(e.subReason, 200);
  if (subReason) record.subReason = subReason;
  if (e.stoppedReason === "pain" || e.stoppedReason === "substitution") {
    record.stoppedReason = e.stoppedReason;
    record.status = "stopped";
  }
  const stoppedAt = isoStamp(e.stoppedAt);
  if (stoppedAt) record.stoppedAt = stoppedAt;
  if (e.added === true) record.added = true;
  return record;
}

/**
 * Validate a day, keeping everything readable. Unlike the Expo app (which
 * dropped the whole day on one bad field), only the bad set/exercise goes.
 * Legacy Shortcut entries ({ session: "upperA" }) become completed days.
 */
export function sanitizeDay(raw: unknown, date: string, issues: string[] = []): DayRecord | null {
  if (!isIsoDate(date) || !raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const d = raw as Record<string, unknown>;
  const session = str(d.session, 40);
  if (!session || !(session === "rest" || ID_RE.test(session))) return null;
  let status = STATUSES.has(d.status as string) ? (d.status as DayRecord["status"]) : session === "rest" ? "rest" : "completed";
  if (session === "rest") status = "rest";
  else if (status === "rest") status = "completed";
  const rawExercises = Array.isArray(d.exercises) ? d.exercises.slice(0, 60) : [];
  const exercises = session === "rest" ? [] : rawExercises.map((e) => cleanExercise(e, issues)).filter((e): e is ExerciseRecord => !!e);
  if (exercises.length !== rawExercises.length && session !== "rest") issues.push(`Dropped ${rawExercises.length - exercises.length} unreadable exercise(s) on ${date}.`);
  const day: DayRecord = { schemaVersion: WORKOUT_SCHEMA_VERSION, date, session, status, exercises };
  const sessionLabel = str(d.sessionLabel, 60);
  if (sessionLabel) day.sessionLabel = sessionLabel;
  if (typeof d.sessionColor === "string" && /^#[0-9a-fA-F]{6}$/.test(d.sessionColor)) day.sessionColor = d.sessionColor;
  for (const key of ["programId", "programName"] as const) {
    const v = str(d[key], 120);
    if (v) day[key] = v;
  }
  for (const key of ["startedAt", "completedAt", "updatedAt"] as const) {
    const v = isoStamp(d[key]);
    if (v) day[key] = v;
  }
  const note = str(d.note, 4000);
  if (note) day.note = note;
  if (d.logged === true && session !== "rest") day.logged = true;
  const minutes = num(d.minutes, 1, 600);
  if (minutes !== undefined && session !== "rest") day.minutes = Math.round(minutes);
  if (d.health && typeof d.health === "object" && !Array.isArray(d.health)) day.health = d.health as Record<string, unknown>;
  return day;
}

export function sanitizeLog(raw: unknown, issues: string[] = []): TrainingLog {
  const log: TrainingLog = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return log;
  for (const [date, value] of Object.entries(raw)) {
    const day = sanitizeDay(value, date, issues);
    if (day) log[date] = day;
    else issues.push(`Skipped unreadable entry for ${date}.`);
  }
  return log;
}

function cleanPlanExercise(raw: unknown): PlanExercise | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const id = str(e.id, 80);
  const target = cleanTarget(e);
  if (!id || !ID_RE.test(id) || !target || target.targetSets < 1 || !parseTarget(target.targetReps)) return null;
  const item: PlanExercise = { id, ...target };
  const inc = num(e.incrementKg, 0.01, 50);
  if (inc !== undefined) item.incrementKg = inc;
  return item;
}

/** Accepts the new array form and the Expo app's { upperA: {...}, ... } object form. */
export function sanitizePlan(raw: unknown): TrainingPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = str(p.id, 120);
  const name = str(p.name, 120)?.trim();
  if (!id || !name) return null;
  let entries: [string, unknown][] = [];
  if (Array.isArray(p.sessions)) entries = p.sessions.map((s) => [str((s as Record<string, unknown>)?.id, 40) ?? "", s]);
  else if (p.sessions && typeof p.sessions === "object") entries = Object.entries(p.sessions);
  const sessions: SessionDef[] = [];
  for (const [sid, value] of entries.slice(0, 10)) {
    if (!sid || !ID_RE.test(sid) || sid === "rest" || sessions.some((s) => s.id === sid) || !value || typeof value !== "object") continue;
    const s = value as Record<string, unknown>;
    const label = str(s.label, 60)?.trim() || LEGACY_SESSIONS[sid]?.label || sid;
    const color =
      typeof s.color === "string" && /^#[0-9a-fA-F]{6}$/.test(s.color)
        ? s.color
        : LEGACY_SESSIONS[sid]?.color ?? SESSION_PALETTE[sessions.length % SESSION_PALETTE.length];
    const seen = new Set<string>();
    const exercises = (Array.isArray(s.exercises) ? s.exercises.slice(0, 40) : [])
      .map(cleanPlanExercise)
      .filter((e): e is PlanExercise => !!e && !seen.has(e.id) && !!seen.add(e.id));
    sessions.push({ id: sid, label, color, exercises });
  }
  if (!sessions.length) return null;
  return { id, name, confirmed: p.confirmed === true, sessions, updatedAt: isoStamp(p.updatedAt) };
}

export function cleanSettings(raw: unknown, base: GymSettings): GymSettings {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const next: GymSettings = { ...base };
  const weekly = num(s.weeklyTarget, 1, 7);
  if (weekly !== undefined) next.weeklyTarget = Math.round(weekly);
  const rolling = num(s.rollingTarget, 1, 28);
  if (rolling !== undefined) next.rollingTarget = Math.round(rolling);
  if (Array.isArray(s.shortlist)) next.shortlist = [...new Set(s.shortlist.filter((v): v is string => typeof v === "string" && ID_RE.test(v)))].slice(0, 200);
  if (s.restDefaults && typeof s.restDefaults === "object" && !Array.isArray(s.restDefaults)) {
    const rd: Record<string, number> = {};
    for (const [k, v] of Object.entries(s.restDefaults).slice(0, 300)) {
      const secs = num(v, 10, 900);
      if (ID_RE.test(k) && secs !== undefined) rd[k] = Math.round(secs);
    }
    next.restDefaults = rd;
  }
  if (s.bodySex === "male" || s.bodySex === "female") next.bodySex = s.bodySex;
  if (s.bodyMode === "beginner" || s.bodyMode === "pro") next.bodyMode = s.bodyMode;
  if (s.referencePlans && typeof s.referencePlans === "object") {
    const r = s.referencePlans as Record<string, unknown>;
    next.referencePlans = { training: str(r.training, 60), meal: str(r.meal, 60) };
  }
  return next;
}

export function cleanDayMetrics(raw: unknown): import("./types").DayMetrics | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: import("./types").DayMetrics = {};
  const sources: Partial<Record<MetricName, string>> = {};
  const rawSources = r.sources && typeof r.sources === "object" ? (r.sources as Record<string, unknown>) : {};
  for (const key of Object.keys(METRIC_LIMITS) as MetricName[]) {
    const v = num(r[key], key === "bodyMassKg" ? 0.1 : 0, METRIC_LIMITS[key]);
    if (v === undefined) continue;
    out[key] = key === "steps" ? Math.round(v) : v;
    const src = str(rawSources[key], 120);
    if (src) sources[key] = src;
  }
  if (Object.keys(sources).length) out.sources = sources;
  return Object.keys(out).length ? out : null;
}

export function weightWeeklyAverages(metrics: DailyMetrics, today: string) {
  const buckets = new Map<string, number[]>();
  for (const [date, item] of Object.entries(metrics)) {
    if (date > today || item.bodyMassKg === undefined) continue;
    const key = isoDate(startOfWeek(fromIso(date)));
    buckets.set(key, [...(buckets.get(key) ?? []), item.bodyMassKg]);
  }
  return [...buckets]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, values]) => ({ week, count: values.length, average: values.reduce((a, b) => a + b, 0) / values.length }));
}

// ---------------------------------------------------------------- workout operations

export function createDraft(date: string, session: SessionDef, plan: TrainingPlan, now = new Date().toISOString()): DayRecord {
  return {
    schemaVersion: WORKOUT_SCHEMA_VERSION,
    date,
    session: session.id,
    sessionLabel: session.label,
    sessionColor: session.color,
    status: "draft",
    programId: plan.id,
    programName: plan.name,
    startedAt: now,
    exercises: session.exercises.map((e) => ({
      exerciseId: e.id,
      status: "planned",
      target: { targetSets: e.targetSets, targetReps: e.targetReps, targetRpe: e.targetRpe },
      sets: Array.from({ length: e.targetSets }, (_, i) => ({ id: `${e.id}-${i + 1}` })),
    })),
  };
}

/**
 * A workout logged after the fact: marked done straight away, no start time
 * (so no timer), with the session's exercises ready for sets if you remember them.
 */
export function createLoggedDay(date: string, session: SessionDef, plan: TrainingPlan, minutes?: number, now = new Date().toISOString()): DayRecord {
  const { startedAt: _startedAt, ...draft } = createDraft(date, session, plan, now);
  void _startedAt;
  const day: DayRecord = { ...draft, status: "completed", logged: true, completedAt: now };
  if (minutes && minutes > 0) day.minutes = Math.round(minutes);
  return day;
}

export function createRestDay(date: string): DayRecord {
  return { schemaVersion: WORKOUT_SCHEMA_VERSION, date, session: "rest", status: "rest", completedAt: new Date().toISOString(), exercises: [] };
}

export const setDone = (s: SetRecord) => !!s.completedAt && ((s.reps ?? 0) > 0 || (s.seconds ?? 0) > 0);

export function canEdit(e: ExerciseRecord) {
  return e.status !== "stopped" && e.status !== "skipped";
}

function withStatus(e: ExerciseRecord): ExerciseRecord {
  if (!canEdit(e)) return e;
  const done = e.sets.filter(setDone).length;
  const status: ExerciseStatus = e.sets.length > 0 && done === e.sets.length ? "completed" : done > 0 || e.sets.some((s) => s.weightKg !== undefined || s.reps !== undefined) ? "in_progress" : "planned";
  return { ...e, status };
}

export function updateExercise(day: DayRecord, index: number, fn: (e: ExerciseRecord) => ExerciseRecord): DayRecord {
  return { ...day, exercises: day.exercises.map((e, i) => (i === index ? fn(e) : e)) };
}

export function editSet(e: ExerciseRecord, set: SetRecord): ExerciseRecord {
  if (!canEdit(e)) return e;
  return withStatus({ ...e, sets: e.sets.map((s) => (s.id === set.id ? set : s)) });
}

export function addSet(e: ExerciseRecord): ExerciseRecord {
  if (!canEdit(e)) return e;
  const last = e.sets.at(-1);
  // Carry the last set's weight forward: the next set is usually the same load.
  const next: SetRecord = { id: `${e.exerciseId}-${Date.now().toString(36)}` };
  if (last?.weightKg !== undefined) next.weightKg = last.weightKg;
  if (last?.side) next.side = last.side;
  return withStatus({ ...e, sets: [...e.sets, next] });
}

export function removeSet(e: ExerciseRecord, id: string): ExerciseRecord {
  if (!canEdit(e) || e.sets.length <= 1) return e;
  return withStatus({ ...e, sets: e.sets.filter((s) => s.id !== id) });
}

export function setSkipped(e: ExerciseRecord, skipped: boolean): ExerciseRecord {
  if (e.stoppedReason) return e;
  return skipped ? { ...e, status: "skipped" } : withStatus({ ...e, status: "planned" });
}

export function recordPain(e: ExerciseRecord, now = new Date().toISOString()): ExerciseRecord {
  return { ...e, status: "stopped", stoppedReason: "pain", stoppedAt: e.stoppedAt ?? now };
}

const FAMILIES: Record<string, string> = {
  "horizontal-push": "chest", "incline-push": "chest", "chest-adduction": "chest", "incline-chest-adduction": "chest",
  "vertical-push": "shoulders", "shoulder-isolation": "shoulders",
  "rear-delt-isolation": "upper-back", "scapular-raise": "upper-back", "scapular-elevation": "upper-back",
  "horizontal-pull": "back", "vertical-pull": "back", "shoulder-extension": "back",
  "elbow-flexion": "biceps",
  "elbow-extension": "triceps", "overhead-elbow-extension": "triceps", "lying-elbow-extension": "triceps",
  squat: "quads", "single-leg-squat": "quads", "knee-extension": "quads",
  "knee-flexion": "hamstrings", "hip-hinge": "hamstrings",
  "hip-extension": "glutes", "hip-abduction": "glutes",
  "ankle-extension": "calves",
  "anti-extension-core": "core", "anti-rotation-core": "core", "anti-lateral-flexion-core": "core",
  "spinal-flexion-core": "core", "hip-flexion-core": "core", "rotation-core": "core",
  mobility: "mobility",
  "chest-dip": "chest",
  "hip-adduction": "adductors",
  "ankle-dorsiflexion": "calves",
  "wrist-flexion": "forearms",
  carry: "core",
  cardio: "cardio",
};

/** Library sections for browsing and filtering pickers, in display order. */
export const EXERCISE_SECTIONS = [
  { id: "chest", label: "Chest", families: ["chest"] },
  { id: "back", label: "Back", families: ["back", "upper-back"] },
  { id: "shoulders", label: "Shoulders", families: ["shoulders"] },
  { id: "arms", label: "Arms", families: ["biceps", "triceps", "forearms"] },
  { id: "legs", label: "Legs", families: ["quads", "hamstrings", "glutes", "calves", "adductors"] },
  { id: "core", label: "Core", families: ["core"] },
  { id: "cardio", label: "Cardio & mobility", families: ["cardio", "mobility"] },
] as const;
export type ExerciseSectionId = (typeof EXERCISE_SECTIONS)[number]["id"];

export function exerciseSection(info: ExerciseInfo | undefined): ExerciseSectionId {
  const family = FAMILIES[info?.pattern ?? ""] ?? "";
  return EXERCISE_SECTIONS.find((s) => (s.families as readonly string[]).includes(family))?.id ?? "core";
}

/** Sensible starting target when an exercise is added by hand. */
export function defaultTarget(info: ExerciseInfo | undefined): ExerciseTarget {
  if (info?.pattern === "cardio") return { targetSets: 1, targetReps: "1200s", targetRpe: null };
  if (info?.pattern === "carry" || (info?.pattern === "anti-extension-core" && /plank/i.test(info.name))) return { targetSets: 3, targetReps: "30-45s", targetRpe: null };
  return { targetSets: 3, targetReps: "8-10", targetRpe: null };
}

/**
 * Alternatives for a swap: the exercise's listed substitutes first, then the
 * same movement pattern, then the same muscle family — never one already in
 * this workout. A content filter, not a claim a movement is safe for pain.
 */
export function substitutionOptions(day: DayRecord, exerciseId: string, library: Record<string, ExerciseInfo>) {
  const source = library[exerciseId];
  if (!source) return [];
  const existing = new Set(day.exercises.map((e) => e.exerciseId));
  const family = FAMILIES[source.pattern ?? ""];
  const ordered = [
    ...(source.substitutes ?? []),
    ...Object.keys(library).filter((id) => library[id].pattern === source.pattern),
    ...Object.keys(library).filter((id) => family && FAMILIES[library[id].pattern ?? ""] === family),
  ];
  return [...new Set(ordered)].filter((id) => id !== exerciseId && library[id] && !existing.has(id));
}

export function substituteExercise(day: DayRecord, index: number, replacementId: string, reason: string, now = new Date().toISOString()): DayRecord {
  const source = day.exercises[index];
  if (!source || day.session === "rest") return day;
  if (day.exercises.some((e) => e.subbedFrom === source.exerciseId)) return day;
  const replacement: ExerciseRecord = {
    exerciseId: replacementId,
    status: "planned",
    target: { ...source.target },
    sets: Array.from({ length: Math.max(1, source.target.targetSets) }, (_, i) => ({ id: `${replacementId}-${i + 1}` })),
    subbedFrom: source.exerciseId,
    subReason: source.stoppedReason === "pain" ? "Pain" : reason,
  };
  // Keep the original sets and stop event; never move performance onto a different exercise.
  const stopped: ExerciseRecord = { ...source, status: "stopped", stoppedReason: source.stoppedReason ?? "substitution", stoppedAt: source.stoppedAt ?? now };
  return { ...day, exercises: day.exercises.flatMap((e, i) => (i === index ? [stopped, replacement] : [e])) };
}

export function addExerciseToDay(day: DayRecord, id: string, target: ExerciseTarget = { targetSets: 3, targetReps: "8-10", targetRpe: null }): DayRecord {
  if (day.exercises.some((e) => e.exerciseId === id)) return day;
  return {
    ...day,
    exercises: [
      ...day.exercises,
      { exerciseId: id, status: "planned", target, sets: Array.from({ length: target.targetSets }, (_, i) => ({ id: `${id}-${i + 1}` })), added: true },
    ],
  };
}

// ---------------------------------------------------------------- counting & streaks

/** A finished workout counts once at least one set was actually done (legacy session-only days count too). */
export function isCounted(day: DayRecord | undefined) {
  if (!day || day.status !== "completed") return false;
  if (day.exercises.length === 0 || day.logged) return true;
  return day.exercises.some((e) => e.sets.some(setDone));
}

/**
 * A day you actually trained (for training-day nutrition targets): a counted
 * workout, or one in progress. Rest days and abandoned/empty sessions don't qualify.
 */
export function isTrainingDay(day: DayRecord | undefined) {
  return !!day && day.session !== "rest" && (day.status === "draft" || isCounted(day));
}

export function countInRange(log: TrainingLog, from: string, to: string) {
  let n = 0;
  for (const [date, day] of Object.entries(log)) if (date >= from && date <= to && isCounted(day)) n++;
  return n;
}

export function rollingCount(log: TrainingLog, today: string, days = 28) {
  return countInRange(log, isoDate(addDays(fromIso(today), -(days - 1))), today);
}

export function weekCount(log: TrainingLog, today: string) {
  return countInRange(log, isoDate(startOfWeek(fromIso(today))), today);
}

/** Consecutive weeks hitting the target. The current week counts once hit, and never breaks the streak while in progress. */
export function weeklyStreak(log: TrainingLog, today: string, target: number) {
  let weekStart = startOfWeek(fromIso(today));
  let streak = 0;
  for (let offset = 0; offset < 260; offset++) {
    const end = offset === 0 ? today : isoDate(addDays(weekStart, 6));
    const count = countInRange(log, isoDate(weekStart), end);
    if (count >= target) streak++;
    else if (offset > 0) break;
    weekStart = addDays(weekStart, -7);
  }
  return streak;
}

/** Next session in rotation: the one after the most recently completed session of this program. */
export function nextSession(plan: TrainingPlan, log: TrainingLog, today: string) {
  const ids = plan.sessions.map((s) => s.id);
  const dates = Object.keys(log).filter((d) => d <= today).sort().reverse();
  const lastDone: Record<string, string> = {};
  let latest: string | undefined;
  for (const date of dates) {
    const day = log[date];
    if (!isCounted(day) || !ids.includes(day.session)) continue;
    lastDone[day.session] ??= date;
    latest ??= day.session;
  }
  const index = latest ? (ids.indexOf(latest) + 1) % ids.length : 0;
  return { session: plan.sessions[index], lastDone };
}

// ---------------------------------------------------------------- history, progression & PRs

export function lastPerformance(log: TrainingLog, beforeDate: string, exerciseId: string) {
  const dates = Object.keys(log).filter((d) => d < beforeDate).sort().reverse();
  for (const date of dates) {
    const day = log[date];
    if (day.status !== "completed") continue;
    const e = day.exercises.find((x) => x.exerciseId === exerciseId);
    if (e && e.sets.some(setDone)) return { date, sets: e.sets.filter(setDone) };
  }
  return null;
}

export function formatSet(s: SetRecord) {
  const result = s.seconds !== undefined ? `${s.seconds}s` : `${s.reps ?? "—"}`;
  const side = s.side && s.side !== "both" ? ` ${s.side[0].toUpperCase()}` : "";
  const rpe = s.rpe !== undefined ? ` @${s.rpe}` : "";
  return s.weightKg !== undefined && s.weightKg > 0 ? `${s.weightKg}×${result}${side}${rpe}` : `${result}${s.seconds === undefined ? " reps" : ""}${side}${rpe}`;
}

export function exerciseHistory(log: TrainingLog, exerciseId: string, beforeDate = "9999-12-31", completedOnly = true) {
  return Object.entries(log)
    .filter(([date, day]) => date < beforeDate && (completedOnly ? day.status === "completed" : day.session !== "rest"))
    .sort(([a], [b]) => b.localeCompare(a))
    .flatMap(([date, day]) =>
      day.exercises.filter((e) => e.exerciseId === exerciseId).map((exercise) => ({ date, exercise, programId: day.programId, dayStatus: day.status })),
    );
}

function qualifiedWeight(e: ExerciseRecord, target: ExerciseTarget): number | null {
  const range = parseTarget(target.targetReps);
  if (!range || range.timed || e.status !== "completed" || e.subbedFrom || e.stoppedReason) return null;
  if (e.target.targetSets !== target.targetSets || e.target.targetReps !== target.targetReps || e.target.targetRpe !== target.targetRpe) return null;
  const sets = e.sets;
  if (sets.length === 0) return null;
  if (range.perSide) {
    const both = sets.filter((s) => s.side === "both" || s.side === undefined);
    if (both.length !== sets.length) {
      if (both.length || sets.filter((s) => s.side === "left").length < target.targetSets || sets.filter((s) => s.side === "right").length < target.targetSets) return null;
    } else if (sets.length < target.targetSets) return null;
  } else if (sets.length < target.targetSets || sets.some((s) => s.side === "left" || s.side === "right")) return null;
  const weight = sets[0].weightKg;
  if (weight === undefined || weight <= 0) return null;
  return sets.every(
    (s) =>
      !!s.completedAt &&
      s.weightKg === weight &&
      s.seconds === undefined &&
      Number.isInteger(s.reps) &&
      (s.reps ?? 0) >= range.max &&
      (target.targetRpe === null || (s.rpe !== undefined && s.rpe <= target.targetRpe)),
  )
    ? weight
    : null;
}

/** Progression rule: two consecutive completed exposures at the top of the range, same weight, within RPE — then add weight. */
export function progressionAdvice(
  log: TrainingLog,
  exerciseId: string,
  target: ExerciseTarget,
  beforeDate: string,
  programId: string | undefined,
  incrementKg: number | undefined,
  confirmed: boolean,
): { eligible: boolean; message: string; nextWeight?: number } {
  if (!confirmed) return { eligible: false, message: "Confirm your program in Program to turn on progression suggestions." };
  if (parseTarget(target.targetReps)?.timed) return { eligible: false, message: "Timed work — tracked in history, no weight suggestions." };
  if (!incrementKg) return { eligible: false, message: "Set a kg increment for this exercise in Program to get weight suggestions." };
  const lastTwo = exerciseHistory(log, exerciseId, beforeDate, false).slice(0, 2);
  if (lastTwo.length < 2 || lastTwo.some((x) => x.programId !== programId || x.dayStatus !== "completed"))
    return { eligible: false, message: "Two completed sessions on this program are needed before adding weight." };
  const weights = lastTwo.map((x) => qualifiedWeight(x.exercise, target));
  if (weights[0] === null || weights[1] === null || weights[0] !== weights[1])
    return { eligible: false, message: "Hold the weight: both last sessions need every set at the top of the range, same weight, within target RPE." };
  const next = Math.round((weights[0] + incrementKg) * 100) / 100;
  return { eligible: true, message: `Go up to ${next} kg (+${incrementKg}) — earned on ${readableDate(lastTwo[1].date, { day: "numeric", month: "short" })} and ${readableDate(lastTwo[0].date, { day: "numeric", month: "short" })}.`, nextWeight: next };
}

export const e1rm = (weight: number, reps: number) => (reps <= 1 ? weight : weight * (1 + reps / 30));

export type PersonalBest = { exerciseId: string; weight: number; reps: number; date: string; e1rm: number; sessions: number };

export function personalBests(log: TrainingLog, today: string): PersonalBest[] {
  const best = new Map<string, PersonalBest>();
  const sessions = new Map<string, Set<string>>();
  for (const [date, day] of Object.entries(log)) {
    if (date > today || day.status !== "completed") continue;
    for (const e of day.exercises) {
      if (e.stoppedReason === "pain") continue;
      for (const s of e.sets) {
        if (!setDone(s) || !s.weightKg || !s.reps) continue;
        (sessions.get(e.exerciseId) ?? sessions.set(e.exerciseId, new Set()).get(e.exerciseId)!).add(date);
        const score = e1rm(s.weightKg, s.reps);
        const current = best.get(e.exerciseId);
        if (!current || score > current.e1rm) best.set(e.exerciseId, { exerciseId: e.exerciseId, weight: s.weightKg, reps: s.reps, date, e1rm: score, sessions: 0 });
      }
    }
  }
  return [...best.values()].map((b) => ({ ...b, sessions: sessions.get(b.exerciseId)?.size ?? 0 })).sort((a, b) => b.date.localeCompare(a.date));
}

/** Total kg moved (weight × reps of completed sets) per Monday-start week. */
export function weeklyVolume(log: TrainingLog, today: string, weeks = 12) {
  const start = addDays(startOfWeek(fromIso(today)), -7 * (weeks - 1));
  const out = Array.from({ length: weeks }, (_, i) => ({ week: isoDate(addDays(start, 7 * i)), kg: 0, sessions: 0 }));
  for (const [date, day] of Object.entries(log)) {
    if (date > today || !isCounted(day)) continue;
    const idx = Math.floor((fromIso(date).getTime() - start.getTime()) / (7 * 86_400_000));
    if (idx < 0 || idx >= weeks) continue;
    out[idx].sessions++;
    for (const e of day.exercises) for (const s of e.sets) if (setDone(s) && s.weightKg && s.reps) out[idx].kg += s.weightKg * s.reps;
  }
  return out;
}

export function exerciseTrend(log: TrainingLog, exerciseId: string, today: string) {
  return Object.entries(log)
    .filter(([date, day]) => date <= today && day.status === "completed")
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, day]) => {
      const e = day.exercises.find((x) => x.exerciseId === exerciseId);
      if (!e) return [];
      const done = e.sets.filter((s) => setDone(s) && s.weightKg && s.reps);
      if (!done.length) return [];
      return [{ date, best: Math.max(...done.map((s) => e1rm(s.weightKg!, s.reps!))), top: Math.max(...done.map((s) => s.weightKg!)) }];
    });
}

// ---------------------------------------------------------------- awards

export type Award = { id: string; title: string; detail: string; icon: string; unlocked: boolean; progress: number; progressLabel: string };

const LIFT_IDS: Record<string, string[]> = {
  bench: ["barbell-bench-press", "bench-press", "flat-barbell-bench-press"],
  squat: ["barbell-back-squat", "back-squat", "barbell-squat", "squat"],
  deadlift: ["deadlift", "conventional-deadlift", "sumo-deadlift"],
};

function maxLift(log: TrainingLog, ids: string[], today: string) {
  let max = 0;
  for (const [date, day] of Object.entries(log)) {
    if (date > today || day.status !== "completed") continue;
    for (const e of day.exercises) if (ids.includes(e.exerciseId)) for (const s of e.sets) if (setDone(s) && (s.reps ?? 0) > 0) max = Math.max(max, s.weightKg ?? 0);
  }
  return max;
}

function backToBackPb(log: TrainingLog, today: string) {
  const perExercise = new Map<string, Map<string, number>>();
  for (const [date, day] of Object.entries(log)) {
    if (date > today || day.status !== "completed") continue;
    const week = isoDate(startOfWeek(fromIso(date)));
    for (const e of day.exercises) {
      const best = Math.max(0, ...e.sets.filter((s) => setDone(s) && (s.reps ?? 0) > 0).map((s) => s.weightKg ?? 0));
      if (!best) continue;
      const weeks = perExercise.get(e.exerciseId) ?? new Map<string, number>();
      weeks.set(week, Math.max(weeks.get(week) ?? 0, best));
      perExercise.set(e.exerciseId, weeks);
    }
  }
  for (const weeks of perExercise.values()) {
    const ordered = [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b));
    let lifetime = 0;
    let previousPb: string | null = null;
    for (const [week, best] of ordered) {
      if (best > lifetime) {
        // The first-ever week sets a baseline, it isn't a PB.
        if (lifetime > 0) {
          if (previousPb && isoDate(addDays(fromIso(previousPb), 7)) === week) return true;
          previousPb = week;
        }
        lifetime = best;
      }
    }
  }
  return false;
}

export function buildAwards(log: TrainingLog, today: string, streak: number, weeklyTarget: number): Award[] {
  const sessions = Object.entries(log).filter(([d, day]) => d <= today && isCounted(day)).length;
  const awards: Award[] = [
    { id: "first", title: "First rep", detail: "Finish your first workout", icon: "1", unlocked: sessions >= 1, progress: Math.min(1, sessions), progressLabel: `${Math.min(sessions, 1)}/1` },
    ...[10, 25, 50, 100, 250].map((t) => ({
      id: `sessions-${t}`, title: `${t} sessions`, detail: `Finish ${t} workouts`, icon: String(t),
      unlocked: sessions >= t, progress: Math.min(1, sessions / t), progressLabel: `${Math.min(sessions, t)}/${t}`,
    })),
    ...[4, 8, 12, 26].map((t) => ({
      id: `streak-${t}`, title: `${t}-week streak`, detail: `Train ${weeklyTarget}× a week, ${t} weeks running`, icon: "◆",
      unlocked: streak >= t, progress: Math.min(1, streak / t), progressLabel: `${Math.min(streak, t)}/${t} wks`,
    })),
  ];
  const pb = backToBackPb(log, today);
  awards.push({ id: "pb-run", title: "On a roll", detail: "Beat your best weight on a lift in back-to-back weeks", icon: "↗", unlocked: pb, progress: pb ? 1 : 0, progressLabel: pb ? "Done" : "Not yet" });
  for (const [lift, target, title] of [["bench", 100, "100 kg bench"], ["squat", 100, "100 kg squat"], ["squat", 140, "140 kg squat"], ["deadlift", 180, "180 kg deadlift"]] as const) {
    const best = maxLift(log, LIFT_IDS[lift], today);
    awards.push({ id: `${lift}-${target}`, title, detail: `Complete a set of ${lift} at ${target} kg`, icon: "KG", unlocked: best >= target, progress: Math.min(1, best / target), progressLabel: `${Math.min(best, target)}/${target} kg` });
  }
  return awards;
}

// ---------------------------------------------------------------- defaults

export const DEFAULT_SETTINGS: GymSettings = {
  weeklyTarget: 4,
  rollingTarget: 16,
  shortlist: [],
  restDefaults: {},
  bodySex: "male",
  bodyMode: "beginner",
};
