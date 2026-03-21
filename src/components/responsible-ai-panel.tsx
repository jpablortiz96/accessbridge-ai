"use client";

import { useState } from "react";
import type { AnalysisResult, AgentEvent } from "@/types/agents";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function confBadge(conf: number) {
  if (conf > 0.8)  return { tier: "High", bg: "#ECFDF5", text: "#065F46", border: "#A7F3D0" };
  if (conf >= 0.5) return { tier: "Med",  bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" };
  return                  { tier: "Low",  bg: "#FEF2F2", text: "#991B1B", border: "#FECACA" };
}

function fmtTs(ms: number) {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ─── Agent meta for the reasoning log ─────────────────────────────────────────

const AGENT_COLOR: Record<string, string> = {
  orchestrator: "#6366F1",
  scanner:      "#F59E0B",
  vision:       "#EC4899",
  simplifier:   "#10B981",
  navigator:    "#3B82F6",
};

const AGENT_EMOJI: Record<string, string> = {
  orchestrator: "🎯",
  scanner:      "🔍",
  vision:       "👁",
  simplifier:   "✏️",
  navigator:    "🧭",
};

const STATUS_COLOR: Record<string, string> = {
  working:  "#3B82F6",
  done:     "#16C172",
  error:    "#EF4444",
  conflict: "#F59E0B",
  idle:     "#9CA3AF",
};

// ─── Expandable reasoning log ─────────────────────────────────────────────────

function ReasoningLog({ events }: { events: AgentEvent[] }) {
  const [open, setOpen] = useState(false);

  // Interesting events: conflicts first, then done completions with applied fixes, then errors
  const notable = events
    .filter((e) => e.status === "done" || e.status === "conflict" || e.status === "error")
    .sort((a, b) => {
      // Conflicts → errors → done
      const rank = (s: string) => s === "conflict" ? 0 : s === "error" ? 1 : 2;
      return rank(a.status) - rank(b.status);
    });

  const conflicts = notable.filter((e) => e.status === "conflict");
  const applied   = notable.filter(
    (e) => e.status === "done" && typeof e.data?.confidence === "number" && (e.data.confidence as number) >= 0.8,
  );

  return (
    <div className="mt-4 border border-primary/10 rounded-2xl overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="reasoning-log-body"
        className="w-full flex items-center justify-between px-5 py-3.5 bg-primary/3 hover:bg-primary/5 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent text-left"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-sm" aria-hidden="true">📋</span>
          <span className="text-sm font-semibold text-primary">Agent Reasoning Log</span>
          {conflicts.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
              ⚠️ {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""}
            </span>
          )}
          {applied.length > 0 && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              ✓ {applied.length} high-confidence fix{applied.length !== 1 ? "es" : ""}
            </span>
          )}
          <span className="text-xs text-primary/35 font-mono">
            {notable.length} key decision{notable.length !== 1 ? "s" : ""}
          </span>
        </div>
        <span
          className="text-primary/40 text-xs font-medium transition-transform duration-200 flex-shrink-0"
          style={{ transform: open ? "rotate(180deg)" : "none", display: "inline-block" }}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>

      {/* Log body */}
      {open && (
        <div
          id="reasoning-log-body"
          role="region"
          aria-label="Agent reasoning decisions"
        >
          <ol
            className="divide-y divide-primary/5 max-h-80 overflow-y-auto"
            aria-label="Notable agent events"
          >
            {notable.length === 0 ? (
              <li className="px-5 py-4 text-xs text-primary/40 text-center">
                No notable events recorded.
              </li>
            ) : (
              notable.map((evt, i) => {
                const color   = STATUS_COLOR[evt.status] ?? "#9CA3AF";
                const agColor = AGENT_COLOR[evt.agentType] ?? "#6B7280";
                const agEmoji = AGENT_EMOJI[evt.agentType] ?? "🤖";
                const isConf  = evt.status === "conflict";
                const isError = evt.status === "error";
                const conf    = typeof evt.data?.confidence === "number"
                  ? evt.data.confidence as number
                  : null;
                const isHighConf = conf !== null && conf >= 0.8;

                return (
                  <li
                    key={i}
                    className={`flex items-start gap-3 px-5 py-3.5 ${
                      isConf  ? "bg-amber-50/70 border-l-2 border-amber-300"
                      : isError ? "bg-red-50/50 border-l-2 border-red-300"
                      : isHighConf ? "bg-emerald-50/40"
                      : ""
                    }`}
                  >
                    {/* Status dot */}
                    <span
                      className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />

                    {/* Timestamp */}
                    <span className="flex-shrink-0 text-[11px] font-mono text-primary/30 pt-px w-16">
                      {fmtTs(evt.timestamp)}
                    </span>

                    {/* Agent badge */}
                    <span
                      className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: agColor + "18", color: agColor }}
                    >
                      <span aria-hidden="true">{agEmoji}</span>
                      <span className="capitalize">{evt.agentType}</span>
                    </span>

                    {/* Message */}
                    <span
                      className={`text-xs leading-relaxed flex-1 ${
                        isConf ? "text-amber-800 font-medium"
                        : isError ? "text-red-700"
                        : "text-primary/70"
                      }`}
                    >
                      {isConf && (
                        <span className="inline-flex items-center gap-1 mr-1">
                          <span aria-hidden="true">⚠️</span>
                          <span className="font-bold">Conflict:</span>
                        </span>
                      )}
                      {evt.message}
                    </span>

                    {/* Confidence badge */}
                    {conf !== null && (
                      <span
                        className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border"
                        style={{
                          background:  confBadge(conf).bg,
                          color:       confBadge(conf).text,
                          borderColor: confBadge(conf).border,
                        }}
                        aria-label={`Confidence: ${Math.round(conf * 100)}%`}
                      >
                        {Math.round(conf * 100)}%
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ol>

          {/* Full log footnote */}
          <div className="px-5 py-2.5 bg-primary/2 border-t border-primary/6">
            <p className="text-[11px] text-primary/35">
              Showing {notable.length} notable events · {events.length} total logged ·{" "}
              <span className="italic">Full timeline in the Decision Log tab below</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  result: AnalysisResult;
}

export default function ResponsibleAIPanel({ result }: Props) {
  const { issues, agentResults, agentEvents, mode } = result;

  // ── Compute dynamic values ───────────────────────────────────────────────

  const totalDecisions  = agentEvents.length;
  const suggestedCount  = issues.filter((i) => !i.fixApplied).length;

  // Confidence breakdown across all issues
  const highConf   = issues.filter((i) => i.fixApplied && i.confidence > 0.8).length;
  const medConf    = issues.filter((i) => !i.fixApplied && i.confidence >= 0.5 && i.confidence <= 0.8).length;
  const lowConf    = issues.filter((i) => !i.fixApplied && i.confidence < 0.5).length;

  // ── Card definitions ─────────────────────────────────────────────────────

  const CARDS = [
    {
      icon:  "🔍",
      title: "Transparency",
      color: "#6366F1",
      body:  "Every agent decision is logged with reasoning and confidence scores.",
      metric: (
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-primary tabular-nums">{totalDecisions}</span>
          <span className="text-xs text-primary/50">decisions logged</span>
        </div>
      ),
      indicator: "Full decision log available below",
    },
    {
      icon:  "👤",
      title: "Human-in-the-Loop",
      color: "#10B981",
      body:  "Low-confidence fixes are marked as suggestions, not auto-applied.",
      metric: (
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold text-primary tabular-nums">{suggestedCount}</span>
          <span className="text-xs text-primary/50">
            suggestion{suggestedCount !== 1 ? "s" : ""} await review
          </span>
        </div>
      ),
      indicator: `${issues.filter((i) => i.fixApplied).length} fixes auto-applied`,
    },
    {
      icon:  "📊",
      title: "Confidence Scoring",
      color: "#F59E0B",
      body:  "Each fix includes a confidence score. Only high-confidence fixes are applied automatically.",
      metric: (
        <dl className="space-y-1.5 w-full">
          {[
            { label: "High (>80%)",     count: highConf, ...confBadge(0.9)  },
            { label: "Medium (50–80%)", count: medConf,  ...confBadge(0.65) },
            { label: "Low (<50%)",      count: lowConf,  ...confBadge(0.3)  },
          ].map(({ label, count, bg, text, border }) => (
            <div key={label} className="flex items-center justify-between">
              <dt className="text-xs text-primary/55">{label}</dt>
              <dd>
                <span
                  className="text-xs font-semibold px-1.5 py-0.5 rounded border"
                  style={{ background: bg, color: text, borderColor: border }}
                >
                  {count}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ),
      indicator: "Confidence calculated per-issue",
    },
    {
      icon:  "🔒",
      title: "Privacy & Safety",
      color: "#3B82F6",
      body:  "No user data stored. All processing is ephemeral. Content safety filters applied.",
      metric: (
        <div className="space-y-1.5">
          {[
            "Session-only processing",
            "Zero data retention",
            `${mode === "cloud" ? "☁️ Cloud" : "📦 Offline"} mode`,
          ].map((tag) => (
            <div key={tag} className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: "#10B981" }}
                aria-hidden="true"
              />
              <span className="text-xs text-primary/60">{tag}</span>
            </div>
          ))}
        </div>
      ),
      indicator: "GDPR & CCPA compliant by design",
    },
  ] as const;

  // ── Agent summary row ────────────────────────────────────────────────────

  const agentSummary = agentResults.map((ar) => ({
    type:       ar.agentType,
    issues:     ar.issues.length,
    fixes:      ar.fixes.length,
    confidence: ar.confidence,
    duration:   ar.endTime - ar.startTime,
  }));

  return (
    <section
      aria-labelledby="rai-heading"
      className="space-y-5"
    >
      {/* Heading */}
      <div className="flex items-center gap-3">
        <h2 id="rai-heading" className="text-lg font-bold text-primary">
          Responsible AI
        </h2>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
          Hackathon compliance
        </span>
      </div>

      <p className="text-sm text-primary/50 leading-relaxed -mt-1">
        AccessBridge AI is built with responsible AI principles at its core.
        Every agent decision is explainable, auditable, and keeps humans in control.
      </p>

      {/* ── 4 cards ── */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        role="list"
        aria-label="Responsible AI principles"
      >
        {CARDS.map((card) => (
          <article
            key={card.title}
            role="listitem"
            className="bg-white rounded-2xl border border-primary/8 p-4 flex flex-col gap-3 hover:border-primary/16 hover:shadow-sm transition-all duration-200"
            aria-label={card.title}
          >
            {/* Icon + title */}
            <header>
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg mb-2.5"
                style={{ background: card.color + "12", border: `1.5px solid ${card.color}28` }}
                aria-hidden="true"
              >
                {card.icon}
              </div>
              <h3 className="text-sm font-bold text-primary leading-tight">{card.title}</h3>
            </header>

            {/* Body text */}
            <p className="text-xs text-primary/55 leading-relaxed flex-1">
              {card.body}
            </p>

            {/* Dynamic metric */}
            <div className="mt-auto">
              {card.metric}
            </div>

            {/* Indicator footer */}
            <footer className="pt-2 border-t border-primary/6">
              <p
                className="text-[10px] font-medium uppercase tracking-wide"
                style={{ color: card.color }}
              >
                {card.indicator}
              </p>
            </footer>
          </article>
        ))}
      </div>

      {/* ── Per-agent confidence table ── */}
      {agentSummary.length > 0 && (
        <div
          className="bg-white rounded-2xl border border-primary/8 overflow-hidden"
          aria-label="Per-agent confidence summary"
        >
          <div className="px-5 py-3 border-b border-primary/6">
            <h3 className="text-sm font-semibold text-primary">Agent Confidence Summary</h3>
          </div>
          <table className="w-full text-xs" role="table">
            <thead>
              <tr className="border-b border-primary/5 bg-primary/2">
                <th scope="col" className="text-left px-5 py-2.5 font-semibold text-primary/50">Agent</th>
                <th scope="col" className="text-center px-4 py-2.5 font-semibold text-primary/50">Issues found</th>
                <th scope="col" className="text-center px-4 py-2.5 font-semibold text-primary/50">Fixes proposed</th>
                <th scope="col" className="text-center px-4 py-2.5 font-semibold text-primary/50">Confidence</th>
                <th scope="col" className="text-right px-5 py-2.5 font-semibold text-primary/50">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary/5">
              {agentSummary.map((a) => {
                const badge = confBadge(a.confidence);
                const color = AGENT_COLOR[a.type] ?? "#6B7280";
                const emoji = AGENT_EMOJI[a.type] ?? "🤖";
                return (
                  <tr key={a.type} className="hover:bg-primary/2 transition-colors duration-100">
                    <td className="px-5 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 font-medium px-2 py-0.5 rounded-full"
                        style={{ background: color + "12", color }}
                      >
                        <span aria-hidden="true">{emoji}</span>
                        <span className="capitalize">{a.type}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-primary/70">{a.issues}</td>
                    <td className="px-4 py-3 text-center font-mono text-primary/70">{a.fixes}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border"
                        style={{
                          background:  badge.bg,
                          color:       badge.text,
                          borderColor: badge.border,
                        }}
                      >
                        {Math.round(a.confidence * 100)}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-primary/40">
                      {a.duration < 1000 ? `${a.duration}ms` : `${(a.duration / 1000).toFixed(1)}s`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Expandable reasoning log ── */}
      <ReasoningLog events={agentEvents} />
    </section>
  );
}
