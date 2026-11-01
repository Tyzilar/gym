"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  addExerciseToDay,
  addSet,
  canEdit,
  defaultTarget,
  e1rm,
  editSet,
  isIsoDate,
  lastPerformance,
  parseTarget,
  personalBests,
  readableDate,
  removeSet,
  setDone,
  setSkipped,
  substituteExercise,
  substitutionOptions,
  updateExercise,
} from "@/lib/gym/domain";
import type { DayRecord, ExerciseRecord, SetRecord } from "@/lib/gym/types";
import { durationLabel, fmtVolume, kg, setLabel, targetText, workoutSummary } from "@/lib/format";
import { adjustRest, chime, fmtClock, skipRest, startRest, useRest } from "@/lib/restTimer";
import { useGym } from "@/components/gym/GymProvider";
import ExercisePicker from "@/components/ExercisePicker";
import ExerciseInfo from "@/components/ExerciseInfo";
import { CheckIcon, MoreIcon, PlusIcon } from "@/components/icons";
import { ActionSheet, NavBar, Row, Section, Sheet, parseNum, type Action } from "@/components/ui";

const REST_CHOICES = [60, 90, 120, 180];

// Static site: the date rides in the query string (/workout?d=2026-11-01).
export default function WorkoutPage() {
  return (
    <Suspense fallback={null}>
      <WorkoutRoute />
    </Suspense>
  );
}

function WorkoutRoute() {
  const params = useSearchParams();
  const date = params.get("d") ?? "";
  const from = params.get("from") === "history" ? "history" : "workout";
  // A different date is a different workout: start fresh, like a new page.
  return <Workout key={date} date={date} from={from} />;
}

function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [on]);
  return now;
}

// ------------------------------------------------------------------ one set

function SetRow({
  set,
  index,
  timed,
  prev,
  editable,
  onChange,
  onTick,
}: {
  set: SetRecord;
  index: number;
  timed: boolean;
  prev?: SetRecord;
  editable: boolean;
  onChange: (s: SetRecord) => void;
  onTick: (resultInput: HTMLInputElement | null) => void;
}) {
  const [w, setW] = useState(set.weightKg?.toString() ?? "");
  const [r, setR] = useState((timed ? set.seconds : set.reps)?.toString() ?? "");
  const resultRef = useRef<HTMLInputElement>(null);
  const done = !!set.completedAt;

  // Follow changes made elsewhere (ticking fills the fields) without
  // clobbering a half-typed "22." that already equals 22.
  const [seen, setSeen] = useState(set);
  if (seen !== set) {
    setSeen(set);
    const same = (text: string, v: number | undefined) => {
      const n = parseNum(text);
      return (n === undefined || Number.isNaN(n) ? undefined : n) === v;
    };
    if (!same(w, set.weightKg)) setW(set.weightKg?.toString() ?? "");
    const result = timed ? set.seconds : set.reps;
    if (!same(r, result)) setR(result?.toString() ?? "");
  }

  const commit = (nw: string, nr: string) => {
    const weight = parseNum(nw);
    const result = parseNum(nr);
    const next: SetRecord = { id: set.id };
    if (weight !== undefined && !Number.isNaN(weight)) next.weightKg = weight;
    if (result !== undefined && !Number.isNaN(result)) next[timed ? "seconds" : "reps"] = Math.round(result);
    if (set.side) next.side = set.side;
    if (set.rpe !== undefined) next.rpe = set.rpe;
    // Clearing the result un-ticks the set.
    if (set.completedAt && (next.reps ?? next.seconds ?? 0) > 0) next.completedAt = set.completedAt;
    onChange(next);
  };

  const prevResult = timed ? prev?.seconds : prev?.reps;
  return (
    <div className="sets-grid set-row" data-done={done}>
      <span className="set-num">{index + 1}</span>
      <span className="set-prev">{prev ? (prev.weightKg ? `${kg(prev.weightKg)} × ${prevResult ?? "–"}` : `${prevResult ?? "–"}${timed ? " s" : ""}`) : "–"}</span>
      <input
        className="set-input"
        inputMode="decimal"
        enterKeyHint="next"
        placeholder={prev?.weightKg ? kg(prev.weightKg) : ""}
        value={w}
        disabled={!editable}
        onChange={(e) => {
          setW(e.target.value);
          commit(e.target.value, r);
        }}
        onKeyDown={(e) => e.key === "Enter" && resultRef.current?.focus()}
        aria-label={`Set ${index + 1} weight in kg`}
      />
      <input
        ref={resultRef}
        className="set-input"
        inputMode="numeric"
        enterKeyHint="done"
        placeholder={prevResult !== undefined ? String(prevResult) : ""}
        value={r}
        disabled={!editable}
        onChange={(e) => {
          setR(e.target.value);
          commit(w, e.target.value);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-label={`Set ${index + 1} ${timed ? "seconds" : "reps"}`}
      />
      <button type="button" className="check" aria-pressed={done} disabled={!editable} onClick={() => onTick(resultRef.current)} aria-label={done ? `Untick set ${index + 1}` : `Tick set ${index + 1} done`}>
        <CheckIcon size={17} strokeWidth={3} />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ one exercise

function ExerciseBlock({
  record,
  index,
  day,
  editable,
  onChange,
  onSetDone,
  onMenu,
  onInfo,
}: {
  record: ExerciseRecord;
  index: number;
  day: DayRecord;
  editable: boolean;
  onChange: (fn: (e: ExerciseRecord) => ExerciseRecord) => void;
  onSetDone: (i: number) => void;
  onMenu: () => void;
  onInfo: () => void;
}) {
  const { state, library } = useGym();
  const info = library[record.exerciseId];
  const range = parseTarget(record.target.targetReps);
  const timed = !!range?.timed;
  const last = useMemo(() => lastPerformance(state.log, day.date, record.exerciseId), [state.log, day.date, record.exerciseId]);
  const skipped = record.status === "skipped";

  return (
    <section className="section" id={`ex-${index}`}>
      <div className="group">
        <div className="flex items-start gap-2 pl-4 pr-1.5 pt-3 pb-1">
          <button type="button" className="min-w-0 flex-1 text-left" onClick={onInfo}>
            <span className="block t-headline c-tint">{info?.name ?? record.exerciseId}</span>
            <span className="block t-subhead c-2">
              {targetText(record.target)}
              {last ? `. Last time ${readableDate(last.date, { day: "numeric", month: "short" })}` : ""}
            </span>
          </button>
          {editable && (
            <button type="button" className="bar-btn !min-h-9 !px-2" aria-label={`Options for ${info?.name ?? "exercise"}`} onClick={onMenu}>
              <MoreIcon />
            </button>
          )}
        </div>

        {skipped ? (
          <div className="row">
            <span className="row-main t-subhead c-2">Skipped</span>
            {editable && (
              <button type="button" className="link-btn t-subhead" onClick={() => onChange((e) => setSkipped(e, false))}>
                Undo
              </button>
            )}
          </div>
        ) : (
          <div className="sets">
            <div className="sets-grid sets-head">
              <span>Set</span>
              <span>Previous</span>
              <span>kg</span>
              <span>{timed ? "Sec" : "Reps"}</span>
              <span aria-hidden />
            </div>
            {record.sets.map((set, i) => (
              <SetRow
                key={set.id}
                set={set}
                index={i}
                timed={timed}
                prev={last?.sets[i]}
                editable={editable}
                onChange={(next) => onChange((e) => editSet(e, next))}
                onTick={(resultInput) => {
                  if (set.completedAt) {
                    const next = { ...set };
                    delete next.completedAt;
                    onChange((e) => editSet(e, next));
                    return;
                  }
                  // Ticking an empty set uses last time's numbers.
                  const prev = last?.sets[i] ?? last?.sets.at(-1);
                  const filled: SetRecord = { ...set, completedAt: new Date().toISOString() };
                  if (filled.weightKg === undefined && prev?.weightKg !== undefined) filled.weightKg = prev.weightKg;
                  const key = timed ? "seconds" : "reps";
                  if (filled[key] === undefined && prev?.[key] !== undefined) filled[key] = prev[key];
                  if (!filled[key]) {
                    resultInput?.focus();
                    return;
                  }
                  if (range?.perSide && !filled.side) filled.side = "both";
                  onChange((e) => editSet(e, filled));
                  onSetDone(index);
                }}
              />
            ))}
            {editable && (
              <div className="px-3 pt-2">
                <button type="button" className="btn btn-gray btn-block !min-h-9 !rounded-lg t-subhead !font-semibold" onClick={() => onChange(addSet)}>
                  <PlusIcon size={16} /> Add Set
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ rest timer

function RestBar() {
  const rest = useRest();
  const fired = useRef<number | null>(null);
  useEffect(() => {
    if (rest && rest.left === 0 && fired.current !== rest.endsAt) {
      fired.current = rest.endsAt;
      chime();
    }
  }, [rest]);
  if (!rest) return null;
  const over = rest.left === 0;
  return (
    <div className="rest" role="timer" aria-live="off" data-over={over}>
      <div className="min-w-0 flex-1">
        <div className="rest-time">{over ? "Go" : fmtClock(rest.left)}</div>
        <div className="t-footnote c-2 truncate">{over ? "Rest over" : `Rest${rest.label ? `, then ${rest.label}` : ""}`}</div>
      </div>
      {!over && (
        <>
          <button type="button" className="btn btn-gray btn-small num" onClick={() => adjustRest(-15)} aria-label="15 seconds less">
            −15
          </button>
          <button type="button" className="btn btn-gray btn-small num" onClick={() => adjustRest(15)} aria-label="15 seconds more">
            +15
          </button>
        </>
      )}
      <button type="button" className="btn btn-filled btn-small" onClick={skipRest}>
        {over ? "Done" : "Skip"}
      </button>
      <div className="rest-bar" style={{ width: `${over ? 100 : Math.min(100, ((rest.total - rest.left) / Math.max(1, rest.total)) * 100)}%` }} />
    </div>
  );
}

// ------------------------------------------------------------------ the workout

function Workout({ date, from }: { date: string; from: "history" | "workout" }) {
  const router = useRouter();
  const { state, today, library, saveDay, saveSettings, deleteDay } = useGym();
  const day = isIsoDate(date) ? state.log[date] : undefined;
  const live = day?.status === "draft" && !day.logged;
  const now = useNow(live);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [restFor, setRestFor] = useState<number | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<null | "empty" | "discard" | "delete">(null);
  const [finished, setFinished] = useState<null | { prs: { id: string; label: string }[] }>(null);
  const [note, setNote] = useState(day?.note ?? "");
  const [minutes, setMinutes] = useState(day?.minutes?.toString() ?? "");

  const back = from === "history" ? { label: "History", href: "/history" } : { label: "Workout", href: "/" };

  const pbsBefore = useMemo(() => {
    const before = Object.fromEntries(Object.entries(state.log).filter(([d]) => d < date));
    return new Map(personalBests(before, today).map((p) => [p.exerciseId, p.e1rm]));
    // Only the history before this workout matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, today]);

  if (!day || day.session === "rest") {
    return (
      <main className="page page--bare">
        <NavBar title="Workout" large={false} back={back} />
        <div className="empty">
          <p className="t-title3">No workout on {isIsoDate(date) ? readableDate(date) : "this day"}</p>
          <p className="t-subhead c-2 mt-2">Start one from the Workout tab, or log a past workout there.</p>
        </div>
      </main>
    );
  }

  const editable = true;
  const restSeconds = (id: string) => state.settings.restDefaults[id] ?? state.settings.restDefaults.default ?? 90;
  const change = (i: number, fn: (e: ExerciseRecord) => ExerciseRecord) => saveDay(updateExercise(day, i, fn));
  // Sets still to do, plus any finished before an exercise was swapped out.
  const allSets = day.exercises.flatMap((e) => (canEdit(e) ? e.sets : e.sets.filter(setDone)));
  const doneSets = allSets.filter(setDone).length;
  const started = Date.parse(day.startedAt ?? "");
  const elapsed = Number.isFinite(started) ? Math.max(0, Math.floor(((day.status === "completed" ? Date.parse(day.completedAt ?? "") || now : now) - started) / 1000)) : 0;
  const summary = workoutSummary(day);

  const onSetDone = (i: number) => {
    if (!live) return;
    const record = day.exercises[i];
    const remaining = record.sets.filter((s) => !s.completedAt).length - 1;
    const laterIndex = day.exercises.findIndex((e, j) => j > i && canEdit(e) && e.status !== "completed");
    if (remaining > 0) startRest(restSeconds(record.exerciseId), "");
    else if (laterIndex !== -1) {
      startRest(restSeconds(record.exerciseId), library[day.exercises[laterIndex].exerciseId]?.name ?? "");
      window.setTimeout(() => document.getElementById(`ex-${laterIndex}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    }
  };

  const finish = (force = false) => {
    if (!doneSets && !force) {
      setConfirm("empty");
      return;
    }
    const completed: DayRecord = { ...day, note: note.trim() || undefined, status: "completed", completedAt: day.completedAt ?? new Date().toISOString() };
    saveDay(completed);
    skipRest();
    const prs = completed.exercises.flatMap((e) => {
      const done = e.sets.filter((s) => setDone(s) && s.weightKg && s.reps);
      const best = Math.max(0, ...done.map((s) => e1rm(s.weightKg!, s.reps!)));
      const previous = pbsBefore.get(e.exerciseId);
      if (!best || previous === undefined || best <= previous + 0.01) return [];
      const top = [...done].sort((a, b) => e1rm(b.weightKg!, b.reps!) - e1rm(a.weightKg!, a.reps!))[0];
      return [{ id: e.exerciseId, label: setLabel(top) }];
    });
    setFinished({ prs });
  };

  const swap = (i: number, id: string) => {
    const source = day.exercises[i];
    if (!source.sets.some(setDone)) {
      // Nothing done yet: just change the exercise.
      saveDay(
        updateExercise(day, i, () => ({
          exerciseId: id,
          status: "planned",
          target: { ...source.target },
          sets: source.sets.map((_, n) => ({ id: `${id}-${n + 1}` })),
          ...(source.added ? { added: true } : {}),
        })),
      );
    } else {
      saveDay(substituteExercise(day, i, id, "Swapped"));
    }
  };

  const menuActions = (i: number): Action[] => {
    const record = day.exercises[i];
    const name = library[record.exerciseId]?.name ?? "this exercise";
    const list: Action[] = [];
    if (library[record.exerciseId]) list.push({ label: "How to Do It", onClick: () => setInfoFor(record.exerciseId) });
    list.push({ label: "Swap Exercise", onClick: () => setSwapFor(i) });
    list.push({ label: `Rest Time (${fmtClock(restSeconds(record.exerciseId))})`, onClick: () => setRestFor(i) });
    if (record.status !== "skipped" && record.sets.length > 1) {
      const lastOpen = [...record.sets].reverse().find((s) => !s.completedAt) ?? record.sets.at(-1)!;
      list.push({ label: "Remove a Set", onClick: () => change(i, (e) => removeSet(e, lastOpen.id)) });
    }
    if (record.status !== "skipped") list.push({ label: "Skip Exercise", onClick: () => change(i, (e) => setSkipped(e, true)) });
    if (!record.sets.some(setDone)) list.push({ label: `Remove ${name}`, danger: true, onClick: () => saveDay({ ...day, exercises: day.exercises.filter((_, j) => j !== i) }) });
    return list;
  };

  const confirmActions: Record<"empty" | "discard" | "delete", { message: string; actions: Action[] }> = {
    empty: {
      message: "No sets are ticked yet.",
      actions: [
        { label: "Finish Anyway", onClick: () => finish(true) },
        { label: "Discard Workout", danger: true, onClick: () => void deleteDay(date).then(() => router.push(back.href)) },
      ],
    },
    discard: {
      message: "Discard this workout? Everything you've logged in it will be deleted.",
      actions: [{ label: "Discard Workout", danger: true, onClick: () => { skipRest(); void deleteDay(date).then(() => router.push(back.href)); } }],
    },
    delete: {
      message: "Delete this workout from your history?",
      actions: [{ label: "Delete Workout", danger: true, onClick: () => void deleteDay(date).then(() => router.push(back.href)) }],
    },
  };

  const title = day.sessionLabel ?? "Workout";
  const swapSource = swapFor !== null ? day.exercises[swapFor] : null;

  return (
    <main className="page page--bare" style={live ? { paddingBottom: "calc(env(safe-area-inset-bottom) + 110px)" } : undefined}>
      <NavBar
        title={title}
        large={false}
        back={back}
        right={
          live ? (
            <button type="button" className="bar-btn bar-btn--bold" onClick={() => finish()}>
              Finish
            </button>
          ) : null
        }
      />

      <div className="px-4 pt-2 pb-5">
        <h1 className="t-title1 m-0">{title}</h1>
        <p className="t-subhead c-2 mt-1 num">
          {live && Number.isFinite(started)
            ? `Started ${new Date(started).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}, ${Math.floor(elapsed / 60)} min ago`
            : `${date === today ? "Today" : readableDate(date)}${summary.minutes ? `, ${durationLabel(summary.minutes)}` : ""}`}
        </p>
        <p className="t-subhead c-2 num">
          {doneSets} of {allSets.length} sets done
        </p>
      </div>

      {day.logged && (
        <Section label="Logged afterwards">
          <label className="row">
            <span className="row-main">Duration</span>
            <input
              className="field num !w-24 text-right"
              inputMode="numeric"
              placeholder="Not set"
              value={minutes}
              onChange={(e) => {
                setMinutes(e.target.value);
                const m = parseNum(e.target.value);
                const next = { ...day };
                if (m && !Number.isNaN(m)) next.minutes = Math.round(m);
                else delete next.minutes;
                saveDay(next);
              }}
              aria-label="Duration in minutes"
            />
            <span className="c-2">min</span>
          </label>
        </Section>
      )}

      {day.exercises.map((record, i) =>
        record.status === "stopped" ? (
          <p key={`${record.exerciseId}-${i}`} className="section-foot -mt-4 mb-4 mx-4">
            {library[record.exerciseId]?.name ?? record.exerciseId} was swapped out{record.sets.some(setDone) ? ` after ${record.sets.filter(setDone).length} sets` : ""}.
          </p>
        ) : (
          <ExerciseBlock
            key={`${record.exerciseId}-${i}`}
            record={record}
            index={i}
            day={day}
            editable={editable}
            onChange={(fn) => change(i, fn)}
            onSetDone={onSetDone}
            onMenu={() => setMenuFor(i)}
            onInfo={() => library[record.exerciseId] && setInfoFor(record.exerciseId)}
          />
        ),
      )}

      {day.exercises.length === 0 && <p className="empty t-subhead c-2">This session has no exercises yet. Add one below.</p>}

      <Section>
        <Row title="Add Exercise" tone="action" leading={<PlusIcon size={20} className="c-tint" />} onClick={() => setAdding(true)} />
      </Section>

      <Section label="Notes">
        <textarea
          className="field row !block min-h-[88px] resize-none t-body"
          placeholder="How did it go?"
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            saveDay({ ...day, note: e.target.value.trim() ? e.target.value : undefined });
          }}
          aria-label="Workout notes"
        />
      </Section>

      <div className="mx-4 mb-7 grid gap-3">
        {live ? (
          <>
            <button type="button" className="btn btn-filled btn-block" onClick={() => finish()}>
              Finish Workout
            </button>
            <button type="button" className="btn btn-gray-danger btn-block" onClick={() => setConfirm("discard")}>
              Discard Workout
            </button>
          </>
        ) : (
          <>
            {day.status === "draft" && (
              <button type="button" className="btn btn-filled btn-block" onClick={() => finish()}>
                Mark as Done
              </button>
            )}
            <button type="button" className="btn btn-gray-danger btn-block" onClick={() => setConfirm("delete")}>
              Delete Workout
            </button>
          </>
        )}
      </div>

      {live && <RestBar />}

      <ActionSheet
        open={menuFor !== null}
        message={menuFor !== null ? library[day.exercises[menuFor]?.exerciseId]?.name : undefined}
        actions={menuFor !== null && day.exercises[menuFor] ? menuActions(menuFor) : []}
        onClose={() => setMenuFor(null)}
      />
      <ActionSheet
        open={restFor !== null}
        message={restFor !== null ? `Rest after each set of ${library[day.exercises[restFor]?.exerciseId]?.name ?? "this exercise"}` : undefined}
        actions={REST_CHOICES.map((s) => ({
          label: `${fmtClock(s)}${restFor !== null && restSeconds(day.exercises[restFor].exerciseId) === s ? "  ✓" : ""}`,
          onClick: () => {
            const id = restFor !== null ? day.exercises[restFor]?.exerciseId : undefined;
            if (id) void saveSettings({ restDefaults: { ...state.settings.restDefaults, [id]: s } });
          },
        }))}
        onClose={() => setRestFor(null)}
      />
      <ActionSheet open={confirm !== null} message={confirm ? confirmActions[confirm].message : undefined} actions={confirm ? confirmActions[confirm].actions : []} onClose={() => setConfirm(null)} />

      <ExerciseInfo id={infoFor} onClose={() => setInfoFor(null)} />
      <ExercisePicker
        open={adding}
        title="Add Exercise"
        onClose={() => setAdding(false)}
        exclude={day.exercises.map((e) => e.exerciseId)}
        onPick={(id) => saveDay(addExerciseToDay(day, id, defaultTarget(library[id])))}
      />
      <ExercisePicker
        open={swapFor !== null}
        title="Swap Exercise"
        onClose={() => setSwapFor(null)}
        exclude={day.exercises.map((e) => e.exerciseId)}
        suggested={swapSource ? substitutionOptions(day, swapSource.exerciseId, library) : []}
        onPick={(id) => swapFor !== null && swap(swapFor, id)}
      />

      <Sheet
        open={!!finished}
        title="Workout Complete"
        cancelLabel={null}
        onClose={() => router.push("/")}
        done={{ label: "Done", onClick: () => router.push("/") }}
      >
        {finished && (
          <>
            <div className="px-4 pb-5 pt-2 text-center">
              <p className="t-title2">{title}</p>
              <p className="t-subhead c-2 mt-1">{readableDate(date)}</p>
            </div>
            <Section>
              {(() => {
                const s = workoutSummary({ ...day, status: "completed", completedAt: day.completedAt ?? new Date().toISOString() });
                return (
                  <>
                    {!!s.minutes && <Row title="Duration" detail={durationLabel(s.minutes)} />}
                    <Row title="Exercises" detail={s.exercises} />
                    <Row title="Sets" detail={s.sets} />
                    {s.volume > 0 && <Row title="Weight lifted" detail={fmtVolume(s.volume)} />}
                  </>
                );
              })()}
            </Section>
            {finished.prs.length > 0 && (
              <Section label="New personal bests">
                {finished.prs.map((p) => (
                  <Row key={p.id} title={library[p.id]?.name ?? p.id} detail={<span className="c-green font-semibold">{p.label}</span>} />
                ))}
              </Section>
            )}
          </>
        )}
      </Sheet>
    </main>
  );
}
