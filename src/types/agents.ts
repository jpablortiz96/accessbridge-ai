export enum AgentType {
  ORCHESTRATOR = 'orchestrator',
  SCANNER = 'scanner',
  VISION = 'vision',
  SIMPLIFIER = 'simplifier',
  NAVIGATOR = 'navigator'
}

export enum AgentStatus {
  IDLE = 'idle',
  WORKING = 'working',
  DONE = 'done',
  ERROR = 'error',
  CONFLICT = 'conflict'
}

export enum IssueSeverity {
  CRITICAL = 'critical',
  MAJOR = 'major',
  MINOR = 'minor'
}

export interface AgentEvent {
  timestamp: number;
  agentType: AgentType;
  status: AgentStatus;
  message: string;
  data?: any;
}

export interface AccessibilityIssue {
  id: string;
  severity: IssueSeverity;
  wcagRule: string;
  wcagLevel: 'A' | 'AA' | 'AAA';
  category: 'perceivable' | 'operable' | 'understandable' | 'robust';
  description: string;
  element: string;
  selector: string;
  suggestion: string;
  fixApplied: boolean;
  fixDescription?: string;
  agentType: AgentType;
  confidence: number;
  /** True for Vision / Simplifier issues that represent *improvements* AccessBridge
   *  found, not pre-existing defects. These are shown in the UI but never penalise
   *  scoreBefore, and their fixes (if applied) add to scoreAfter. */
  isEnhancement?: boolean;
}

export interface ConflictResolution {
  id: string;
  agents: [AgentType, AgentType];
  description: string;
  resolution: string;
  winner: AgentType;
  reasoning: string;
  timestamp: number;
}

export interface AgentResult {
  agentType: AgentType;
  status: AgentStatus;
  issues: AccessibilityIssue[];
  fixes: Array<{
    selector: string;
    attribute?: string;
    oldValue: string;
    newValue: string;
    reason: string;
  }>;
  metadata: Record<string, any>;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface AnalysisResult {
  id: string;
  url: string;
  originalHtml: string;
  transformedHtml: string;
  issues: AccessibilityIssue[];
  agentResults: AgentResult[];
  conflicts: ConflictResolution[];
  scoreBefore: number;
  scoreAfter: number;
  improvement: number;
  scoreBreakdown: {
    perceivable: { before: number; after: number };
    operable: { before: number; after: number };
    understandable: { before: number; after: number };
    robust: { before: number; after: number };
  };
  agentEvents: AgentEvent[];
  totalTime: number;
  mode: 'cloud' | 'offline';
}

export interface BaseAgent {
  name: string;
  type: AgentType;
  description: string;
  analyze(html: string, url: string, context?: any): Promise<AgentResult>;
}
