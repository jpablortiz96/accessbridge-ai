// ─── Agent Enums ────────────────────────────────────────────────────────────

export enum AgentType {
  ORCHESTRATOR = "ORCHESTRATOR",
  SCANNER = "SCANNER",
  VISION = "VISION",
  SIMPLIFIER = "SIMPLIFIER",
  NAVIGATOR = "NAVIGATOR",
}

export enum AgentStatus {
  IDLE = "IDLE",
  WORKING = "WORKING",
  DONE = "DONE",
  ERROR = "ERROR",
  CONFLICT = "CONFLICT",
}

// ─── Message Types ───────────────────────────────────────────────────────────

export type MessageType =
  | "task_assign"
  | "task_complete"
  | "issue_found"
  | "conflict"
  | "resolution"
  | "status_update"
  | "error";

export interface AgentMessage {
  id: string;
  from: AgentType;
  to: AgentType | "broadcast";
  type: MessageType;
  content: string;
  payload?: Record<string, unknown>;
  timestamp: Date;
}

// ─── Accessibility Types ─────────────────────────────────────────────────────

export type Severity = "critical" | "serious" | "moderate" | "minor";

export interface AccessibilityIssue {
  id: string;
  severity: Severity;
  wcagRule: string; // e.g. "1.4.3", "2.1.1"
  wcagLevel: "A" | "AA" | "AAA";
  description: string;
  element: string; // CSS selector or HTML snippet
  suggestion: string;
  fixApplied: boolean;
  detectedBy: AgentType;
}

// ─── Conflict Resolution ─────────────────────────────────────────────────────

export interface ConflictResolution {
  id: string;
  agents: AgentType[];
  description: string;
  resolution: string;
  rule: string; // The WCAG rule or heuristic used to resolve
  timestamp: Date;
}

// ─── Analysis Result ─────────────────────────────────────────────────────────

export interface AnalysisResult {
  id: string;
  url: string;
  originalHtml: string;
  transformedHtml: string;
  issues: AccessibilityIssue[];
  score: number; // 0–100
  agentLogs: AgentMessage[];
  conflicts: ConflictResolution[];
  duration: number; // ms
  createdAt: Date;
}

// ─── Agent State ─────────────────────────────────────────────────────────────

export interface AgentState {
  type: AgentType;
  status: AgentStatus;
  currentTask?: string;
  issuesFound: number;
  lastMessage?: AgentMessage;
}

// ─── UI / App State ──────────────────────────────────────────────────────────

export type AnalysisMode = "cloud" | "offline";

export interface AppState {
  mode: AnalysisMode;
  isAnalyzing: boolean;
  result: AnalysisResult | null;
  agents: AgentState[];
  error: string | null;
}
