"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { defaultTarget, parseTarget } from "@/lib/gym/domain";
import type { PlanExercise, SessionDef } from "@/lib/gym/types";
import { targetText } from "@/lib/format";
import { useGym } from "@/components/gym/GymProvider";
import ExercisePicker from "@/components/ExercisePicker";
import { ArrowDown, ArrowUp, MinusCircle, PlusCircle } from "@/components/icons";
import { ActionSheet, NavBar, Row, Section, Sheet, Stepper } from "@/components/ui";

export default function SessionPage() {
  return (
    <Suspense fallback={null}>
      <SessionRoute />
    </Suspense>
  );
}

function SessionRoute() {
  const id = useSearchParams().get("id") ?? "";
  return <SessionEditor key={id} id={id} />;
}

/** Sets and reps for one exercise in a session. */
function TargetSheet({
  exercise,
  onClose,
  onSave,
  onSwap,
  onRemove,
}: {
  exercise: PlanExercise | null;
  onClose: () => void;
  onSave: (e: PlanExercise) => void;
  onSwap: () => void;
  onRemove: () => void;
}) {
  const { library } = useGym();
  const [sets, setSets] = useState(exercise?.targetSets ?? 3);
  const [reps, setReps] = useState(exercise?.targetReps ?? "8-10");
  const [seen, setSeen] = useState(exercise);
  if (seen !== exercise) {
    setSeen(exercise);
    setSets(exercise?.targetSets ?? 3);
    setReps(exercise?.targetReps ?? "8-10");
  }
  const clean = reps.trim().replace(/\s+/g, "").replace(/[–—]/g, "-").toLowerCase();
  const valid = !!parseTarget(clean);
  const save = () => {
    if (!exercise || !valid) return;
    onSave({ ...exercise, targetSets: sets, targetReps: clean });
    onClose();
  };
  return (
    <Sheet open={!!exercise} title={exercise ? library[exercise.id]?.name ?? "Exercise" : ""} onClose={onClose} done={{ label: "Done", onClick: save, disabled: !valid }}>
      <Section footer="Reps can be a range like 8-10, a number like 12, or seconds like 30s. Add /side for one side at a time, like 10/side.">
        <div className="row">
          <span className="row-main">Sets</span>
          <span className="num c-2 w-5 text-right">{sets}</span>
          <Stepper label="sets" value={sets} min={1} max={10} onChange={setSets} />
        </div>
        <label className="row">
          <span className="row-main">Reps</span>
          <input
            className={`field num !w-32 text-right ${valid ? "" : "c-red"}`}
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            aria-label="Target reps"
            aria-invalid={!valid}
          />
        </label>
      </Section>
      <Section>
        <Row
          title="Swap Exercise"
          tone="action"
          onClick={() => {
            onClose();
            onSwap();
          }}
        />
        <Row
          title="Remove from Session"
          tone="danger"
          onClick={() => {
            onClose();
            onRemove();
          }}
        />
      </Section>
    </Sheet>
  );
}

function SessionEditor({ id }: { id: string }) {
  const router = useRouter();
  const { state, library, saveProgram } = useGym();
  const program = state.program;
  const session = program.sessions.find((s) => s.id === id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(session?.label ?? "");
  const [target, setTarget] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [swapping, setSwapping] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!session) {
    return (
      <main className="page">
        <NavBar title="Session" large={false} back={{ label: "Program", href: "/program" }} />
        <p className="empty t-subhead c-2">This session isn&apos;t in your current program.</p>
      </main>
    );
  }

  const update = (fn: (s: SessionDef) => SessionDef) => void saveProgram({ ...program, sessions: program.sessions.map((s) => (s.id === id ? fn(s) : s)) });
  const setExercises = (list: PlanExercise[]) => update((s) => ({ ...s, exercises: list }));
  const move = (i: number, by: number) => {
    const list = [...session.exercises];
    const [item] = list.splice(i, 1);
    list.splice(i + by, 0, item);
    setExercises(list);
  };
  const rename = () => {
    const n = name.trim().slice(0, 40);
    if (n && n !== session.label) update((s) => ({ ...s, label: n }));
    else setName(session.label);
  };

  return (
    <main className="page">
      <NavBar
        title={session.label}
        back={{ label: "Program", href: "/program" }}
        right={
          session.exercises.length > 0 ? (
            <button type="button" className={`bar-btn ${editing ? "bar-btn--bold" : ""}`} onClick={() => setEditing(!editing)}>
              {editing ? "Done" : "Edit"}
            </button>
          ) : null
        }
      />

      <Section label="Name">
        <label className="row">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label="Session name" />
        </label>
      </Section>

      <Section label="Exercises" footer={session.exercises.length ? (editing ? "Use the arrows to change the order." : "Tap an exercise to change its sets and reps.") : undefined}>
        {session.exercises.map((e, i) =>
          editing ? (
            <div key={e.id} className="row">
              <button type="button" aria-label={`Remove ${library[e.id]?.name ?? e.id}`} onClick={() => setExercises(session.exercises.filter((_, j) => j !== i))}>
                <MinusCircle />
              </button>
              <span className="row-main">
                <span className="row-title">{library[e.id]?.name ?? e.id}</span>
              </span>
              <button type="button" className="p-1.5 c-tint disabled:opacity-25" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                <ArrowUp />
              </button>
              <button type="button" className="p-1.5 c-tint disabled:opacity-25" disabled={i === session.exercises.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                <ArrowDown />
              </button>
            </div>
          ) : (
            <Row key={e.id} title={library[e.id]?.name ?? e.id} detail={targetText(e)} chevron onClick={() => setTarget(i)} />
          ),
        )}
        {!editing && <Row title="Add Exercise" tone="action" leading={<PlusCircle />} onClick={() => setAdding(true)} />}
      </Section>

      {program.sessions.length > 1 && (
        <Section>
          <Row title="Delete Session" tone="danger" onClick={() => setConfirmDelete(true)} />
        </Section>
      )}

      <TargetSheet
        exercise={target !== null ? session.exercises[target] ?? null : null}
        onClose={() => setTarget(null)}
        onSave={(next) => target !== null && setExercises(session.exercises.map((e, j) => (j === target ? next : e)))}
        onSwap={() => setSwapping(target)}
        onRemove={() => target !== null && setExercises(session.exercises.filter((_, j) => j !== target))}
      />
      <ExercisePicker
        open={adding}
        title="Add Exercise"
        onClose={() => setAdding(false)}
        exclude={session.exercises.map((e) => e.id)}
        onPick={(pick) => setExercises([...session.exercises, { id: pick, ...defaultTarget(library[pick]) }])}
      />
      <ExercisePicker
        open={swapping !== null}
        title="Swap Exercise"
        onClose={() => setSwapping(null)}
        exclude={session.exercises.map((e) => e.id)}
        suggested={swapping !== null ? library[session.exercises[swapping]?.id]?.substitutes ?? [] : []}
        onPick={(pick) => swapping !== null && setExercises(session.exercises.map((e, j) => (j === swapping ? { ...e, id: pick } : e)))}
      />
      <ActionSheet
        open={confirmDelete}
        message={`Delete ${session.label}? Workouts you've already logged keep their sets.`}
        actions={[
          {
            label: "Delete Session",
            danger: true,
            onClick: () => {
              void saveProgram({ ...program, sessions: program.sessions.filter((s) => s.id !== id) });
              router.push("/program");
            },
          },
        ]}
        onClose={() => setConfirmDelete(false)}
      />
    </main>
  );
}
