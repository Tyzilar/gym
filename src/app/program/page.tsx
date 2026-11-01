"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SESSION_PALETTE } from "@/lib/gym/domain";
import type { TrainingPlan } from "@/lib/gym/types";
import { downloadBackup, importBackup, lastExportedAt } from "@/lib/gym/localStore";
import { TEMPLATES, newId, slug } from "@/lib/format";
import { fmtClock } from "@/lib/restTimer";
import { useGym } from "@/components/gym/GymProvider";
import { CheckIcon, PlusCircle } from "@/components/icons";
import { ActionSheet, NavBar, Row, Section, Segmented, Sheet, Stepper, Switch } from "@/components/ui";

const REST_CHOICES = ["60", "90", "120", "180"] as const;

type Pending = { raw: unknown; days: number; conflicts: number; first?: string; last?: string; hasProgram: boolean };

function ProgramsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, saveProgram, activateProgram, deleteProgram } = useGym();
  const [name, setName] = useState(state.program.name);
  const [deleting, setDeleting] = useState(false);
  const [seen, setSeen] = useState(state.program);
  if (seen !== state.program) {
    setSeen(state.program);
    setName(state.program.name);
  }

  const rename = () => {
    const n = name.trim();
    if (n && n !== state.program.name) void saveProgram({ ...state.program, name: n.slice(0, 60) });
    else setName(state.program.name);
  };

  const create = (plan: TrainingPlan) => {
    void saveProgram(plan);
    onClose();
  };

  const others = state.programs.filter((p) => p.id !== state.program.id);

  return (
    <Sheet open={open} title="Programs" onClose={() => { rename(); onClose(); }} cancelLabel={null} done={{ label: "Done", onClick: () => { rename(); onClose(); } }} tall>
      <Section label="Name">
        <label className="row">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label="Program name" />
        </label>
      </Section>

      <Section label="Your programs" footer="Switching programs doesn't change workouts you've already logged.">
        {state.programs.map((p) => (
          <Row
            key={p.id}
            title={p.name}
            sub={`${p.sessions.length} ${p.sessions.length === 1 ? "session" : "sessions"}`}
            trailing={p.id === state.program.id ? <CheckIcon className="c-tint" /> : undefined}
            onClick={() => p.id !== state.program.id && void activateProgram(p.id)}
          />
        ))}
        {others.length > 0 && <Row title="Delete a Program…" tone="danger" onClick={() => setDeleting(true)} />}
      </Section>

      <Section label="New program" footer="Templates set up the sessions. Add exercises to each one in Program.">
        <Row
          title={`Copy of ${state.program.name}`}
          tone="action"
          onClick={() => create({ ...structuredClone(state.program), id: newId("program"), name: `${state.program.name} (copy)`.slice(0, 60), confirmed: false })}
        />
        <Row
          title="Blank Program"
          tone="action"
          onClick={() => create({ id: newId("program"), name: "My Program", confirmed: false, sessions: [{ id: "workout-a", label: "Workout A", color: SESSION_PALETTE[0], exercises: [] }] })}
        />
        {TEMPLATES.map((t) => (
          <Row
            key={t.id}
            title={t.title}
            sub={t.detail}
            detail={`${t.perWeek} days`}
            onClick={() => {
              const ids: string[] = [];
              const sessions = t.sessions.map((label, i) => {
                const id = slug(label, ids);
                ids.push(id);
                return { id, label, color: SESSION_PALETTE[i % SESSION_PALETTE.length], exercises: [] };
              });
              create({ id: newId(t.id), name: t.title, confirmed: false, sessions });
            }}
          />
        ))}
      </Section>

      <ActionSheet
        open={deleting}
        message="Delete which program? Workouts you've logged with it stay in History."
        actions={others.map((p) => ({ label: p.name, danger: true, onClick: () => void deleteProgram(p.id) }))}
        onClose={() => setDeleting(false)}
      />
    </Sheet>
  );
}

export default function ProgramTab() {
  const router = useRouter();
  const { state, saveProgram, saveSettings, reload } = useGym();
  const { program, settings } = state;
  const [picking, setPicking] = useState(false);
  const [exportedAt, setExportedAt] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [policy, setPolicy] = useState<"keep" | "import">("keep");
  const [withProgram, setWithProgram] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setExportedAt(lastExportedAt()), []);

  const rest = String(settings.restDefaults.default ?? 90) as (typeof REST_CHOICES)[number];

  const addSession = async () => {
    const n = program.sessions.length;
    const label = `Workout ${String.fromCharCode(65 + (n % 26))}`;
    const id = slug(label, program.sessions.map((s) => s.id));
    await saveProgram({ ...program, sessions: [...program.sessions, { id, label, color: SESSION_PALETTE[n % SESSION_PALETTE.length], exercises: [] }] });
    router.push(`/program/session?id=${encodeURIComponent(id)}`);
  };

  const readFile = async (file: File) => {
    setMsg("");
    try {
      const raw = JSON.parse(await file.text());
      if (raw?.format !== "fitness-grid-workouts") throw new Error("That file isn't a Gym backup.");
      const dates = Object.keys(raw.log ?? {}).sort();
      setPending({ raw, days: dates.length, conflicts: dates.filter((d) => state.log[d]).length, first: dates[0], last: dates.at(-1), hasProgram: !!raw.program });
      setPolicy("keep");
      setWithProgram(Object.keys(state.log).length === 0 && !!raw.program);
    } catch (e) {
      setMsg((e as Error).message || "That file couldn't be read.");
    }
  };

  const runImport = async () => {
    if (!pending) return;
    try {
      const r = importBackup(pending.raw, policy, withProgram);
      setMsg(`Imported ${r.days} ${r.days === 1 ? "day" : "days"}${r.program ? " and the program" : ""}.`);
      setPending(null);
      await reload();
    } catch (e) {
      setMsg((e as Error).message || "Import failed.");
      setPending(null);
    }
  };

  const backupNote = msg || (exportedAt ? `Last backup ${new Date(exportedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}.` : "No backup yet.");

  return (
    <main className="page">
      <NavBar title="Program" />

      <Section>
        <Row title="Current Program" detail={program.name} chevron onClick={() => setPicking(true)} />
      </Section>

      <Section label="Sessions" footer="You do these in order. Up next is the one after the last session you finished.">
        {program.sessions.map((s) => (
          <Row
            key={s.id}
            href={`/program/session?id=${encodeURIComponent(s.id)}`}
            title={s.label}
            detail={s.exercises.length ? `${s.exercises.length} ${s.exercises.length === 1 ? "exercise" : "exercises"}` : "No exercises"}
            chevron
          />
        ))}
        {program.sessions.length < 10 && <Row title="Add Session" tone="action" leading={<PlusCircle />} onClick={() => void addSession()} />}
      </Section>

      <Section label="Goal" footer="Shown on the Workout tab as this week's progress.">
        <div className="row">
          <span className="row-main">Workouts per week</span>
          <span className="num c-2 w-5 text-right">{settings.weeklyTarget}</span>
          <Stepper label="workouts per week" value={settings.weeklyTarget} min={1} max={7} onChange={(v) => void saveSettings({ weeklyTarget: v })} />
        </div>
      </Section>

      <Section label="Rest timer" footer="Starts after each set. Change it for one exercise from its ••• menu during a workout.">
        <div className="row">
          <div className="w-full">
            <Segmented
              label="Rest between sets"
              value={REST_CHOICES.includes(rest) ? rest : "90"}
              onChange={(v) => void saveSettings({ restDefaults: { ...settings.restDefaults, default: Number(v) } })}
              options={REST_CHOICES.map((v) => ({ value: v, label: fmtClock(Number(v)) }))}
            />
          </div>
        </div>
      </Section>

      <Section label="Backup" footer={`Your workouts are saved only on this phone. Export a backup every few weeks and keep it in Files or iCloud Drive. ${backupNote}`}>
        <Row
          title="Export Backup"
          tone="action"
          onClick={async () => {
            const how = await downloadBackup();
            if (how) setMsg(how === "shared" ? "Backup saved." : "Backup downloaded.");
            setExportedAt(lastExportedAt());
          }}
        />
        <Row title="Import Backup" tone="action" onClick={() => fileRef.current?.click()} />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void readFile(f);
          }}
        />
      </Section>

      <ProgramsSheet open={picking} onClose={() => setPicking(false)} />

      <Sheet open={!!pending} title="Import Backup" onClose={() => setPending(null)} done={{ label: "Import", onClick: () => void runImport() }}>
        {pending && (
          <>
            <Section>
              <Row title="Workouts in the file" detail={pending.days} />
              {pending.first && <Row title="From" detail={`${pending.first} to ${pending.last}`} />}
              {pending.conflicts > 0 && <Row title="Already on this phone" detail={pending.conflicts} />}
            </Section>
            {pending.conflicts > 0 && (
              <Section label="When a day is in both" footer="Days only in one place are always kept.">
                <div className="row">
                  <div className="w-full">
                    <Segmented
                      label="When a day is in both"
                      value={policy}
                      onChange={setPolicy}
                      options={[
                        { value: "keep", label: "Keep This Phone's" },
                        { value: "import", label: "Use the Backup's" },
                      ]}
                    />
                  </div>
                </div>
              </Section>
            )}
            {pending.hasProgram && (
              <Section footer="Replaces your current program's sessions and exercises.">
                <div className="row">
                  <span className="row-main">Also restore its program</span>
                  <Switch checked={withProgram} onChange={setWithProgram} label="Also restore its program" />
                </div>
              </Section>
            )}
          </>
        )}
      </Sheet>
    </main>
  );
}
