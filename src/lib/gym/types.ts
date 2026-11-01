// Gym data model. Ported from the Fitness Grid Expo app (mobile,
// schema v2) and generalised: sessions are no longer hard-wired to
// upperA/lowerA/upperB/lowerB, so any split can be logged under its own name.
// Old Fitness Grid backups still import unchanged (their ids are just strings).

export const WORKOUT_SCHEMA_VERSION = 2 as const;

export type WorkoutStatus = "draft" | "completed" | "rest";
export type ExerciseStatus = "planned" | "in_progress" | "completed" | "skipped" | "stopped";
export type SetSide = "both" | "left" | "right";

export type SetRecord = {
  id: string;
  weightKg?: number;
  reps?: number;
  seconds?: number;
  side?: SetSide;
  rpe?: number;
  completedAt?: string;
};

export type ExerciseTarget = {
  targetSets: number;
  targetReps: string;
  targetRpe: number | null;
};

export type ExerciseRecord = {
  exerciseId: string;
  status: ExerciseStatus;
  target: ExerciseTarget;
  sets: SetRecord[];
  note?: string;
  subbedFrom?: string;
  subReason?: string;
  stoppedReason?: "pain" | "substitution";
  stoppedAt?: string;
  /** Added during the workout rather than from the program. */
  added?: boolean;
};

export type DayRecord = {
  schemaVersion: typeof WORKOUT_SCHEMA_VERSION;
  date: string;
  /** A session id from the program, or "rest". */
  session: string;
  status: WorkoutStatus;
  /** Snapshot so the day still renders if the session is renamed or removed later. */
  sessionLabel?: string;
  sessionColor?: string;
  programId?: string;
  programName?: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
  note?: string;
  /** Logged after the fact (no live timer). Counts as done even with no sets filled in. */
  logged?: boolean;
  /** How long it took, typed in for a logged workout. */
  minutes?: number;
  exercises: ExerciseRecord[];
  health?: Record<string, unknown>;
};

export type TrainingLog = Record<string, DayRecord>;

export type PlanExercise = ExerciseTarget & { id: string; incrementKg?: number };

export type SessionDef = {
  id: string;
  label: string;
  color: string;
  exercises: PlanExercise[];
};

export type TrainingPlan = {
  id: string;
  name: string;
  /** "These are my actual targets" — gates progression suggestions. */
  confirmed: boolean;
  sessions: SessionDef[];
  updatedAt?: string;
};

export const METRIC_LIMITS = {
  bodyMassKg: 500,
  steps: 1_000_000,
  sleepHours: 24,
  restingHeartRate: 400,
  activeEnergyKcal: 20_000,
} as const;
export type MetricName = keyof typeof METRIC_LIMITS;
export type DayMetrics = Partial<Record<MetricName, number>> & {
  sources?: Partial<Record<MetricName, string>>;
  updatedAt?: string;
};
export type DailyMetrics = Record<string, DayMetrics>;

export type GymSettings = {
  weeklyTarget: number;
  rollingTarget: number;
  /** Exercises saved from the Library for quick adding in the program editor. */
  shortlist: string[];
  /** Rest-timer length per exercise, in seconds. */
  restDefaults: Record<string, number>;
  bodySex: "male" | "female";
  bodyMode: "beginner" | "pro";
  /** The split chosen from the split library. */
  referencePlans?: { training?: string; meal?: string };
};

export type ExerciseInfo = {
  name: string;
  pattern?: string;
  primary: string;
  secondary: string;
  equipment: string;
  setup?: string[];
  shouldFeel?: string;
  commonFaults?: { symptom: string; fix: string }[];
  substitutes?: string[];
  caution?: string;
};

export type GymState = {
  log: TrainingLog;
  /** The active program (what "Start workout" uses). */
  program: TrainingPlan;
  /** Every saved program, the active one included — the Gym's program dropdown. */
  programs: TrainingPlan[];
  metrics: DailyMetrics;
  settings: GymSettings;
};

/** Export format. Version 1 is the Fitness Grid Expo app's own backup. */
export type GymBackup = {
  format: "fitness-grid-workouts";
  version: 1 | 2;
  createdAt: string;
  log: TrainingLog;
  program: unknown;
  dailyMetrics?: DailyMetrics;
  programs?: unknown[];
  settings?: Partial<GymSettings>;
  calendarView?: string;
};
