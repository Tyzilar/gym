"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// One rest timer for the app, kept in localStorage so it survives the phone
// locking, switching apps or reloading. It counts from an end time, never ticks.

type Rest = { endsAt: number; total: number; label: string };

const KEY = "gym-rest-timer";
/** How long "Rest over" stays up before the bar goes away. */
const LINGER_MS = 8000;

let current: Rest | null | undefined;
const listeners = new Set<() => void>();

function read(): Rest | null {
  if (current === undefined) {
    current = null;
    try {
      const raw = localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<Rest>) : null;
      if (parsed && typeof parsed.endsAt === "number" && typeof parsed.total === "number") current = { endsAt: parsed.endsAt, total: parsed.total, label: String(parsed.label ?? "") };
    } catch {
      /* private mode */
    }
  }
  if (current && current.endsAt < Date.now() - LINGER_MS) current = null;
  return current;
}

function write(next: Rest | null) {
  current = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    current = undefined;
    l();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}

// iOS only lets a page play sound from an AudioContext first touched during a tap,
// so it's unlocked when a set is ticked and reused for the end-of-rest chime.
let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio ??= new AC();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    audio = null;
  }
}

export function chime() {
  try {
    const ctx = audio;
    if (ctx) {
      [0, 0.18].forEach((t, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = i ? 1318.5 : 987.8;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.4);
      });
    }
  } catch {
    /* no sound: the bar still shows */
  }
  navigator.vibrate?.([160, 80, 160]);
}

export function startRest(seconds: number, label: string) {
  unlockAudio();
  write({ endsAt: Date.now() + seconds * 1000, total: seconds, label });
}

export function adjustRest(delta: number) {
  const r = read();
  if (!r) return;
  const left = Math.max(0, r.endsAt - Date.now()) + delta * 1000;
  if (left <= 0) return write(null);
  write({ ...r, endsAt: Date.now() + left, total: Math.max(r.total + delta, Math.ceil(left / 1000)) });
}

export function skipRest() {
  write(null);
}

/** The running rest, worked out from its end time. `left` is 0 once it's over (shown briefly). */
export function useRest() {
  const r = useSyncExternalStore(subscribe, read, () => null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!r) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("pageshow", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("pageshow", tick);
    };
  }, [r]);
  if (!r) return null;
  if (r.endsAt < now - LINGER_MS) return null;
  const left = Math.max(0, Math.ceil((r.endsAt - now) / 1000));
  return { left, total: r.total, label: r.label, endsAt: r.endsAt };
}

export const fmtClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
