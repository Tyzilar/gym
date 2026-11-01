"use client";

import { useMemo, useState } from "react";
import { isCounted, readableDate } from "@/lib/gym/domain";
import { monthLabel, summaryLine } from "@/lib/format";
import { useGym } from "@/components/gym/GymProvider";
import { useStartWorkout } from "@/components/gym/useStartWorkout";
import LogPast from "@/components/LogPast";
import { PlusIcon } from "@/components/icons";
import { NavBar, Row, Section } from "@/components/ui";

export default function HistoryTab() {
  const { state, today } = useGym();
  const start = useStartWorkout();
  const [logging, setLogging] = useState(false);

  const months = useMemo(() => {
    const days = Object.values(state.log)
      .filter((d) => d.session !== "rest" && (d.status === "draft" || isCounted(d) || d.status === "completed"))
      .sort((a, b) => b.date.localeCompare(a.date));
    const out: { label: string; days: typeof days }[] = [];
    for (const d of days) {
      const label = monthLabel(d.date);
      if (out.at(-1)?.label !== label) out.push({ label, days: [] });
      out.at(-1)!.days.push(d);
    }
    return out;
  }, [state.log]);

  const total = months.reduce((n, m) => n + m.days.filter(isCounted).length, 0);

  return (
    <main className="page">
      <NavBar
        title="History"
        subtitle={total ? `${total} ${total === 1 ? "workout" : "workouts"}` : undefined}
        right={
          <button type="button" className="bar-btn" aria-label="Log a past workout" onClick={() => setLogging(true)}>
            <PlusIcon size={24} />
          </button>
        }
      />

      {months.length === 0 && (
        <div className="empty">
          <p className="t-title3">No workouts yet</p>
          <p className="t-subhead c-2 mt-2 mb-5">Finished workouts show up here, newest first.</p>
          <button type="button" className="btn btn-filled" onClick={() => start()}>
            Start a Workout
          </button>
        </div>
      )}

      {months.map((m) => (
        <Section key={m.label} label={m.label}>
          {m.days.map((d) => (
            <Row
              key={d.date}
              href={`/workout?d=${d.date}&from=history`}
              title={<span className="t-headline">{d.sessionLabel ?? "Workout"}</span>}
              sub={d.status === "draft" ? <span className="c-orange">In progress</span> : summaryLine(d)}
              detail={d.date === today ? "Today" : readableDate(d.date, { weekday: "short", day: "numeric" })}
              chevron
            />
          ))}
        </Section>
      ))}

      <LogPast open={logging} onClose={() => setLogging(false)} />
    </main>
  );
}
