"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addDays, createLoggedDay, fromIso, isoDate, nextSession, readableDate } from "@/lib/gym/domain";
import { useGym } from "./gym/GymProvider";
import { CheckIcon } from "./icons";
import { Section, Sheet, parseNum } from "./ui";

/** Add a workout you did earlier: pick the day and session, then fill in the sets. */
export default function LogPast({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, today, saveDay } = useGym();
  const router = useRouter();
  const [date, setDate] = useState(() => isoDate(addDays(fromIso(today), -1)));
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState("");

  const session = state.program.sessions.find((s) => s.id === sessionId) ?? nextSession(state.program, state.log, date).session;
  const existing = state.log[date];
  const clash = existing && existing.session !== "rest";
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today && !!session;

  const add = () => {
    if (!valid || !session) return;
    if (clash) {
      onClose();
      router.push(`/workout?d=${date}`);
      return;
    }
    const m = parseNum(minutes);
    saveDay(createLoggedDay(date, session, state.program, m && !Number.isNaN(m) ? m : undefined));
    onClose();
    router.push(`/workout?d=${date}`);
  };

  return (
    <Sheet open={open} title="Log Past Workout" onClose={onClose} done={{ label: clash ? "Open" : "Add", onClick: add, disabled: !valid }}>
      <Section label="Day" footer={clash ? `You already logged ${existing.sessionLabel ?? "a workout"} on ${readableDate(date)}. Open it to change it.` : undefined}>
        <label className="row">
          <span className="row-main">Date</span>
          <input
            type="date"
            className="field num !w-auto text-right c-tint"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Workout date"
          />
        </label>
        <label className="row">
          <span className="row-main">Duration</span>
          <input className="field num !w-20 text-right" inputMode="numeric" placeholder="Optional" value={minutes} onChange={(e) => setMinutes(e.target.value)} aria-label="Duration in minutes" />
          <span className="c-2">min</span>
        </label>
      </Section>
      {!clash && (
        <Section label="Session">
          {state.program.sessions.map((s) => (
            <button key={s.id} type="button" className="row" onClick={() => setSessionId(s.id)} aria-pressed={s.id === session?.id}>
              <span className="row-main">{s.label}</span>
              {s.id === session?.id && <CheckIcon className="c-tint" />}
            </button>
          ))}
        </Section>
      )}
    </Sheet>
  );
}
