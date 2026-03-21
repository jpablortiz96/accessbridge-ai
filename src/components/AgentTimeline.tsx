"use client";

import type { ConflictResolution } from "@/types/agents";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgentKey = "orchestrator" | "scanner" | "vision" | "simplifier" | "navigator";

export interface AgentUIState {
  key: AgentKey;
  status: "idle" | "working" | "done" | "error";
  issueCount: number;
  fixCount: number;
  duration: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export const AGENT_ORDER: AgentKey[] = [
  "orchestrator", "scanner", "vision", "simplifier", "navigator",
];

export const AGENT_META: Record<AgentKey, { color: string; emoji: string; label: string }> = {
  orchestrator: { color: "#6366F1", emoji: "🎯", label: "Orchestrator" },
  scanner:      { color: "#F59E0B", emoji: "🔍", label: "Scanner"      },
  vision:       { color: "#EC4899", emoji: "👁",  label: "Vision"       },
  simplifier:   { color: "#10B981", emoji: "✏️",  label: "Simplifier"   },
  navigator:    { color: "#3B82F6", emoji: "🧭", label: "Navigator"    },
};

export const INITIAL_AGENTS: AgentUIState[] = AGENT_ORDER.map((key) => ({
  key,
  status: "idle",
  issueCount: 0,
  fixCount: 0,
  duration: 0,
}));

// Per-agent working status text (shown while the agent is running)
const WORKING_LABELS: Record<AgentKey, string> = {
  orchestrator: "Coordinating agents…",
  scanner:      "Scanning HTML structure…",
  vision:       "Analyzing images…",
  simplifier:   "Evaluating readability…",
  navigator:    "Checking navigation…",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function conflictsAfterAgent(key: AgentKey, conflicts: ConflictResolution[]) {
  const idx = AGENT_ORDER.indexOf(key);
  return conflicts.filter((c) => {
    const a = AGENT_ORDER.indexOf(c.agents[0] as AgentKey);
    const b = AGENT_ORDER.indexOf(c.agents[1] as AgentKey);
    return Math.max(a, b) === idx;
  });
}

function statusLabel(agent: AgentUIState): string {
  switch (agent.status) {
    case "idle":    return "Waiting…";
    case "working": return WORKING_LABELS[agent.key];
    case "done":
      if (agent.key === "orchestrator") {
        return agent.fixCount > 0 ? `Done — ${agent.fixCount} fix(es) applied` : "Done";
      }
      return agent.issueCount === 0
        ? "Done — no issues"
        : `Found ${agent.issueCount} issue${agent.issueCount !== 1 ? "s" : ""}`;
    case "error": return "Error";
  }
}

// ─── Spinner SVG ──────────────────────────────────────────────────────────────

function Spinner({ color }: { color: string }) {
  return (
    <svg
      className="animate-spin w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ color }}
    >
      <circle
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-20"
      />
      <path
        fill="currentColor"
        className="opacity-80"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AgentCircle({ agent }: { agent: AgentUIState }) {
  const meta      = AGENT_META[agent.key];
  const isWorking = agent.status === "working";
  const isDone    = agent.status === "done";
  const isError   = agent.status === "error";

  return (
    <div className="relative flex-shrink-0" style={{ width: 48, height: 48 }}>
      {/* Pulse ring when working */}
      {isWorking && (
        <span
          className="absolute inset-0 rounded-full animate-ping opacity-25"
          style={{ backgroundColor: meta.color }}
          aria-hidden="true"
        />
      )}

      {/* Main circle */}
      <div
        className="relative w-12 h-12 rounded-full flex items-center justify-center select-none transition-all duration-300"
        style={{
          backgroundColor: agent.status === "idle" ? "#F3F4F6" : meta.color + "20",
          border: `2.5px solid ${agent.status === "idle" ? "#E5E7EB" : meta.color}`,
          transform: isDone ? "scale(1.08)" : "scale(1)",
          boxShadow: isDone ? `0 0 0 3px ${meta.color}20` : "none",
        }}
        aria-hidden="true"
      >
        {isError ? (
          <span className="text-red-500 text-base font-bold">✕</span>
        ) : isWorking ? (
          <Spinner color={meta.color} />
        ) : (
          <span
            className="text-xl"
            style={{ filter: agent.status === "idle" ? "grayscale(1) opacity(0.4)" : "none" }}
          >
            {meta.emoji}
          </span>
        )}
      </div>

      {/* Done check badge — bounces in */}
      {isDone && (
        <span
          className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold animate-bounce-in"
          style={{ backgroundColor: meta.color }}
          aria-hidden="true"
        >
          ✓
        </span>
      )}
    </div>
  );
}

function ConflictCard({ conflict }: { conflict: ConflictResolution }) {
  const metaA = AGENT_META[conflict.agents[0] as AgentKey];
  const metaB = AGENT_META[conflict.agents[1] as AgentKey];
  return (
    <div
      role="note"
      aria-label={`Conflict between ${metaA?.label ?? conflict.agents[0]} and ${metaB?.label ?? conflict.agents[1]}`}
      className="ml-14 my-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 animate-slide-up"
    >
      <div className="flex items-center gap-2 mb-1">
        <span aria-hidden="true">⚠️</span>
        <span className="text-xs font-semibold text-amber-800">
          Conflict: {metaA?.label ?? conflict.agents[0]} ↔ {metaB?.label ?? conflict.agents[1]}
        </span>
      </div>
      <p className="text-xs text-amber-700 leading-snug">{conflict.resolution}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AgentTimelineProps {
  agents: AgentUIState[];
  conflicts: ConflictResolution[];
}

export default function AgentTimeline({ agents, conflicts }: AgentTimelineProps) {
  return (
    <div
      role="list"
      aria-label="Agent activity timeline"
      className="space-y-0"
    >
      {agents.map((agent, i) => {
        const meta        = AGENT_META[agent.key];
        const isLast      = i === agents.length - 1;
        const myConflicts = conflictsAfterAgent(agent.key, conflicts);

        return (
          <div key={agent.key}>
            {/* ── Agent row ── */}
            <div
              role="listitem"
              className="flex items-start gap-4"
              aria-label={`${meta.label}: ${statusLabel(agent)}`}
            >
              {/* Left column: circle + connector */}
              <div className="flex flex-col items-center">
                <AgentCircle agent={agent} />
                {!isLast && (
                  <div
                    className="w-0.5 flex-1 mt-1 transition-colors duration-500"
                    style={{
                      backgroundColor: agent.status === "done" ? meta.color + "50" : "#E5E7EB",
                      minHeight: 28,
                    }}
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Right column: name + status + progress */}
              <div className="flex-1 pt-2 pb-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: agent.status === "idle" ? "#9CA3AF" : meta.color }}
                  >
                    {meta.label}
                  </span>

                  {/* Status badge */}
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium transition-all duration-300"
                    style={
                      agent.status === "idle"
                        ? { background: "#F3F4F6", color: "#9CA3AF" }
                        : agent.status === "working"
                        ? { background: meta.color + "18", color: meta.color }
                        : agent.status === "done"
                        ? { background: "#ECFDF5", color: "#059669" }
                        : { background: "#FEF2F2", color: "#EF4444" }
                    }
                  >
                    {statusLabel(agent)}
                  </span>

                  {/* Duration chip */}
                  {agent.status === "done" && agent.duration > 0 && (
                    <span className="text-xs text-primary/30 font-mono animate-fade-in">
                      {agent.duration < 1000
                        ? `${agent.duration}ms`
                        : `${(agent.duration / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>

                {/* Progress bar */}
                <div
                  className="mt-2.5 h-2 rounded-full overflow-hidden bg-primary/5"
                  aria-hidden="true"
                  style={{ maxWidth: 220 }}
                >
                  {agent.status === "working" ? (
                    /* Animated fill while working */
                    <div
                      key={`${agent.key}-working`}
                      className="h-full rounded-full animate-progress-fill"
                      style={{ backgroundColor: meta.color }}
                    />
                  ) : (
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width:
                          agent.status === "idle" ? "0%"
                          : agent.status === "done" ? "100%"
                          : "100%",
                        backgroundColor:
                          agent.status === "error" ? "#EF4444" : meta.color,
                        opacity: agent.status === "idle" ? 0 : 1,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* ── Conflict cards that belong after this agent ── */}
            {myConflicts.map((c) => (
              <ConflictCard key={c.id} conflict={c} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
