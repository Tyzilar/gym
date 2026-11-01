"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { readableDate } from "@/lib/gym/domain";
import { kg, setLabel } from "@/lib/format";
import { exerciseSeries, exerciseStats } from "@/lib/progress";
import { useGym } from "@/components/gym/GymProvider";
import { LineChart } from "@/components/charts";
import ExerciseInfo from "@/components/ExerciseInfo";
import { NavBar, Row, Section } from "@/components/ui";

export default function ExercisePage() {
  return (
    <Suspense fallback={null}>
      <ExerciseRoute />
    </Suspense>
  );
}

function ExerciseRoute() {
  const id = useSearchParams().get("id") ?? "";
  return <ExerciseProgress key={id} id={id} />;
}

function ExerciseProgress({ id }: { id: string }) {
  const { state, today, library } = useGym();
  const [info, setInfo] = useState(false);
  const name = library[id]?.name ?? "Exercise";
  const series = useMemo(() => exerciseSeries(state.log, id, today), [state.log, id, today]);
  const stat = useMemo(() => exerciseStats(state.log, today).find((s) => s.id === id), [state.log, today, id]);
  const weighted = series.some((p) => p.set.weightKg);
  const timed = series.some((p) => p.set.seconds !== undefined);

  return (
    <main className="page">
      <NavBar title={name} back={{ label: "Progress", href: "/progress" }} right={library[id] ? <button type="button" className="bar-btn" onClick={() => setInfo(true)}>How To</button> : null} />

      {!stat ? (
        <p className="empty t-subhead c-2">No finished sets of this exercise yet.</p>
      ) : (
        <>
          <Section>
            <Row title="Best set" detail={setLabel(stat.best)} />
            {stat.e1rm && <Row title="Estimated one-rep max" detail={`${kg(Math.round(stat.e1rm * 10) / 10)} kg`} />}
            <Row title="Workouts" detail={stat.sessions} />
          </Section>

          {series.length > 1 && (
            <Section title={weighted ? "Strength" : timed ? "Longest hold" : "Most reps"} footer={weighted ? "Each point is that workout's best set as an estimated one-rep max, so heavier weights and extra reps both count." : undefined}>
              <LineChart
                caption={weighted ? "Estimated one-rep max" : "Best set"}
                data={series.map((p) => ({ x: readableDate(p.date, { day: "numeric", month: "short" }), y: Math.round(p.value * 10) / 10, detail: `${readableDate(p.date, { weekday: "short", day: "numeric", month: "short" })}: ${setLabel(p.set)}` }))}
                format={(v) => (weighted ? `${kg(v)} kg` : timed ? `${Math.round(v)} s` : `${Math.round(v)} reps`)}
              />
            </Section>
          )}

          <Section title="History">
            {[...series].reverse().map((p) => (
              <Row
                key={p.date}
                href={`/workout?d=${p.date}&from=history`}
                title={readableDate(p.date, { weekday: "short", day: "numeric", month: "short", year: p.date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" })}
                sub={p.sets.map(setLabel).join(", ")}
                chevron
              />
            ))}
          </Section>
        </>
      )}

      <ExerciseInfo id={info ? id : null} onClose={() => setInfo(false)} />
    </main>
  );
}
