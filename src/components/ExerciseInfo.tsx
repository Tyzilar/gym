"use client";

import { useGym } from "./gym/GymProvider";
import { Section, Sheet } from "./ui";

/** How to do an exercise: setup, what you should feel, common faults. */
export default function ExerciseInfo({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { library } = useGym();
  const info = id ? library[id] : undefined;
  return (
    <Sheet open={!!info} title={info?.name ?? ""} onClose={onClose} cancelLabel={null} done={{ label: "Done", onClick: onClose }}>
      {info && (
        <>
          <p className="t-subhead c-2 px-8 pb-4">
            Works {info.primary}
            {info.secondary ? `, plus ${info.secondary}` : ""}. Equipment: {info.equipment}.
          </p>
          {!!info.setup?.length && (
            <Section label="How to do it">
              {info.setup.map((step, i) => (
                <div key={i} className="row items-start">
                  <span className="t-subhead c-2 num w-4 shrink-0 pt-px">{i + 1}</span>
                  <span className="row-main t-subhead">{step}</span>
                </div>
              ))}
            </Section>
          )}
          {info.shouldFeel && (
            <Section label="What you should feel">
              <p className="row t-subhead">{info.shouldFeel}</p>
            </Section>
          )}
          {!!info.commonFaults?.length && (
            <Section label="Common mistakes">
              {info.commonFaults.map((f, i) => (
                <div key={i} className="row items-start">
                  <span className="row-main">
                    <span className="row-title t-subhead font-semibold">{f.symptom}</span>
                    <span className="row-sub">{f.fix}</span>
                  </span>
                </div>
              ))}
            </Section>
          )}
          {info.caution && (
            <Section label="Take care">
              <p className="row t-subhead">{info.caution}</p>
            </Section>
          )}
        </>
      )}
    </Sheet>
  );
}
