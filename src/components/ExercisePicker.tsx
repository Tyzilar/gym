"use client";

import { useMemo, useState } from "react";
import { EXERCISE_SECTIONS, exerciseSection } from "@/lib/gym/domain";
import { useGym } from "./gym/GymProvider";
import { SearchIcon } from "./icons";
import { Row, Section, Sheet } from "./ui";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Searchable exercise list, grouped by body part. `suggested` shows first (e.g. swaps). */
export default function ExercisePicker({
  open,
  title,
  onClose,
  onPick,
  exclude = [],
  suggested = [],
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onPick: (id: string) => void;
  exclude?: string[];
  suggested?: string[];
}) {
  const { library } = useGym();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const skip = new Set(exclude);
    const match = (id: string) => {
      const e = library[id];
      return !!e && !skip.has(id) && (!q || `${e.name} ${e.equipment} ${e.primary}`.toLowerCase().includes(q));
    };
    const ids = Object.keys(library).filter(match).sort((a, b) => library[a].name.localeCompare(library[b].name));
    const out: { label: string; ids: string[] }[] = [];
    const sugg = suggested.filter(match).slice(0, 6);
    if (sugg.length && !q) out.push({ label: "Suggested", ids: sugg });
    for (const s of EXERCISE_SECTIONS) {
      const list = ids.filter((id) => exerciseSection(library[id]) === s.id);
      if (list.length) out.push({ label: s.label, ids: list });
    }
    return out;
  }, [library, query, exclude, suggested]);

  const close = () => {
    setQuery("");
    onClose();
  };

  return (
    <Sheet open={open} title={title} onClose={close} tall>
      <div className="sticky top-0 z-10 px-4 pb-3 pt-1" style={{ background: "var(--bg)" }}>
        <label className="search">
          <SearchIcon />
          <input type="search" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search exercises" />
        </label>
      </div>
      {groups.length === 0 && <p className="empty t-subhead c-2">No exercises match “{query}”.</p>}
      {groups.map((g) => (
        <Section key={g.label} label={g.label}>
          {g.ids.map((id) => (
            <Row
              key={id}
              title={library[id].name}
              sub={[cap(library[id].equipment), library[id].primary.split(",")[0]].filter(Boolean).join(", ")}
              onClick={() => {
                onPick(id);
                close();
              }}
            />
          ))}
        </Section>
      ))}
    </Sheet>
  );
}
