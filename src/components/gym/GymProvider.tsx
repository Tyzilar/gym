"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import exercises from "@/lib/gym/exercises.json";
import { isoDate } from "@/lib/gym/domain";
import type { DayMetrics, DayRecord, ExerciseInfo, GymSettings, GymState, TrainingPlan } from "@/lib/gym/types";
import * as store from "@/lib/gym/localStore";

export const LIBRARY = exercises as Record<string, ExerciseInfo>;

type SaveStatus = "idle" | "saving" | "error";

type GymContext = {
  state: GymState;
  today: string;
  library: Record<string, ExerciseInfo>;
  saveStatus: SaveStatus;
  saveError: string | null;
  /** Optimistic; debounced per day so typing a set doesn't send a request per keystroke. */
  saveDay: (day: DayRecord) => void;
  deleteDay: (date: string) => Promise<void>;
  saveProgram: (plan: TrainingPlan) => Promise<TrainingPlan>;
  activateProgram: (id: string) => Promise<void>;
  deleteProgram: (id: string) => Promise<void>;
  saveSettings: (patch: Partial<GymSettings>) => Promise<void>;
  saveMetrics: (date: string, metrics: DayMetrics | null) => Promise<void>;
  reload: () => Promise<void>;
  retry: () => void;
};

const Ctx = createContext<GymContext | null>(null);

export function useGym() {
  const value = useContext(Ctx);
  if (!value) throw new Error("useGym must be used inside GymProvider");
  return value;
}

/** Copy for React state (the store mutates its own copy in place). */
function snapshot(): GymState {
  return structuredClone(store.getGymState(true));
}

export default function GymProvider({ children }: { children: React.ReactNode }) {
  // Saved on this phone, so nothing can be read until the page is running in the browser.
  const [state, setState] = useState<GymState | null>(null);
  const [today, setToday] = useState(() => isoDate(new Date()));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const pending = useRef(new Map<string, DayRecord>());
  const timer = useRef<number | null>(null);
  const inFlight = useRef(0);

  // Local "today" (the phone's own calendar), refreshed on wake and each minute.
  useEffect(() => {
    const tick = () => setToday((t) => (t === isoDate(new Date()) ? t : isoDate(new Date())));
    tick();
    const id = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const batch = [...pending.current.values()];
    if (!batch.length) return;
    pending.current.clear();
    inFlight.current++;
    setSaveStatus("saving");
    try {
      for (const day of batch) store.saveDay(day.date, day);
      setSaveError(null);
      setSaveStatus(pending.current.size ? "saving" : "idle");
    } catch (error) {
      // Put them back (unless a newer edit already replaced them) so nothing typed is lost.
      for (const day of batch) if (!pending.current.has(day.date)) pending.current.set(day.date, day);
      setSaveError((error as Error).message || "couldn't save on this phone");
      setSaveStatus("error");
    } finally {
      inFlight.current--;
    }
  }, []);

  const schedule = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 450);
  }, [flush]);

  // Phones kill backgrounded web apps: push anything unsaved the moment the page hides.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flush]);

  // First load: read what's saved on this phone, and ask the browser to keep it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(snapshot());
    store.requestPersistentStorage();
  }, []);

  const reload = useCallback(async () => {
    if (pending.current.size || inFlight.current) return;
    const next = snapshot();
    setState((current) => (current && JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, []);

  // Another tab of the app saved something: pick it up.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith("gym:v1:")) void reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [reload]);

  const saveDay = useCallback(
    (day: DayRecord) => {
      setState((s) => (s ? { ...s, log: { ...s.log, [day.date]: day } } : s));
      pending.current.set(day.date, day);
      setSaveStatus("saving");
      schedule();
    },
    [schedule],
  );

  const deleteDay = useCallback(async (date: string) => {
    pending.current.delete(date);
    setState((s) => {
      if (!s) return s;
      const log = { ...s.log };
      delete log[date];
      return { ...s, log };
    });
    store.deleteDay(date);
  }, []);

  const saveProgram = useCallback(async (plan: TrainingPlan) => {
    const program = structuredClone(store.saveProgram(plan));
    setState((s) => (s ? { ...s, program, programs: [program, ...s.programs.filter((p) => p.id !== program.id)] } : s));
    return program;
  }, []);

  const activateProgram = useCallback(async (id: string) => {
    setState((s) => {
      const plan = s?.programs.find((p) => p.id === id);
      return s && plan ? { ...s, program: plan, programs: [plan, ...s.programs.filter((p) => p.id !== id)] } : s;
    });
    store.activateProgram(id);
  }, []);

  const deleteProgram = useCallback(async (id: string) => {
    store.deleteProgram(id);
    setState((s) => (s ? { ...s, programs: s.programs.filter((p) => p.id !== id) } : s));
  }, []);

  const saveSettings = useCallback(async (patch: Partial<GymSettings>) => {
    setState((s) => (s ? { ...s, settings: { ...s.settings, ...patch } } : s));
    const settings = structuredClone(store.saveSettings(patch));
    setState((s) => (s ? { ...s, settings } : s));
  }, []);

  const saveMetrics = useCallback(async (date: string, metrics: DayMetrics | null) => {
    const next = structuredClone(store.saveMetrics(date, metrics));
    setState((s) => (s ? { ...s, metrics: next } : s));
  }, []);

  const value = useMemo<GymContext | null>(
    () =>
      state && {
      state,
      today,
      library: LIBRARY,
      saveStatus,
      saveError,
      saveDay,
      deleteDay,
      saveProgram,
      activateProgram,
      deleteProgram,
      saveSettings,
      saveMetrics,
      reload,
      retry: () => void flush(),
    },
    [state, today, saveStatus, saveError, saveDay, deleteDay, saveProgram, activateProgram, deleteProgram, saveSettings, saveMetrics, reload, flush],
  );

  if (!value) {
    return (
      <div className="min-h-dvh" aria-busy="true">
        <span className="sr-only">Loading your workouts…</span>
      </div>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
