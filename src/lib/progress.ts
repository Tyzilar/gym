import { e1rm, setDone } from "./gym/domain";
import type { SetRecord, TrainingLog } from "./gym/types";

export type ExerciseStat = {
  id: string;
  lastDate: string;
  sessions: number;
  /** Best set: heaviest by estimated one-rep max, or most reps/seconds when there's no weight. */
  best: SetRecord;
  bestDate: string;
  e1rm: number | null;
};

const score = (s: SetRecord) => (s.weightKg && s.reps ? e1rm(s.weightKg, s.reps) : 0);

/** Every exercise you've done, most recent first. */
export function exerciseStats(log: TrainingLog, today: string): ExerciseStat[] {
  const map = new Map<string, ExerciseStat>();
  const dates = Object.keys(log).filter((d) => d <= today).sort();
  for (const date of dates) {
    const day = log[date];
    if (day.status !== "completed") continue;
    for (const e of day.exercises) {
      const done = e.sets.filter(setDone);
      if (!done.length) continue;
      const stat = map.get(e.exerciseId) ?? { id: e.exerciseId, lastDate: date, sessions: 0, best: done[0], bestDate: date, e1rm: null };
      stat.sessions++;
      stat.lastDate = date;
      for (const s of done) {
        const better = score(s) > 0 ? score(s) > (stat.e1rm ?? 0) : !stat.e1rm && (s.reps ?? s.seconds ?? 0) > (stat.best.reps ?? stat.best.seconds ?? 0);
        if (better) {
          stat.best = s;
          stat.bestDate = date;
          stat.e1rm = score(s) || stat.e1rm;
        }
      }
      if (stat.e1rm === null && score(stat.best) > 0) stat.e1rm = score(stat.best);
      map.set(e.exerciseId, stat);
    }
  }
  return [...map.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

/** One point per workout: the day's best set for this exercise. */
export function exerciseSeries(log: TrainingLog, id: string, today: string) {
  return Object.keys(log)
    .filter((d) => d <= today && log[d].status === "completed")
    .sort()
    .flatMap((date) => {
      const e = log[date].exercises.find((x) => x.exerciseId === id);
      const done = e?.sets.filter(setDone) ?? [];
      if (!done.length) return [];
      const weighted = done.filter((s) => s.weightKg && s.reps);
      if (weighted.length) {
        const top = weighted.reduce((a, b) => (score(b) > score(a) ? b : a));
        return [{ date, value: score(top), set: top, sets: done }];
      }
      const top = done.reduce((a, b) => ((b.reps ?? b.seconds ?? 0) > (a.reps ?? a.seconds ?? 0) ? b : a));
      return [{ date, value: top.reps ?? top.seconds ?? 0, set: top, sets: done }];
    });
}
