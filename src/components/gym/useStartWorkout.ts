"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { createDraft, createLoggedDay, nextSession } from "@/lib/gym/domain";
import { useGym } from "./GymProvider";

/**
 * Open a workout for a date (today by default). Resumes whatever is already
 * logged on that date; otherwise starts the given session, or the next one in
 * the rotation. A rest day is replaced, since training beats resting. Earlier
 * days are logged as done without a timer (you're filling them in after).
 */
export function useStartWorkout() {
  const { state, today, saveDay } = useGym();
  const router = useRouter();
  return useCallback(
    (sessionId?: string | React.SyntheticEvent, date: string = today) => {
      const id = typeof sessionId === "string" ? sessionId : undefined;
      const existing = state.log[date];
      const go = () => router.push(`/workout?d=${date}`);
      if (existing && existing.session !== "rest") return go();
      const session = state.program.sessions.find((s) => s.id === id) ?? nextSession(state.program, state.log, today).session;
      if (!session) return;
      saveDay(date < today ? createLoggedDay(date, session, state.program) : createDraft(date, session, state.program));
      go();
    },
    [state, today, saveDay, router],
  );
}
