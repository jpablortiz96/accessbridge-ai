"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import BridgeIcon from "@/components/BridgeIcon";
import AgentTimeline, {
  AGENT_META, AGENT_ORDER, INITIAL_AGENTS,
  type AgentUIState,
} from "@/components/AgentTimeline";
import ResponsibleAIPanel from "@/components/responsible-ai-panel";
import type { AnalysisResult, AccessibilityIssue, AgentResult } from "@/types/agents";

// ─── Utilities ────────────────────────────────────────────────────────────────

function scoreColor(s: number) {
  return s < 40 ? "#EF4444" : s < 70 ? "#F59E0B" : "#16C172";
}
function scoreLabel(s: number) {
  if (s >= 90) return "Excellent";
  if (s >= 70) return "Good";
  if (s >= 40) return "Needs Work";
  return "Poor";
}

function highlightHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // tag name: <div or </div
    .replace(
      /(&lt;\/?)([A-Za-z][\w.-]*)/g,
      '<span style="color:#93C5FD">$1</span><span style="color:#c084fc;font-weight:500">$2</span>',
    )
    // attribute name before ="
    .replace(
      / ([\w-:@.]+)="/g,
      ' <span style="color:#fde68a">$1</span>="',
    )
    // closing bracket
    .replace(/(&gt;)/g, '<span style="color:#93C5FD">$1</span>');
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href: url, download: filename,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: "#FEF2F2", text: "#B91C1C", border: "#FECACA" },
  major:    { bg: "#FFFBEB", text: "#B45309", border: "#FDE68A" },
  minor:    { bg: "#F9FAFB", text: "#6B7280", border: "#E5E7EB" },
};

const CATEGORY_META = [
  { key: "perceivable",    label: "Perceivable",    icon: "👁",  sub: "Images, contrast, media"       },
  { key: "operable",       label: "Operable",       icon: "⌨️", sub: "Keyboard, navigation, timing"  },
  { key: "understandable", label: "Understandable", icon: "💡", sub: "Readability, predictability"    },
  { key: "robust",         label: "Robust",         icon: "🔒", sub: "Parsing, ARIA, compatibility"  },
] as const;

// ─── Animated score counter ───────────────────────────────────────────────────

function AnimatedScore({ target }: { target: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const start    = Date.now();
    const duration = 1400;
    let raf: number;

    const step = () => {
      const progress = Math.min((Date.now() - start) / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return <>{count}</>;
}

// ─── Score dashboard section ──────────────────────────────────────────────────

function ScoreDashboard({ result }: { result: AnalysisResult }) {
  const { scoreBefore, scoreAfter, scoreBreakdown, issues } = result;
  const fixed       = issues.filter((i) => i.fixApplied).length;
  const remaining   = issues.filter((i) => !i.fixApplied).length;
  const improvement = scoreAfter - scoreBefore;
  const arrowColor  = improvement > 0 ? "#16C172" : improvement < 0 ? "#EF4444" : "#9CA3AF";

  return (
    <section aria-labelledby="results-heading" className="space-y-6">
      <h2 id="results-heading" className="text-lg font-bold text-primary">
        Accessibility Score
      </h2>

      {/* ── Score hero ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 flex-wrap">

        {/* Big animated score */}
        <div>
          <div
            className="text-7xl font-bold leading-none tabular-nums"
            style={{ color: scoreColor(scoreAfter) }}
            aria-label={`Accessibility score after fixes: ${scoreAfter} out of 100`}
          >
            <AnimatedScore target={scoreAfter} />
          </div>
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {/* Quality badge */}
            <span
              className="px-2.5 py-1 rounded-full text-xs font-bold"
              style={{
                background: scoreColor(scoreAfter) + "18",
                color: scoreColor(scoreAfter),
                border: `1.5px solid ${scoreColor(scoreAfter)}40`,
              }}
            >
              {scoreLabel(scoreAfter)}
            </span>
            {/* Improvement badge */}
            {improvement > 10 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-fade-in">
                ⬆ +{improvement} pts improved
              </span>
            )}
          </div>
        </div>

        {/* Before → After comparison */}
        <div className="flex items-center gap-3">
          <div className="text-center px-4 py-3 rounded-2xl bg-primary/4 border border-primary/8">
            <div className="text-[10px] font-mono uppercase tracking-widest text-primary/35 mb-1">
              Before
            </div>
            <div className="text-3xl font-bold text-primary/50 tabular-nums">{scoreBefore}</div>
            <div className="text-[10px] text-primary/30 mt-0.5">{scoreLabel(scoreBefore)}</div>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center gap-1">
            <svg width="36" height="22" viewBox="0 0 36 22" fill="none" aria-hidden="true">
              <path
                d="M2 11h28M22 3l9 8-9 8"
                stroke={arrowColor}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {improvement !== 0 && (
              <span
                className="text-[11px] font-bold tabular-nums"
                style={{ color: arrowColor }}
              >
                {improvement > 0 ? `+${improvement}` : improvement}
              </span>
            )}
          </div>

          <div
            className="text-center px-4 py-3 rounded-2xl border"
            style={{
              background: scoreColor(scoreAfter) + "10",
              borderColor: scoreColor(scoreAfter) + "35",
            }}
          >
            <div
              className="text-[10px] font-mono uppercase tracking-widest mb-1"
              style={{ color: scoreColor(scoreAfter) + "aa" }}
            >
              After
            </div>
            <div
              className="text-3xl font-bold tabular-nums"
              style={{ color: scoreColor(scoreAfter) }}
            >
              {scoreAfter}
            </div>
            <div
              className="text-[10px] font-semibold mt-0.5"
              style={{ color: scoreColor(scoreAfter) }}
            >
              {scoreLabel(scoreAfter)}
            </div>
          </div>
        </div>

        {/* Issue counter chips */}
        <div className="flex gap-3 sm:ml-auto">
          <div className="px-3 py-2.5 rounded-xl bg-white border border-primary/8 text-center min-w-[70px]">
            <div className="text-2xl font-bold text-primary tabular-nums">{issues.length}</div>
            <div className="text-[11px] text-primary/45 mt-0.5">Total</div>
          </div>
          <div className="px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center min-w-[70px]">
            <div className="text-2xl font-bold text-emerald-700 tabular-nums">{fixed}</div>
            <div className="text-[11px] text-emerald-600 mt-0.5">Fixed</div>
          </div>
          <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-center min-w-[70px]">
            <div className="text-2xl font-bold text-red-700 tabular-nums">{remaining}</div>
            <div className="text-[11px] text-red-600 mt-0.5">Remaining</div>
          </div>
        </div>
      </div>

      {/* ── WCAG breakdown cards ── */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        aria-label="WCAG category scores"
      >
        {CATEGORY_META.map(({ key, label, icon, sub }) => {
          const cat   = scoreBreakdown[key as keyof typeof scoreBreakdown];
          const delta = cat.after - cat.before;
          return (
            <div
              key={key}
              className="bg-white rounded-2xl border border-primary/8 p-4 hover:shadow-sm transition-shadow duration-200"
              aria-label={`${label}: ${cat.before} before, ${cat.after} after`}
            >
              {/* Icon + label */}
              <div className="flex items-center gap-1.5 mb-0.5">
                <span aria-hidden="true" className="text-base">{icon}</span>
                <span className="text-xs font-bold text-primary/70">{label}</span>
              </div>
              {/* Sub description */}
              <p className="text-[10px] text-primary/35 mb-3 leading-relaxed">{sub}</p>

              {/* Score + delta badge */}
              <div className="flex items-end gap-1.5 mb-3">
                <span className="text-2xl font-bold text-primary leading-none tabular-nums">
                  {cat.after}
                </span>
                {delta !== 0 && (
                  <span
                    className="text-[11px] font-bold mb-0.5 px-1.5 py-0.5 rounded-full"
                    style={{
                      background: delta > 0 ? "#ECFDF5" : "#FEF2F2",
                      color:      delta > 0 ? "#059669" : "#DC2626",
                    }}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                )}
              </div>

              {/* Thick progress bar with gradient */}
              <div className="h-2.5 rounded-full bg-primary/8 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${cat.after}%`,
                    background: `linear-gradient(90deg, ${scoreColor(cat.after)}70, ${scoreColor(cat.after)})`,
                  }}
                />
              </div>

              {/* "was X" indicator */}
              {delta !== 0 && (
                <div className="mt-1.5 text-[10px] text-primary/30 tabular-nums">
                  was {cat.before}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Issues list section ──────────────────────────────────────────────────────

type SevFilter    = "all" | "critical" | "major" | "minor";
type StatusFilter = "all" | "fixed" | "unfixed";

function IssuesList({ issues, mode }: { issues: AccessibilityIssue[]; mode: string }) {
  const [sev,    setSev]    = useState<SevFilter>("all");
  const [agent,  setAgent]  = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = issues.filter((i) => {
    if (sev    !== "all" && i.severity  !== sev)    return false;
    if (agent  !== "all" && i.agentType !== agent)  return false;
    if (status === "fixed"   && !i.fixApplied)      return false;
    if (status === "unfixed" &&  i.fixApplied)      return false;
    return true;
  });

  const FilterBtn = ({
    active, onClick, children,
  }: {
    active: boolean; onClick: () => void; children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-150 border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        active
          ? "bg-primary text-white border-primary"
          : "bg-white text-primary/60 border-primary/12 hover:border-primary/25"
      }`}
      aria-pressed={active}
    >
      {children}
    </button>
  );

  return (
    <section aria-labelledby="issues-heading" className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 id="issues-heading" className="text-lg font-bold text-primary">
          Issues{" "}
          <span className="text-sm font-normal text-primary/40">
            ({filtered.length} of {issues.length})
          </span>
        </h2>
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap gap-2 p-3 bg-white rounded-2xl border border-primary/8"
        role="group"
        aria-label="Filter issues"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-primary/40 font-medium mr-1">Severity:</span>
          {(["all", "critical", "major", "minor"] as SevFilter[]).map((v) => (
            <FilterBtn key={v} active={sev === v} onClick={() => setSev(v)}>
              {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
            </FilterBtn>
          ))}
        </div>
        <div className="w-px bg-primary/10 mx-1 hidden sm:block" aria-hidden="true" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-primary/40 font-medium mr-1">Agent:</span>
          {(["all", ...AGENT_ORDER.filter((k) => k !== "orchestrator")] as string[]).map((v) => (
            <FilterBtn key={v} active={agent === v} onClick={() => setAgent(v)}>
              {v === "all" ? "All" : AGENT_META[v as keyof typeof AGENT_META]?.label ?? v}
            </FilterBtn>
          ))}
        </div>
        <div className="w-px bg-primary/10 mx-1 hidden sm:block" aria-hidden="true" />
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-primary/40 font-medium mr-1">Status:</span>
          {(["all", "fixed", "unfixed"] as StatusFilter[]).map((v) => (
            <FilterBtn key={v} active={status === v} onClick={() => setStatus(v)}>
              {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
            </FilterBtn>
          ))}
        </div>
      </div>

      {/* Issue cards */}
      {filtered.length === 0 ? (
        <p className="text-sm text-primary/40 text-center py-8">
          No issues match the current filters.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Accessibility issues list">
          {filtered.map((issue) => {
            const sev     = SEVERITY_COLORS[issue.severity] ?? SEVERITY_COLORS.minor;
            const agMeta  = AGENT_META[issue.agentType as keyof typeof AGENT_META];
            return (
              <li
                key={issue.id}
                className="bg-white rounded-2xl border border-primary/8 overflow-hidden"
                style={{ borderLeftWidth: 4, borderLeftColor: sev.border }}
              >
                <div className="p-4">
                  {/* Top row */}
                  <div className="flex items-center flex-wrap gap-2 mb-2">
                    {/* Severity badge */}
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ background: sev.bg, color: sev.text }}
                    >
                      {issue.severity}
                    </span>
                    {/* WCAG rule */}
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-primary/5 text-primary/60">
                      WCAG {issue.wcagRule} {issue.wcagLevel}
                    </span>
                    {/* Category */}
                    <span className="text-xs text-primary/40 capitalize">{issue.category}</span>
                    {/* Agent badge */}
                    {agMeta && (
                      <span
                        className="ml-auto px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: agMeta.color + "18", color: agMeta.color }}
                      >
                        {agMeta.emoji} {agMeta.label}
                      </span>
                    )}
                    {/* Offline Vision accuracy note */}
                    {mode === "offline" && issue.agentType === "vision" && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        ⚡ Offline — reduced accuracy
                      </span>
                    )}
                    {/* Fix status */}
                    {issue.fixApplied ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                        ✓ Fixed
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/5 text-primary/40">
                        Suggested
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-primary/80 leading-relaxed">{issue.description}</p>

                  {/* Element snippet */}
                  {issue.element && issue.element !== "unknown" && (
                    <p className="mt-1.5 text-xs font-mono text-primary/35 truncate">
                      {issue.element.slice(0, 120)}
                    </p>
                  )}

                  {/* Suggestion or fix description */}
                  <div className="mt-3 flex items-start gap-2">
                    <span
                      className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] mt-0.5"
                      style={{
                        background: issue.fixApplied ? "#ECFDF5" : "#F3F4F6",
                        color:      issue.fixApplied ? "#059669" : "#9CA3AF",
                      }}
                      aria-hidden="true"
                    >
                      {issue.fixApplied ? "✓" : "!"}
                    </span>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: issue.fixApplied ? "#059669" : "#6B7280" }}
                    >
                      {issue.fixApplied && issue.fixDescription
                        ? issue.fixDescription
                        : issue.suggestion}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Change summary helpers ───────────────────────────────────────────────────

type RawFix = AgentResult["fixes"][number];
type AnnotatedFix = RawFix & { agentType: string; applied: boolean };

function changeLabel(attr: string | undefined, newVal: string): string {
  switch (attr) {
    case "alt":         return newVal === "" ? "Set decorative (alt empty)" : "Alt text added";
    case "textContent": return "Text simplified";
    case "tagName":     return "Heading level corrected";
    case "aria-label":  return "ARIA label added";
    case "prepend":     return "Element inserted";
    case "scope":       return "Table scope set";
    case "role":        return "ARIA role added";
    case "lang":        return "Language attribute set";
    default:            return attr ? `${attr} updated` : "Fix applied";
  }
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ─── Change summary panel ─────────────────────────────────────────────────────

function ChangeSummary({
  agentResults,
  issues,
}: {
  agentResults: AgentResult[];
  issues: AccessibilityIssue[];
}) {
  // Build flat list annotated with agent + whether the fix was actually applied
  const allFixes: AnnotatedFix[] = agentResults.flatMap((ar) =>
    ar.fixes.map((fix) => {
      // A fix is "applied" if there's a matching issue that was marked fixApplied
      const matched = issues.find(
        (i) =>
          i.agentType === ar.agentType &&
          i.selector  === fix.selector &&
          i.fixApplied,
      );
      return { ...fix, agentType: ar.agentType, applied: !!matched };
    }),
  );

  if (allFixes.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-primary/40">
        No fixes were proposed for this page.
      </div>
    );
  }

  const applied   = allFixes.filter((f) => f.applied);
  const suggested = allFixes.filter((f) => !f.applied);

  const FixRow = ({ fix }: { fix: AnnotatedFix }) => {
    const agMeta = AGENT_META[fix.agentType as keyof typeof AGENT_META];
    const label  = changeLabel(fix.attribute, fix.newValue);
    const isHtml = fix.attribute === "prepend";

    // "before" display
    const beforeEmpty = !fix.oldValue || fix.oldValue.trim() === "";
    const beforeText  = beforeEmpty ? null : truncate(fix.oldValue, 80);

    // "after" display
    const afterText = isHtml
      ? "(element added to DOM)"
      : truncate(fix.newValue, 100);

    return (
      <li className="group flex flex-col gap-2 px-4 py-3.5 border-b border-primary/5 last:border-none hover:bg-primary/2 transition-colors duration-100">
        {/* Top row: agent + change type + applied badge */}
        <div className="flex items-center flex-wrap gap-2">
          {agMeta && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: agMeta.color + "15", color: agMeta.color }}
            >
              <span aria-hidden="true">{agMeta.emoji}</span>
              {agMeta.label}
            </span>
          )}
          <span className="text-[11px] font-semibold text-primary/60">{label}</span>
          {fix.applied ? (
            <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              ✓ Applied
            </span>
          ) : (
            <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/5 text-primary/40">
              Suggested
            </span>
          )}
        </div>

        {/* Selector */}
        <code className="text-[10px] font-mono text-primary/30 truncate block">
          {fix.selector}
        </code>

        {/* Before / After */}
        <div className="flex flex-col sm:flex-row gap-2 text-xs">
          {/* Before */}
          <div className="flex-1 rounded-xl bg-red-50 border border-red-100 px-3 py-2">
            <span className="block text-[10px] font-semibold text-red-400 uppercase tracking-wide mb-1">
              Before
            </span>
            {beforeEmpty ? (
              <em className="text-red-300 not-italic">(empty)</em>
            ) : (
              <span className="text-red-700 line-through leading-relaxed break-words">
                {beforeText}
              </span>
            )}
          </div>

          {/* Arrow */}
          <div
            className="flex items-center justify-center text-primary/20 sm:w-6 flex-shrink-0"
            aria-hidden="true"
          >
            →
          </div>

          {/* After */}
          <div className="flex-1 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2">
            <span className="block text-[10px] font-semibold text-emerald-500 uppercase tracking-wide mb-1">
              After
            </span>
            <span
              className="leading-relaxed break-words"
              style={{ color: isHtml ? "#9CA3AF" : "#065F46", fontStyle: isHtml ? "italic" : "normal" }}
            >
              {afterText}
            </span>
          </div>
        </div>

        {/* Reason */}
        {fix.reason && (
          <p className="text-[10px] text-primary/30 leading-relaxed">
            {truncate(fix.reason, 120)}
          </p>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      {applied.length > 0 && (
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-primary/35 mb-2 px-1">
            Auto-applied — {applied.length} fix{applied.length !== 1 ? "es" : ""}
          </h3>
          <ul
            className="rounded-2xl border border-primary/8 overflow-hidden bg-white"
            aria-label="Applied fixes"
          >
            {applied.map((fix, i) => <FixRow key={i} fix={fix} />)}
          </ul>
        </div>
      )}

      {suggested.length > 0 && (
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-primary/35 mb-2 px-1">
            Suggested for review — {suggested.length}
          </h3>
          <ul
            className="rounded-2xl border border-primary/8 overflow-hidden bg-white"
            aria-label="Suggested fixes"
          >
            {suggested.map((fix, i) => <FixRow key={i} fix={fix} />)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Improved decision timeline ───────────────────────────────────────────────

const EVENT_STATUS_COLOR: Record<string, string> = {
  working:  "#3B82F6",
  done:     "#16C172",
  error:    "#EF4444",
  conflict: "#F59E0B",
  idle:     "#9CA3AF",
};

function DecisionTimeline({ result }: { result: AnalysisResult }) {
  const events   = result.agentEvents;
  if (events.length === 0) return null;

  const t0       = events[0].timestamp;
  const lastEvt  = events[events.length - 1];
  const isFinal  = (i: number) => i === events.length - 1;

  return (
    <div
      role="list"
      aria-label="Agent decision timeline"
      className="relative max-h-[520px] overflow-y-auto"
    >
      {/* Vertical rail */}
      <div
        className="absolute left-[28px] top-4 bottom-4 w-px bg-primary/8"
        aria-hidden="true"
      />

      {events.map((evt, i) => {
        const agMeta     = AGENT_META[evt.agentType as keyof typeof AGENT_META];
        const statusColor = EVENT_STATUS_COLOR[evt.status] ?? "#9CA3AF";
        const isConflict  = evt.status === "conflict";
        const isError     = evt.status === "error";
        const isFinalEvt  = isFinal(i);
        const relMs       = evt.timestamp - t0;
        const relLabel    = relMs < 1000
          ? `+${relMs}ms`
          : `+${(relMs / 1000).toFixed(1)}s`;

        return (
          <div
            key={i}
            role="listitem"
            className={`relative flex items-start gap-3 px-4 py-3 ${
              isConflict
                ? "bg-amber-50/70"
                : isFinalEvt
                ? "bg-emerald-50/40"
                : ""
            }`}
            aria-label={`${evt.agentType} — ${evt.message}`}
          >
            {/* Node circle on the rail */}
            <div
              className="relative z-10 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm"
              style={{ background: statusColor + "18", border: `1.5px solid ${statusColor}40` }}
              aria-hidden="true"
            >
              {agMeta ? agMeta.emoji : "🤖"}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center flex-wrap gap-2 mb-0.5">
                {/* Relative time */}
                <span className="text-[10px] font-mono text-primary/30 flex-shrink-0">
                  {relLabel}
                </span>

                {/* Agent badge */}
                {agMeta && (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: agMeta.color + "15", color: agMeta.color }}
                  >
                    {agMeta.label}
                  </span>
                )}

                {/* Status badge for notable states */}
                {isConflict && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                    ⚠️ Conflict
                  </span>
                )}
                {isError && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                    Error
                  </span>
                )}
                {isFinalEvt && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                    ✓ Complete
                  </span>
                )}
              </div>

              {/* Message */}
              <p
                className={`text-xs leading-relaxed ${
                  isFinalEvt ? "font-semibold text-primary/80" : "text-primary/60"
                }`}
              >
                {evt.message}
              </p>
            </div>
          </div>
        );
      })}

      {/* Summary footer */}
      <div className="sticky bottom-0 px-4 py-2.5 bg-white/90 border-t border-primary/8 flex items-center gap-3 text-[11px] text-primary/40 font-mono">
        <span>{events.length} events</span>
        <span aria-hidden="true">·</span>
        <span>
          {lastEvt.timestamp - t0 < 1000
            ? `${lastEvt.timestamp - t0}ms total`
            : `${((lastEvt.timestamp - t0) / 1000).toFixed(1)}s total`}
        </span>
        <span aria-hidden="true">·</span>
        <span>{result.conflicts.length} conflict{result.conflicts.length !== 1 ? "s" : ""} resolved</span>
      </div>
    </div>
  );
}

// ─── Details section (3-tab shell) ───────────────────────────────────────────

function DecisionLog({ result }: { result: AnalysisResult }) {
  const [tab, setTab] = useState<"changes" | "raw" | "log">("changes");
  const leftRef       = useRef<HTMLPreElement>(null);
  const rightRef      = useRef<HTMLPreElement>(null);
  const syncing       = useRef(false);

  const syncScroll = (from: "left" | "right") => {
    if (syncing.current) return;
    syncing.current = true;
    const src = from === "left" ? leftRef.current  : rightRef.current;
    const dst = from === "left" ? rightRef.current : leftRef.current;
    if (src && dst) dst.scrollTop = src.scrollTop;
    syncing.current = false;
  };

  const TABS = [
    { id: "changes" as const, label: "Changes" },
    { id: "raw"     as const, label: "Raw HTML" },
    { id: "log"     as const, label: "Decision Log" },
  ];

  return (
    <section aria-labelledby="log-heading" className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 id="log-heading" className="text-lg font-bold text-primary">
          Details
        </h2>

        {/* Tab switcher */}
        <div
          className="flex gap-1 p-1 bg-primary/5 rounded-xl"
          role="tablist"
          aria-label="Detail view tabs"
        >
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              aria-controls={`tabpanel-${id}`}
              onClick={() => setTab(id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                tab === id
                  ? "bg-white text-primary shadow-sm"
                  : "text-primary/50 hover:text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: Changes (default) ── */}
      {tab === "changes" && (
        <div
          id="tabpanel-changes"
          role="tabpanel"
          aria-labelledby="tab-changes"
        >
          <ChangeSummary agentResults={result.agentResults} issues={result.issues} />
        </div>
      )}

      {/* ── Tab: Raw HTML side-by-side ── */}
      {tab === "raw" && (
        <div
          id="tabpanel-raw"
          role="tabpanel"
          aria-labelledby="tab-raw"
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          {(["original", "transformed"] as const).map((which) => {
            const htmlStr = which === "original" ? result.originalHtml : result.transformedHtml;
            const isLeft  = which === "original";
            const title   = isLeft ? "Original HTML" : "Accessible HTML";
            const sub     = isLeft
              ? `Score: ${result.scoreBefore}`
              : `Score: ${result.scoreAfter} (+${result.improvement})`;

            return (
              <div key={which} className="flex flex-col bg-[#0F172A] rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
                  <span className="text-xs font-semibold text-white/70">{title}</span>
                  <span
                    className="text-xs font-mono"
                    style={{ color: scoreColor(isLeft ? result.scoreBefore : result.scoreAfter) }}
                  >
                    {sub}
                  </span>
                </div>
                <pre
                  ref={isLeft ? leftRef : rightRef}
                  onScroll={() => syncScroll(isLeft ? "left" : "right")}
                  className="flex-1 overflow-auto p-4 text-[11px] leading-relaxed font-mono text-white/70 whitespace-pre-wrap break-all"
                  style={{ maxHeight: 400 }}
                  tabIndex={0}
                  aria-label={`${title} code`}
                  dangerouslySetInnerHTML={{ __html: highlightHtml(htmlStr) }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tab: Decision Log ── */}
      {tab === "log" && (
        <div
          id="tabpanel-log"
          role="tabpanel"
          aria-labelledby="tab-log"
          className="bg-white rounded-2xl border border-primary/8 overflow-hidden"
        >
          <DecisionTimeline result={result} />
        </div>
      )}
    </section>
  );
}

// ─── Main analyze content ─────────────────────────────────────────────────────

function AnalyzeContent() {
  const searchParams = useSearchParams();
  const targetUrl    = searchParams.get("url") ?? "";
  const mode         = (searchParams.get("mode") ?? "cloud") as "cloud" | "offline";

  const [agents,  setAgents]  = useState<AgentUIState[]>(INITIAL_AGENTS);
  const [phase,   setPhase]   = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result,  setResult]  = useState<AnalysisResult | null>(null);
  const [errMsg,  setErrMsg]  = useState("");

  // Dynamic page title — runs client-side only
  useEffect(() => {
    if (!targetUrl) return;
    try {
      const host = new URL(targetUrl).hostname;
      document.title = `Analysis — ${host} | AccessBridge AI`;
    } catch {
      document.title = "Analysis | AccessBridge AI";
    }
    return () => { document.title = "AccessBridge AI — AI-Powered Universal Accessibility"; };
  }, [targetUrl]);

  // ── Kick off analysis on mount ────────────────────────────────────────────
  const runAnalysis = useCallback(() => {
    if (!targetUrl) return;
    setPhase("loading");
    setAgents(INITIAL_AGENTS);
    setResult(null);
    setErrMsg("");

    const controller = new AbortController();

    // Simulate sequential agent activation while waiting
    const DELAYS = [0, 450, 750, 1050, 1350];
    const timers = DELAYS.map((delay, i) =>
      setTimeout(() => {
        setAgents((prev) =>
          prev.map((a, idx) => (idx === i ? { ...a, status: "working" } : a)),
        );
      }, delay),
    );

    (async () => {
      try {
        const res  = await fetch("/api/analyze", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ url: targetUrl, mode }),
          signal:  controller.signal,
        });

        const data: { success?: boolean; result?: AnalysisResult; error?: string } =
          await res.json().catch(() => ({ error: "Invalid server response" }));

        if (!res.ok || !data.result) {
          throw new Error(data.error ?? `Server error (${res.status})`);
        }

        timers.forEach(clearTimeout);

        const r = data.result;

        // Build final agent states from real data
        setAgents(
          AGENT_ORDER.map((key) => {
            if (key === "orchestrator") {
              const totalFixes = r.agentResults.reduce((n, ar) => n + ar.fixes.length, 0);
              return { key, status: "done", issueCount: 0, fixCount: totalFixes, duration: r.totalTime };
            }
            const ar = r.agentResults.find((x) => x.agentType === key);
            return {
              key,
              status:     ar ? "done" : "error",
              issueCount: ar?.issues.length ?? 0,
              fixCount:   ar?.fixes.length  ?? 0,
              duration:   ar ? ar.endTime - ar.startTime : 0,
            };
          }),
        );

        setResult(r);
        setPhase("done");
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        timers.forEach(clearTimeout);
        setAgents((prev) =>
          prev.map((a, i) =>
            i === 0 ? { ...a, status: "error" } : { ...a, status: "idle" },
          ),
        );
        setErrMsg(err instanceof Error ? err.message : "Analysis failed. Please try again.");
        setPhase("error");
      }
    })();

    return () => {
      timers.forEach(clearTimeout);
      controller.abort();
    };
  }, [targetUrl, mode]);

  useEffect(() => {
    const cleanup = runAnalysis();
    return cleanup;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Missing URL guard ────────────────────────────────────────────────────
  if (!targetUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-20">
        <p className="text-primary/50 mb-6">No URL provided.</p>
        <Link
          href="/"
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← Back to home
        </Link>
      </div>
    );
  }

  const isLoading = phase === "loading";

  return (
    <>
      {/* ── Skip link ── */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-lg focus:font-medium"
      >
        Skip to main content
      </a>

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-[#FAFAFA]/90 backdrop-blur-sm border-b border-primary/6 px-6 py-3 flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="AccessBridge AI — return to home"
        >
          <BridgeIcon size={28} />
          <span className="font-display font-semibold text-primary text-sm tracking-tight">
            AccessBridge<span className="text-accent"> AI</span>
          </span>
        </Link>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-primary/40 truncate font-mono">{targetUrl}</p>
        </div>

        {/* Mode chip */}
        {mode === "offline" ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <span aria-hidden="true">📦</span>
            <span>OFFLINE</span>
          </span>
        ) : (
          <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/5 text-primary/60">
            ☁️ Cloud
          </span>
        )}
      </header>

      {/* ── Main ── */}
      <main id="main-content" className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 space-y-12">

        {/* ─── Section 1: Agent Timeline ─────────────────────────────────────── */}
        <section aria-labelledby="timeline-heading">
          <div className="flex items-center justify-between mb-5">
            <h1 id="timeline-heading" className="text-lg font-bold text-primary">
              {isLoading ? "Analyzing…" : phase === "error" ? "Analysis failed" : "Analysis complete"}
            </h1>
            {result && (
              <span className="text-xs text-primary/40 font-mono">
                {result.totalTime < 1000
                  ? `${result.totalTime}ms`
                  : `${(result.totalTime / 1000).toFixed(1)}s`}
              </span>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-primary/8 p-6">
            <AgentTimeline
              agents={agents}
              conflicts={result?.conflicts ?? []}
            />

            {/* Error message */}
            {phase === "error" && (
              <div
                role="alert"
                className="mt-4 p-4 rounded-2xl bg-red-50 border border-red-200"
              >
                <p className="text-sm font-semibold text-red-800 mb-1">Analysis failed</p>
                <p className="text-sm text-red-700">{errMsg}</p>
                <button
                  onClick={runAnalysis}
                  className="mt-3 px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ─── Sections 2–4: shown when done ─────────────────────────────────── */}
        {result && (
          <>
            {/* ─── Offline mode banner ─────────────────────────────────────── */}
            {mode === "offline" && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-amber-50 border border-amber-200"
              >
                <span className="text-xl flex-shrink-0 mt-0.5" aria-hidden="true">📦</span>
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Running in Offline Mode
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                    Running in Offline Mode — using local heuristics and rule-based analysis.
                    Scanner and Navigator provide full accuracy. Vision uses smart heuristics
                    (link context, captions, filenames) and Simplifier splits long sentences
                    deterministically — both are auto-applied at reduced confidence.
                    For AI-powered analysis, switch to Cloud mode.{" "}
                    <a
                      href={`/analyze?url=${encodeURIComponent(result.url)}&mode=cloud`}
                      className="underline font-semibold hover:text-amber-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-700"
                    >
                      Switch to cloud for AI-powered analysis →
                    </a>
                  </p>
                </div>
              </div>
            )}

            {/* ─── Section 2: Score Dashboard ──────────────────────────────── */}
            <div className="bg-white rounded-3xl border border-primary/8 p-6">
              <ScoreDashboard result={result} />
            </div>

            {/* ─── Section 3: Responsible AI ───────────────────────────────── */}
            <div className="bg-white rounded-3xl border border-primary/8 p-6">
              <ResponsibleAIPanel result={result} />
            </div>

            {/* ─── Section 4: Issues List ───────────────────────────────────── */}
            <div className="bg-white rounded-3xl border border-primary/8 p-6">
              <IssuesList issues={result.issues} mode={mode} />
            </div>

            {/* ─── Section 4: Before/After + Log ───────────────────────────── */}
            <div className="bg-white rounded-3xl border border-primary/8 p-6">
              <DecisionLog result={result} />
            </div>

            {/* ─── Call to Action banner ────────────────────────────────────── */}
            <div
              className="rounded-3xl overflow-hidden"
              style={{ background: "linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)" }}
            >
              <div className="px-6 sm:px-10 py-10 text-center space-y-4">
                {/* Headline */}
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs font-semibold mb-2">
                  <span aria-hidden="true">♿</span>
                  Accessibility made easy
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-white leading-snug">
                  Ready to make your website accessible?
                </h2>
                <p className="text-sm text-white/55 max-w-md mx-auto leading-relaxed">
                  Download the accessible HTML and replace your current page —
                  or review each suggestion and apply changes at your own pace.
                </p>

                {/* Score callout */}
                <div className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/8 border border-white/10">
                  <span className="text-white/50 text-xs">Accessibility score</span>
                  <span className="text-primary/40 text-xs" aria-hidden="true">→</span>
                  <span
                    className="text-xl font-bold tabular-nums"
                    style={{ color: scoreColor(result.scoreAfter) }}
                  >
                    {result.scoreAfter}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: scoreColor(result.scoreAfter) }}>
                    {scoreLabel(result.scoreAfter)}
                  </span>
                </div>

                {/* Buttons */}
                <div
                  className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 pt-2"
                  aria-label="Export and navigation actions"
                >
                  <button
                    onClick={() =>
                      triggerDownload(result.transformedHtml, "accessible.html", "text/html")
                    }
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-bold text-primary active:scale-95 transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    style={{ background: "linear-gradient(135deg, #16C172 0%, #10B981 100%)" }}
                    aria-label="Download the accessible version of the HTML"
                  >
                    <span aria-hidden="true">⬇</span>
                    Download Accessible HTML
                  </button>

                  <button
                    onClick={() =>
                      triggerDownload(
                        JSON.stringify(result, null, 2),
                        "accessbridge-report.json",
                        "application/json",
                      )
                    }
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold text-white border-2 border-white/25 hover:border-white/50 active:scale-95 transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label="Download the full analysis report as JSON"
                  >
                    <span aria-hidden="true">📄</span>
                    Full Report (JSON)
                  </button>

                  <Link
                    href="/"
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold text-white/60 hover:text-white active:scale-95 transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-label="Go back to the home page to analyze another URL"
                  >
                    <span aria-hidden="true">←</span>
                    Analyze Another URL
                  </Link>
                </div>
              </div>
            </div>
            {/* Bottom spacing */}
            <div className="pb-8" />
          </>
        )}
      </main>
    </>
  );
}

// ─── Page export (Suspense required for useSearchParams) ─────────────────────

export default function AnalyzePage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm text-primary/40 animate-pulse">Loading…</div>
          </div>
        }
      >
        <AnalyzeContent />
      </Suspense>
    </div>
  );
}
