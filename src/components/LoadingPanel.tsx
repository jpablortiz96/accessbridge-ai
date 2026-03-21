"use client";

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="18"
        cy="18"
        r="15"
        stroke="#1A1A2E"
        strokeOpacity="0.08"
        strokeWidth="3"
      />
      <path
        d="M18 3a15 15 0 0 1 15 15"
        stroke="#16C172"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Agent steps shown during loading ────────────────────────────────────────

const STEPS = [
  { label: "Fetching page HTML…",          delay: "0ms"   },
  { label: "Scanner Agent analyzing…",     delay: "600ms" },
  { label: "Checking WCAG 2.1 rules…",     delay: "1200ms" },
  { label: "Computing accessibility score…", delay: "2000ms" },
];

interface Props {
  url: string;
}

export default function LoadingPanel({ url }: Props) {
  let domain = url;
  try { domain = new URL(url).hostname; } catch {}

  return (
    <div
      className="flex flex-col items-center text-center"
      role="status"
      aria-label="Analyzing accessibility"
      aria-live="polite"
    >
      <Spinner />

      <p className="mt-5 font-semibold text-primary text-lg">
        Analyzing{" "}
        <span className="text-accent font-mono text-base">{domain}</span>
      </p>
      <p className="text-sm text-primary/40 mt-1">
        This may take a few seconds…
      </p>

      {/* Steps — staggered fade-in */}
      <ol
        className="mt-8 flex flex-col gap-2.5 text-left w-full max-w-xs"
        aria-label="Analysis steps in progress"
      >
        {STEPS.map((step, i) => (
          <li
            key={i}
            className="flex items-center gap-3 text-sm text-primary/50 animate-slide-up"
            style={{ animationDelay: step.delay, opacity: 0 }}
          >
            {/* Pulsing dot */}
            <span
              className="inline-flex w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0 animate-pulse"
              aria-hidden="true"
            />
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
