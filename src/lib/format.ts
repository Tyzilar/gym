import { fromIso, parseTarget, readableDate, setDone } from "./gym/domain";
import type { DayRecord, ExerciseTarget, SetRecord } from "./gym/types";

export function workoutSummary(day: DayRecord) {
  const sets = day.exercises.flatMap((e) => e.sets).filter(setDone);
  const volume = sets.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
  const start = Date.parse(day.startedAt ?? "");
  const end = Date.parse(day.completedAt ?? "");
  const minutes = day.minutes ?? (Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 60000) : null);
  return { sets: sets.length, volume, minutes, exercises: day.exercises.filter((e) => e.sets.some(setDone)).length };
}

export const durationLabel = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`);

export const kg = (n: number) => `${Number.isInteger(n) ? n : Math.round(n * 10) / 10}`;

export const fmtVolume = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)} t` : `${Math.round(n).toLocaleString("en-AU")} kg`);

/** "22.5 kg × 10", "12 reps", "45 s" */
export function setLabel(s: SetRecord) {
  const result = s.seconds !== undefined ? `${s.seconds} s` : `${s.reps ?? 0}`;
  if (s.weightKg) return `${kg(s.weightKg)} kg × ${result}`;
  return s.seconds !== undefined ? result : `${result} reps`;
}

/** "3 × 8–10", "3 × 30–45 s", "3 × 10–12 each side" */
export function targetText(t: ExerciseTarget) {
  const p = parseTarget(t.targetReps);
  const range = t.targetReps.replace("/side", "").replace("s", "").replace("-", "–");
  if (!p) return `${t.targetSets} × ${t.targetReps}`;
  return `${t.targetSets} × ${range}${p.timed ? " s" : ""}${p.perSide ? " each side" : ""}`;
}

export function summaryLine(day: DayRecord) {
  const s = workoutSummary(day);
  const parts: string[] = [];
  if (s.minutes) parts.push(durationLabel(s.minutes));
  parts.push(`${s.sets} ${s.sets === 1 ? "set" : "sets"}`);
  if (s.volume) parts.push(fmtVolume(s.volume));
  return parts.join(", ");
}

export const shortDay = (iso: string) => readableDate(iso, { weekday: "short", day: "numeric", month: "short" });
export const monthLabel = (iso: string) => fromIso(iso).toLocaleDateString("en-AU", { month: "long", year: "numeric" });

export function relative(iso: string, today: string) {
  const days = Math.round((fromIso(today).getTime() - fromIso(iso).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return readableDate(iso, { day: "numeric", month: "short" });
}

export const newId = (base: string) => `${base}-${Date.now().toString(36)}`;

export function slug(label: string, taken: string[]) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "session";
  let id = /^[a-z0-9]/.test(base) ? base : `s-${base}`;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

/** Program templates: session names only — exercises are added in Program. */
export const TEMPLATES = [
  { id: "full-body-3", title: "Full Body", perWeek: 3, detail: "Every muscle three times a week, shorter sessions.", sessions: ["Full Body A", "Full Body B", "Full Body C"] },
  { id: "upper-lower-4", title: "Upper / Lower", perWeek: 4, detail: "Two upper and two lower sessions.", sessions: ["Upper A", "Lower A", "Upper B", "Lower B"] },
  { id: "ppl-3", title: "Push / Pull / Legs", perWeek: 3, detail: "Each movement family once a week.", sessions: ["Push", "Pull", "Legs"] },
  { id: "ppl-6", title: "Push / Pull / Legs × 2", perWeek: 6, detail: "The same rotation twice a week.", sessions: ["Push A", "Pull A", "Legs A", "Push B", "Pull B", "Legs B"] },
  { id: "full-body-2", title: "Full Body, 2 days", perWeek: 2, detail: "For busy weeks.", sessions: ["Full Body A", "Full Body B"] },
  { id: "body-part-5", title: "Body-part split", perWeek: 5, detail: "One muscle group a day.", sessions: ["Chest", "Back", "Legs", "Shoulders", "Arms + Abs"] },
];
