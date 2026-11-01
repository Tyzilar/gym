"use client";

import { useEffect, useRef, useState } from "react";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A tidy upper bound for the y axis (1, 2, 2.5, 5 × 10ⁿ). */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

type Bar = { label: string; value: number; detail: string };

/**
 * Health-style bar chart. Tapping a bar shows its value in the header;
 * tapping it again goes back to the summary.
 */
export function BarChart({
  data,
  summary,
  format,
  height = 160,
}: {
  data: Bar[];
  summary: { value: string; caption: string };
  format: (v: number) => string;
  height?: number;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const head = picked !== null ? { value: format(data[picked].value), caption: data[picked].detail } : summary;
  return (
    <div className="card-pad">
      <p className="t-footnote c-2">{head.caption}</p>
      <p className="t-title1 num mb-3">{head.value}</p>
      <div className="relative" style={{ height }}>
        {[1, 0.5, 0].map((f) => (
          <div key={f} className="absolute inset-x-0 flex items-center" style={{ top: `${(1 - f) * 100}%` }}>
            <div className="flex-1 border-t" style={{ borderColor: "var(--grid)", borderTopStyle: f === 0 ? "solid" : "dashed" }} />
            <span className="t-caption2 c-2 num w-8 text-right -translate-y-1/2">{f === 0 ? "0" : f === 1 ? format(max).replace(/ .*/, "") : ""}</span>
          </div>
        ))}
        <div className="absolute inset-y-0 left-0 right-8 flex items-end gap-[3px] pr-1.5">
          {data.map((d, i) => (
            <button
              key={i}
              type="button"
              className="flex h-full flex-1 items-end"
              aria-label={`${d.detail}: ${format(d.value)}`}
              onClick={() => setPicked(picked === i ? null : i)}
            >
              <span
                className="block w-full rounded-t-[3px] transition-opacity"
                style={{
                  height: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%`,
                  background: "var(--tint)",
                  opacity: picked === null || picked === i ? 1 : 0.35,
                }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mr-8 mt-1.5 flex pr-1.5">
        {data.map((d, i) => (
          <span key={i} className="flex-1 overflow-visible whitespace-nowrap text-left t-caption2 c-2">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

type Point = { x: string; y: number; detail: string };

/** Line chart with dots; tap a dot to read it. */
export function LineChart({ data, format, height = 150, caption }: { data: Point[]; format: (v: number) => string; height?: number; caption: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [picked, setPicked] = useState<number | null>(null);
  const ys = data.map((d) => d.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pad = Math.max((hi - lo) * 0.15, hi * 0.03, 0.5);
  const min = Math.max(0, lo - pad);
  const max = hi + pad;
  const left = 4;
  const right = 40;
  const w = Math.max(0, width - left - right);
  const x = (i: number) => left + (data.length === 1 ? w / 2 : (i / (data.length - 1)) * w);
  const y = (v: number) => 8 + (1 - (v - min) / (max - min || 1)) * (height - 16);
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.y).toFixed(1)}`).join(" ");
  const shown = picked ?? data.length - 1;
  return (
    <div className="card-pad">
      <p className="t-footnote c-2">{picked !== null ? data[picked].detail : caption}</p>
      <p className="t-title1 num mb-3">{data.length ? format(data[shown].y) : "–"}</p>
      <div ref={ref} style={{ height }}>
        {width > 0 && (
          <svg className="chart" width={width} height={height} role="img" aria-label={caption}>
            {[max, (max + min) / 2, min].map((v, i) => (
              <g key={i}>
                <line className={`grid ${i < 2 ? "grid--dash" : ""}`} x1={left} x2={left + w} y1={y(v)} y2={y(v)} />
                <text x={width - 2} y={y(v) + 4} textAnchor="end">
                  {format(v).replace(/ .*/, "")}
                </text>
              </g>
            ))}
            <path d={path} fill="none" stroke="var(--tint)" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
            {data.map((d, i) => (
              <g key={i} onClick={() => setPicked(picked === i ? null : i)} style={{ cursor: "pointer" }}>
                <circle cx={x(i)} cy={y(d.y)} r={14} fill="transparent" />
                <circle cx={x(i)} cy={y(d.y)} r={i === shown ? 5 : 3.2} fill={i === shown ? "var(--tint)" : "var(--cell)"} stroke="var(--tint)" strokeWidth={2} />
              </g>
            ))}
          </svg>
        )}
      </div>
      {data.length > 1 && (
        <div className="mt-1.5 flex justify-between t-caption2 c-2 num" style={{ marginRight: right }}>
          <span>{data[0].x}</span>
          <span>{data.at(-1)!.x}</span>
        </div>
      )}
    </div>
  );
}
