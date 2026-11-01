"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { addDays, createRestDay, fromIso, isCounted, isoDate, nextSession, readableDate, setDone, startOfWeek, weekCount } from "@/lib/gym/domain";
import { downloadBackup, lastExportedAt } from "@/lib/gym/localStore";
import { relative, summaryLine, targetText } from "@/lib/format";
import { useGym } from "@/components/gym/GymProvider";
import { useStartWorkout } from "@/components/gym/useStartWorkout";
import LogPast from "@/components/LogPast";
import { CloseIcon, ShareIcon } from "@/components/icons";
import { NavBar, Row, Section } from "@/components/ui";

const DAY = 86_400_000;
const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function WeekStrip() {
  const { state, today } = useGym();
  const router = useRouter();
  const monday = startOfWeek(fromIso(today));
  return (
    <div className="week px-2 py-3">
      {LETTERS.map((letter, i) => {
        const date = isoDate(addDays(monday, i));
        const day = state.log[date];
        const done = isCounted(day);
        const stateName = done ? "done" : date === today ? "today" : day?.status === "rest" ? "rest" : "none";
        const label = `${readableDate(date)}${done ? `, ${day!.sessionLabel ?? "workout"}` : day?.status === "rest" ? ", rest day" : ""}`;
        return (
          <button
            key={date}
            type="button"
            className="flex flex-col items-center disabled:cursor-default"
            disabled={!day || day.session === "rest"}
            onClick={() => router.push(`/workout?d=${date}`)}
            aria-label={label}
          >
            <span className="t-caption2 c-2 font-semibold">{letter}</span>
            <span className="week-dot" data-state={stateName}>
              {fromIso(date).getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function WorkoutTab() {
  const { state, today, library, saveDay, deleteDay } = useGym();
  const start = useStartWorkout();
  const router = useRouter();
  const [logging, setLogging] = useState(false);
  const [env, setEnv] = useState<{ installed: boolean; ios: boolean; hideInstall: boolean; backupDue: boolean } | null>(null);
  const [backupMsg, setBackupMsg] = useState("");

  const { program, log, settings } = state;
  const todayDay = log[today];
  const { session: next, lastDone } = useMemo(() => nextSession(program, log, today), [program, log, today]);
  const thisWeek = weekCount(log, today);
  const workouts = useMemo(() => Object.values(log).filter(isCounted).length, [log]);

  // "?start=1" (home-screen shortcut) jumps straight into the next workout.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("start") === "1") start();
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const last = lastExportedAt();
    const snoozed = Number(read("gym:v1:backupSnoozedUntil") ?? 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnv({
      installed: nav.standalone === true || !!window.matchMedia?.("(display-mode: standalone)").matches,
      ios: /iPhone|iPad|iPod/.test(navigator.userAgent),
      hideInstall: read("gym:v1:installHintHidden") !== null,
      backupDue: workouts >= 4 && (!last || Date.now() - Date.parse(last) > 30 * DAY) && Date.now() > snoozed,
    });
  }, [workouts]);

  const inProgress = todayDay?.status === "draft";
  const doneToday = isCounted(todayDay);
  const restToday = todayDay?.status === "rest";
  const others = program.sessions.filter((s) => s.id !== next?.id);

  return (
    <main className="page">
      <NavBar title="Workout" subtitle={readableDate(today)} />

      {env && !env.installed && !env.hideInstall && (
        <Section>
          <div className="row">
            <span className="row-icon">
              <ShareIcon size={18} strokeWidth={2} />
            </span>
            <span className="row-main">
              <span className="row-title t-headline">Add Gym to your Home Screen</span>
              <span className="row-sub">
                {env.ios ? "In Safari, tap Share, then Add to Home Screen." : "Open the browser menu, then Add to Home screen."} It opens full screen and works without signal.
              </span>
            </span>
            <button
              type="button"
              className="self-start p-1 c-3"
              aria-label="Hide this tip"
              onClick={() => {
                write("gym:v1:installHintHidden", "1");
                setEnv((e) => (e ? { ...e, hideInstall: true } : e));
              }}
            >
              <CloseIcon />
            </button>
          </div>
        </Section>
      )}

      {env?.backupDue && (
        <Section footer={backupMsg || `${workouts} workouts are saved only on this phone. Keep a copy in Files or iCloud Drive.`}>
          <Row
            title="Back Up Your Workouts"
            tone="action"
            onClick={async () => {
              const how = await downloadBackup();
              if (how) {
                setBackupMsg("Backup saved.");
                window.setTimeout(() => setEnv((e) => (e ? { ...e, backupDue: false } : e)), 1600);
              }
            }}
          />
          <Row
            title="Remind Me Later"
            onClick={() => {
              write("gym:v1:backupSnoozedUntil", String(Date.now() + 14 * DAY));
              setEnv((e) => (e ? { ...e, backupDue: false } : e));
            }}
          />
        </Section>
      )}

      {inProgress && todayDay && (
        <Section title="In progress">
          <div className="card-pad">
            <p className="t-title2">{todayDay.sessionLabel ?? "Workout"}</p>
            <p className="t-subhead c-2 mt-1 num">
              {(() => {
                const all = todayDay.exercises.flatMap((e) => e.sets);
                const started = todayDay.startedAt ? new Date(todayDay.startedAt).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }) : null;
                return `${started ? `Started ${started}. ` : ""}${all.filter(setDone).length} of ${all.length} sets done.`;
              })()}
            </p>
            <button type="button" className="btn btn-filled btn-block mt-4" onClick={() => router.push(`/workout?d=${today}`)}>
              Resume Workout
            </button>
          </div>
        </Section>
      )}

      {doneToday && todayDay && (
        <Section title="Today">
          <Row title={<span className="t-headline">{todayDay.sessionLabel ?? "Workout"}</span>} sub={summaryLine(todayDay)} detail={<span className="c-green font-semibold">Done</span>} chevron href={`/workout?d=${today}`} />
        </Section>
      )}

      {!inProgress && !doneToday && next && (
        <Section title={restToday ? "Rest day" : "Up next"} action={restToday ? <button type="button" className="link-btn t-subhead" onClick={() => void deleteDay(today)}>Undo Rest Day</button> : undefined}>
          <div className="card-pad pb-2">
            <p className="t-title2">{next.label}</p>
            <p className="t-subhead c-2 mt-1">
              {next.exercises.length} {next.exercises.length === 1 ? "exercise" : "exercises"}
              {lastDone[next.id] ? `, last done ${relative(lastDone[next.id], today).toLowerCase()}` : ""}
            </p>
          </div>
          {next.exercises.map((e) => (
            <div key={e.id} className="row !min-h-0 !py-2.5">
              <span className="row-main t-subhead">{library[e.id]?.name ?? nameOf(e.id)}</span>
              <span className="row-detail t-subhead">{targetText(e)}</span>
            </div>
          ))}
          {next.exercises.length === 0 && (
            <div className="row">
              <span className="row-main t-subhead c-2">No exercises yet. Add some in Program.</span>
            </div>
          )}
          <div className="card-pad pt-3">
            <button type="button" className="btn btn-filled btn-block" onClick={() => start(next.id)}>
              Start Workout
            </button>
          </div>
        </Section>
      )}

      {doneToday && next && (
        <Section label="Next time">
          <Row title={next.label} detail={`${next.exercises.length} exercises`} />
        </Section>
      )}

      <Section title="This week" action={<span className="t-subhead c-2 num">{thisWeek} of {settings.weeklyTarget} workouts</span>}>
        <WeekStrip />
      </Section>

      {!inProgress && !doneToday && others.length > 0 && (
        <Section label="Start a different session">
          {others.map((s) => (
            <Row key={s.id} title={s.label} sub={lastDone[s.id] ? `Last done ${relative(lastDone[s.id], today).toLowerCase()}` : "Not done yet"} chevron onClick={() => start(s.id)} />
          ))}
        </Section>
      )}

      <Section>
        <Row title="Log a Past Workout" tone="action" onClick={() => setLogging(true)} />
        {!todayDay && <Row title="Make Today a Rest Day" tone="action" onClick={() => saveDay(createRestDay(today))} />}
      </Section>

      {workouts === 0 && (
        <p className="section-foot -mt-5 mx-4">
          Your workouts are saved on this phone. Change your sessions and exercises in <Link href="/program" className="c-tint">Program</Link>.
        </p>
      )}

      <LogPast open={logging} onClose={() => setLogging(false)} />
    </main>
  );
}

function nameOf(id: string) {
  return id.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
