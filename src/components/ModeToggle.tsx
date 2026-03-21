"use client";

import type { AnalysisMode } from "@/types";

interface ModeToggleProps {
  value: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
}

const MODES = [
  {
    id:    "cloud"   as AnalysisMode,
    label: "☁️ Cloud",
    sub:   "AI-powered",
  },
  {
    id:    "offline" as AnalysisMode,
    label: "📡 Offline",
    sub:   "Local",
  },
] as const;

export default function ModeToggle({ value, onChange }: ModeToggleProps) {
  return (
    <div>
      {/* Segmented control */}
      <fieldset>
        <legend className="sr-only">Analysis mode</legend>
        <div
          className="inline-flex p-1 rounded-2xl gap-1"
          style={{ backgroundColor: "rgba(26,26,46,0.06)" }}
          role="radiogroup"
          aria-label="Select analysis mode"
        >
          {MODES.map((m) => {
            const active = value === m.id;
            return (
              <label key={m.id} className="flex-1 cursor-pointer">
                <input
                  type="radio"
                  name="analysis-mode"
                  value={m.id}
                  checked={active}
                  onChange={() => onChange(m.id)}
                  className="sr-only"
                />
                <span
                  className={`
                    flex flex-col items-center px-5 py-2 rounded-xl
                    text-sm font-semibold leading-tight
                    transition-all duration-200
                    ${active
                      ? "bg-white text-primary shadow-sm"
                      : "text-primary/45 hover:text-primary/70"
                    }
                  `}
                >
                  <span>{m.label}</span>
                  <span className={`text-[10px] font-normal mt-0.5 ${active ? "text-primary/50" : "text-primary/30"}`}>
                    {m.sub}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Offline disclaimer */}
      {value === "offline" && (
        <p
          className="mt-2.5 text-xs text-center text-primary/50"
          aria-live="polite"
          role="status"
        >
          📦 Runs entirely on-device. No data sent to cloud.
        </p>
      )}
    </div>
  );
}
