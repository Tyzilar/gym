"use client";

import { useMemo, useState } from "react";
import { fromIso, isCounted, isoDate, readableDate, startOfWeek, weeklyVolume, weightWeeklyAverages } from "@/lib/gym/domain";
import { fmtVolume, kg, relative, setLabel } from "@/lib/format";
import { exerciseStats } from "@/lib/progress";
import { useGym } from "@/components/gym/GymProvider";
import { BarChart, LineChart } from "@/components/charts";
import { NavBar, Row, Section, Segmented, Sheet, parseNum } from "@/components/ui";

const WEEKS = 12;
const short = (iso: string) => readableDate(iso, { day: "numeric", month: "short" });

export default function ProgressTab() {
  const { state, today, library, saveMetrics } = useGym();
  const [metric, setMetric] = useState<"workouts" | "volume">("workouts");
  const [weighing, setWeighing] = useState(false);
  const [weight, setWeight] = useState("");
  const [allExercises, setAllExercises] = useState(false);

  const weeks = useMemo(() => weeklyVolume(state.log, today, WEEKS), [state.log, today]);
  const stats = useMemo(() => exerciseStats(state.log, today), [state.log, today]);
  const weights = useMemo(() => weightWeeklyAverages(state.metrics, today).slice(-WEEKS), [state.metrics, today]);
  const latestWeight = useMemo(
    () =>
      Object.entries(state.metrics)
        .filter(([d, m]) => d <= today && m.bodyMassKg !== undefined)
        .sort(([a], [b]) => b.localeCompare(a))[0],
    [state.metrics, today],
  );
  const anyWorkout = Object.values(state.log).some(isCounted);

  // Average over the weeks since the first workout in the window (not all 12 when you've just started).
  const first = weeks.findIndex((w) => w.sessions > 0);
  const active = first === -1 ? [] : weeks.slice(first);
  const avgSessions = active.length ? active.reduce((n, w) => n + w.sessions, 0) / active.length : 0;
  const avgVolume = active.length ? active.reduce((n, w) => n + w.kg, 0) / active.length : 0;
  const thisWeekStart = isoDate(startOfWeek(fromIso(today)));

  const saveWeight = () => {
    const v = parseNum(weight);
    if (v === undefined || Number.isNaN(v) || v < 20 || v > 400) return;
    void saveMetrics(today, { bodyMassKg: Math.round(v * 10) / 10 });
    setWeighing(false);
    setWeight("");
  };

  return (
    <main className="page">
      <NavBar title="Progress" />

      {!anyWorkout ? (
        <Section>
          <div className="empty">
            <p className="t-title3">Nothing to show yet</p>
            <p className="t-subhead c-2 mt-2">Finish a workout and your weekly count, best lifts and history appear here.</p>
          </div>
        </Section>
      ) : (
        <Section>
          <div className="px-4 pt-4">
            <Segmented
              label="Chart"
              value={metric}
              onChange={setMetric}
              options={[
                { value: "workouts", label: "Workouts" },
                { value: "volume", label: "Weight Lifted" },
              ]}
            />
          </div>
          <BarChart
            key={metric}
            data={weeks.map((w, i) => ({
              // Month name under the first week of each month.
              label: i === 0 || w.week.slice(5, 7) !== weeks[i - 1].week.slice(5, 7) ? fromIso(w.week).toLocaleDateString("en-AU", { month: "short" }) : "",
              value: metric === "workouts" ? w.sessions : w.kg,
              detail: w.week === thisWeekStart ? "This week" : `Week of ${short(w.week)}`,
            }))}
            summary={
              metric === "workouts"
                ? { value: `${avgSessions.toFixed(1)} a week`, caption: `Average since ${short(weeks[Math.max(0, first)].week)}` }
                : { value: fmtVolume(avgVolume), caption: "Average a week" }
            }
            format={(v) => (metric === "workouts" ? `${Math.round(v)} ${Math.round(v) === 1 ? "workout" : "workouts"}` : fmtVolume(v))}
          />
        </Section>
      )}

      {stats.length > 0 && (
        <Section title="Exercises" footer="Most recent first. Best set compares weight and reps together, so 30 kg × 10 beats 32.5 kg × 5.">
          {(allExercises ? stats : stats.slice(0, 8)).map((s) => (
            <Row
              key={s.id}
              href={`/progress/exercise?id=${encodeURIComponent(s.id)}`}
              title={library[s.id]?.name ?? s.id}
              sub={`Best ${setLabel(s.best)}`}
              detail={relative(s.lastDate, today)}
              chevron
            />
          ))}
          {stats.length > 8 && <Row title={allExercises ? "Show Fewer" : `Show All ${stats.length} Exercises`} tone="action" onClick={() => setAllExercises(!allExercises)} />}
        </Section>
      )}

      <Section title="Body weight">
        {weights.length > 1 && (
          <LineChart
            caption="Weekly average"
            data={weights.map((w) => ({ x: short(w.week), y: Math.round(w.average * 10) / 10, detail: `Week of ${short(w.week)}, ${w.count} weigh-${w.count === 1 ? "in" : "ins"}` }))}
            format={(v) => `${kg(Math.round(v * 10) / 10)} kg`}
          />
        )}
        {latestWeight && weights.length <= 1 && <Row title="Latest" detail={`${kg(latestWeight[1].bodyMassKg!)} kg, ${relative(latestWeight[0], today).toLowerCase()}`} />}
        <Row title="Log Today's Weight" tone="action" onClick={() => setWeighing(true)} />
      </Section>

      <Sheet open={weighing} title="Body Weight" onClose={() => setWeighing(false)} done={{ label: "Save", onClick: saveWeight, disabled: !(Number(parseNum(weight)) >= 20) }}>
        <Section footer={`Saved for ${readableDate(today)}. Weigh in a few times a week and a weekly trend appears.`}>
          <label className="row">
            <span className="row-main">Weight</span>
            <input
              className="field num !w-28 text-right"
              inputMode="decimal"
              autoFocus
              placeholder={latestWeight ? kg(latestWeight[1].bodyMassKg!) : "0"}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveWeight()}
              aria-label="Body weight in kg"
            />
            <span className="c-2">kg</span>
          </label>
        </Section>
      </Sheet>
    </main>
  );
}
