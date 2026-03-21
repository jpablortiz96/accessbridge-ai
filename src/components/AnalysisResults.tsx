"use client";

import type { AnalysisResult, AccessibilityIssue } from "@/types/agents";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score < 40) return "#EF4444";
  if (score < 70) return "#F59E0B";
  return "#16C172";
}

function scoreLabel(score: number): string {
  if (score < 40) return "Poor";
  if (score < 70) return "Needs Work";
  if (score < 90) return "Good";
  return "Excellent";
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ─── Severity config ──────────────────────────────────────────────────────────

const SEVERITY = {
  critical: {
    label: "Critical",
    border: "border-red-400",
    badge: "bg-red-100 text-red-700",
    count: "text-red-500",
  },
  major: {
    label: "Major",
    border: "border-amber-400",
    badge: "bg-amber-100 text-amber-700",
    count: "text-amber-500",
  },
  minor: {
    label: "Minor",
    border: "border-gray-300",
    badge: "bg-gray-100 text-gray-500",
    count: "text-gray-400",
  },
} as const;

type Severity = keyof typeof SEVERITY;

function isSeverity(s: string): s is Severity {
  return s in SEVERITY;
}

// ─── IssueCard ────────────────────────────────────────────────────────────────

function IssueCard({ issue }: { issue: AccessibilityIssue }) {
  const sev = isSeverity(issue.severity) ? issue.severity : "minor";
  const cfg = SEVERITY[sev];

  return (
    <article
      className={`border-l-4 ${cfg.border} pl-4 pr-4 py-3 bg-white rounded-r-lg shadow-sm`}
      aria-label={`${cfg.label} issue: WCAG ${issue.wcagRule}`}
    >
      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
          {cfg.label}
        </span>
        <span className="text-xs font-mono text-primary/45 font-medium">
          WCAG {issue.wcagRule} ({issue.wcagLevel})
        </span>
        <span className="text-xs text-primary/35 capitalize">{issue.category}</span>
      </div>

      {/* Description */}
      <p className="text-sm font-medium text-primary leading-snug">
        {issue.description}
      </p>

      {/* Suggestion */}
      <p className="text-xs text-primary/50 mt-1 leading-relaxed">
        {issue.suggestion}
      </p>
    </article>
  );
}

// ─── AnalysisResults ──────────────────────────────────────────────────────────

interface Props {
  result: AnalysisResult;
  onReset: () => void;
}

export default function AnalysisResults({ result, onReset }: Props) {
  const score = result.scoreBefore;
  const color = scoreColor(score);
  const label = scoreLabel(score);
  const domain = getDomain(result.url);

  const sorted = [...result.issues].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, major: 1, minor: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  const counts = {
    critical: result.issues.filter((i) => i.severity === "critical").length,
    major:    result.issues.filter((i) => i.severity === "major").length,
    minor:    result.issues.filter((i) => i.severity === "minor").length,
  };

  return (
    <div
      className="w-full max-w-2xl animate-slide-up"
      role="region"
      aria-label="Accessibility analysis results"
    >
      {/* ── Score ── */}
      <div className="text-center mb-8">
        <p className="text-xs font-medium text-primary/40 uppercase tracking-widest mb-3">
          Accessibility Score — {domain}
        </p>

        <div
          aria-label={`Score: ${score} out of 100 — ${label}`}
          className="inline-flex flex-col items-center"
        >
          <span
            className="text-8xl font-bold font-display leading-none tabular-nums"
            style={{ color }}
          >
            {score}
          </span>
          <span
            className="text-sm font-semibold mt-2 uppercase tracking-widest"
            style={{ color }}
          >
            {label}
          </span>
        </div>

        {/* ── Severity counts ── */}
        <div
          className="flex justify-center items-center gap-8 mt-7"
          role="list"
          aria-label="Issue counts by severity"
        >
          {(["critical", "major", "minor"] as Severity[]).map((sev, i) => (
            <div key={sev} className="flex items-center gap-8">
              {i > 0 && (
                <div className="h-8 w-px bg-primary/10" aria-hidden="true" />
              )}
              <div role="listitem" className="text-center">
                <span
                  className={`block text-3xl font-bold tabular-nums ${SEVERITY[sev].count}`}
                >
                  {counts[sev]}
                </span>
                <span className="text-xs text-primary/45 font-medium capitalize mt-0.5 block">
                  {SEVERITY[sev].label}
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-primary/30 mt-4" aria-live="polite">
          {result.issues.length} issue{result.issues.length !== 1 ? "s" : ""} found
          {" · "}
          {(result.totalTime / 1000).toFixed(1)}s
        </p>
      </div>

      {/* ── Issue list ── */}
      {sorted.length > 0 ? (
        <section aria-label={`${sorted.length} accessibility issues`}>
          <h2 className="sr-only">Detailed issue list</h2>
          <div
            className="flex flex-col gap-2 max-h-[440px] overflow-y-auto rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            tabIndex={0}
            role="list"
            aria-label={`Scrollable list of ${sorted.length} issues`}
          >
            {sorted.map((issue) => (
              <IssueCard key={issue.id} issue={issue} />
            ))}
          </div>
        </section>
      ) : (
        <div
          className="text-center py-12 bg-white rounded-2xl border border-primary/8"
          role="status"
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            className="mx-auto mb-3"
            aria-hidden="true"
          >
            <circle cx="20" cy="20" r="18" stroke="#16C172" strokeWidth="2" />
            <path
              d="M12 20l6 6 10-12"
              stroke="#16C172"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="font-semibold text-primary">No issues detected</p>
          <p className="text-sm text-primary/45 mt-1">This page passes all static checks.</p>
        </div>
      )}

      {/* ── Action ── */}
      <div className="flex justify-center mt-8">
        <button
          onClick={onReset}
          className="
            px-6 py-2.5 rounded-xl text-sm font-semibold
            border-2 border-primary/15 text-primary/70
            hover:border-accent hover:text-accent
            active:scale-95
            transition-all duration-150
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
          "
          aria-label="Go back and analyze another URL"
        >
          Analyze another URL
        </button>
      </div>
    </div>
  );
}
