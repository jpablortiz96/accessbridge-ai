import { EventEmitter } from 'events';
import * as cheerio from 'cheerio';
import { v4 as uuidv4 } from 'uuid';
import { ScannerAgent }    from './scanner';
import { VisionAgent }     from './vision';
import { SimplifierAgent } from './simplifier';
import { NavigatorAgent }  from './navigator';
// Offline variants
import { OfflineScannerAgent }    from './offline/offline-scanner';
import { OfflineVisionAgent }     from './offline/offline-vision';
import { OfflineSimplifierAgent } from './offline/offline-simplifier';
import { OfflineNavigatorAgent }  from './offline/offline-navigator';
import { AgentType, AgentStatus } from '@/types/agents';
import type {
  AgentEvent,
  AnalysisResult,
  AgentResult,
  ConflictResolution,
  BaseAgent,
  AccessibilityIssue,
} from '@/types/agents';

// ─── Score helpers ────────────────────────────────────────────────────────────

type IssueLike = Pick<
  AccessibilityIssue,
  'severity' | 'category' | 'fixApplied' | 'agentType' | 'isEnhancement'
>;

/**
 * scoreBefore — only real pre-existing defects (Scanner + Navigator).
 * Enhancement issues (Vision/Simplifier alt-text gaps, readability) never
 * appear here because they weren't "broken" before AccessBridge arrived.
 */
function calcScoreBefore(issues: IssueLike[]): number {
  const baseline = issues.filter(
    i => !i.isEnhancement &&
         (i.agentType === AgentType.SCANNER || i.agentType === AgentType.NAVIGATOR),
  );
  let score = 100;
  for (const i of baseline) {
    if (i.severity === 'critical')    score -= 10;
    else if (i.severity === 'major')  score -= 5;
    else                              score -= 2;
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * scoreAfter — take scoreBefore, then ADD points for every fix successfully applied.
 * Applied fixes are discovered by checking fixApplied on the mutated issue objects.
 *
 * Points per applied fix:
 *   Vision (alt text)        +3
 *   Navigator (structure)    +4
 *   Simplifier (text)        +2
 *   Scanner                  +3  (rare, future-proof)
 */
const FIX_POINTS: Partial<Record<AgentType, number>> = {
  [AgentType.VISION]:     3,
  [AgentType.NAVIGATOR]:  4,
  [AgentType.SIMPLIFIER]: 2,
  [AgentType.SCANNER]:    3,
};

function calcScoreAfter(issues: IssueLike[], before: number): number {
  let gain = 0;
  for (const i of issues) {
    if (!i.fixApplied) continue;
    gain += FIX_POINTS[i.agentType as AgentType] ?? 2;
  }
  return Math.max(0, Math.min(100, before + gain));
}

type ScoreBreakdown = AnalysisResult['scoreBreakdown'];

function calcBreakdown(issues: IssueLike[]): ScoreBreakdown {
  const categories = ['perceivable', 'operable', 'understandable', 'robust'] as const;
  const breakdown  = {} as ScoreBreakdown;

  for (const cat of categories) {
    // before: only non-enhancement baseline issues in this category
    const baseline = issues.filter(
      i => i.category === cat && !i.isEnhancement &&
           (i.agentType === AgentType.SCANNER || i.agentType === AgentType.NAVIGATOR),
    );
    let before = 100;
    for (const i of baseline) {
      before -= i.severity === 'critical' ? 10 : i.severity === 'major' ? 5 : 2;
    }
    before = Math.max(0, Math.min(100, before));

    // after: start from before, add gain from applied fixes in this category
    let gain = 0;
    for (const i of issues) {
      if (i.category !== cat || !i.fixApplied) continue;
      gain += FIX_POINTS[i.agentType as AgentType] ?? 2;
    }
    const after = Math.max(0, Math.min(100, before + gain));

    breakdown[cat] = { before, after };
  }

  return breakdown;
}

// ─── Conflict resolution result ───────────────────────────────────────────────

interface ResolveResult {
  conflicts:                  ConflictResolution[];
  blockedSimplifierSelectors: Set<string>;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export class AgentOrchestrator extends EventEmitter {
  private agents: BaseAgent[];
  private events: AgentEvent[];
  private mode:   'cloud' | 'offline';

  constructor(mode: 'cloud' | 'offline' = 'cloud') {
    super();
    this.mode   = mode;
    this.events = [];
    this.agents = mode === 'offline'
      ? [
          new OfflineScannerAgent(),
          new OfflineVisionAgent(),
          new OfflineSimplifierAgent(),
          new OfflineNavigatorAgent(),
        ]
      : [
          new ScannerAgent(),
          new VisionAgent(),
          new SimplifierAgent(),
          new NavigatorAgent(),
        ];
  }

  private emitEvent(event: AgentEvent): void {
    this.events.push(event);
    this.emit('agent:event', event);
  }

  // ── Main entry point ──────────────────────────────────────────────────────

  async analyze(url: string): Promise<AnalysisResult> {
    const analysisId = uuidv4();
    const startTime  = Date.now();

    this.events = [];

    // Step 1: Signal start
    this.emitEvent({
      timestamp: Date.now(),
      agentType: AgentType.ORCHESTRATOR,
      status:    AgentStatus.WORKING,
      message:   `Starting analysis of ${url}`,
    });

    if (this.mode === 'offline') {
      this.emitEvent({
        timestamp: Date.now(),
        agentType: AgentType.ORCHESTRATOR,
        status:    AgentStatus.WORKING,
        message:   'Running in OFFLINE mode — using local rule-based heuristics (no cloud AI)',
        data:      { offlineMode: true, localModelUsed: 'rule-based-heuristics' },
      });
    }

    // Step 2: Fetch HTML
    let html: string;
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'AccessBridge-AI/1.0 (Accessibility Analyzer)' },
        signal:  AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      html = await response.text();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.emitEvent({
        timestamp: Date.now(),
        agentType: AgentType.ORCHESTRATOR,
        status:    AgentStatus.ERROR,
        message:   `Failed to fetch ${url}: ${msg}`,
      });
      throw new Error(`Failed to fetch URL: ${url} — ${msg}`);
    }

    this.emitEvent({
      timestamp: Date.now(),
      agentType: AgentType.ORCHESTRATOR,
      status:    AgentStatus.WORKING,
      message:   `Fetched HTML (${html.length.toLocaleString()} chars)`,
      data:      { htmlLength: html.length },
    });

    // Step 3: Light parse to extract metadata
    const $meta    = cheerio.load(html);
    const pageTitle = $meta('title').first().text().trim() || '(no title)';

    this.emitEvent({
      timestamp: Date.now(),
      agentType: AgentType.ORCHESTRATOR,
      status:    AgentStatus.WORKING,
      message:   `Page parsed: "${pageTitle}"`,
      data:      { title: pageTitle },
    });

    // Step 4: Run all agents in parallel
    const agentResults: AgentResult[] = [];

    const settled = await Promise.all(
      this.agents.map(async (agent) => {
        this.emitEvent({
          timestamp: Date.now(),
          agentType: agent.type,
          status:    AgentStatus.WORKING,
          message:   `${agent.name} started analyzing…`,
        });

        try {
          const result = await agent.analyze(html, url);

          this.emitEvent({
            timestamp: Date.now(),
            agentType: agent.type,
            status:    AgentStatus.DONE,
            message:   `${agent.name} found ${result.issues.length} issues`,
            data:      {
              issueCount: result.issues.length,
              fixCount:   result.fixes.length,
              score:      result.metadata?.score,
            },
          });

          return result;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          this.emitEvent({
            timestamp: Date.now(),
            agentType: agent.type,
            status:    AgentStatus.ERROR,
            message:   `${agent.name} failed: ${msg}`,
          });
          return null;
        }
      })
    );

    settled.forEach(r => { if (r) agentResults.push(r); });

    // Step 5: Collect all issues.
    // Vision issues are marked isEnhancement=true by the Vision agent itself,
    // so they never affect scoreBefore regardless of severity.
    const allIssues = agentResults.flatMap(r => r.issues);

    // Step 6: Detect & resolve inter-agent conflicts
    const { conflicts, blockedSimplifierSelectors } =
      this.resolveConflicts(agentResults, html);

    if (conflicts.length > 0) {
      this.emitEvent({
        timestamp: Date.now(),
        agentType: AgentType.ORCHESTRATOR,
        status:    AgentStatus.CONFLICT,
        message:   `Resolved ${conflicts.length} inter-agent conflict(s)`,
        data:      { conflicts },
      });
    }

    // Step 7: Apply fixes — mutates fixApplied on allIssues in place
    // Priority: Vision (alt text) → Navigator (structure) → Simplifier (text)
    const transformedHtml = this.applyFixes(
      html,
      agentResults,
      allIssues,
      blockedSimplifierSelectors,
    );

    const fixesApplied = allIssues.filter(i => i.fixApplied).length;

    this.emitEvent({
      timestamp: Date.now(),
      agentType: AgentType.ORCHESTRATOR,
      status:    AgentStatus.WORKING,
      message:   `Applied ${fixesApplied} fix(es) to HTML`,
      data:      { fixesApplied, blockedByConflict: blockedSimplifierSelectors.size },
    });

    // Step 8: Score
    // scoreBefore  = pre-existing real defects (Scanner + Navigator, non-enhancement)
    // scoreAfter   = scoreBefore + points earned for every applied fix
    const scoreBefore = calcScoreBefore(allIssues);
    const scoreAfter  = calcScoreAfter(allIssues, scoreBefore);

    const result: AnalysisResult = {
      id:             analysisId,
      url,
      originalHtml:   html,
      transformedHtml,
      issues:         allIssues,
      agentResults,
      conflicts,
      scoreBefore,
      scoreAfter,
      improvement:    scoreAfter - scoreBefore,
      scoreBreakdown: calcBreakdown(allIssues),
      agentEvents:    this.events,
      totalTime:      Date.now() - startTime,
      mode:           this.mode,
    };

    this.emitEvent({
      timestamp: Date.now(),
      agentType: AgentType.ORCHESTRATOR,
      status:    AgentStatus.DONE,
      message:   `Analysis complete in ${result.totalTime}ms. Score: ${scoreBefore} → ${scoreAfter} (+${result.improvement})`,
      data:      {
        totalIssues: allIssues.length,
        totalFixes:  fixesApplied,
        scoreBefore,
        scoreAfter,
        conflicts:   conflicts.length,
      },
    });

    return result;
  }

  // ── Conflict resolution ───────────────────────────────────────────────────

  private resolveConflicts(results: AgentResult[], html: string): ResolveResult {
    const conflicts:                  ConflictResolution[] = [];
    const blockedSimplifierSelectors: Set<string>          = new Set();

    // ── 1. Same-selector + same WCAG rule from two different agents ───────────

    const seenIssues = new Map<string, { agentType: AgentType; wcagRule: string }>();

    for (const result of results) {
      for (const issue of result.issues) {
        const key      = `${issue.selector}::${issue.wcagRule}`;
        const existing = seenIssues.get(key);

        if (existing && existing.agentType !== result.agentType) {
          conflicts.push({
            id:          uuidv4(),
            agents:      [existing.agentType, result.agentType],
            description: `Both agents flagged "${issue.selector}" for WCAG ${issue.wcagRule}`,
            resolution:  'Merged: kept the most specific suggestion',
            winner:      existing.agentType,
            reasoning:   'First-reporter wins: the agent that flagged the issue earliest retains ownership',
            timestamp:   Date.now(),
          });
        } else if (!existing) {
          seenIssues.set(key, { agentType: result.agentType, wcagRule: issue.wcagRule });
        }
      }
    }

    // ── 2. Vision vs Simplifier — protect freshly-generated alt-text context ──

    const visionResult     = results.find(r => r.agentType === AgentType.VISION);
    const simplifierResult = results.find(r => r.agentType === AgentType.SIMPLIFIER);

    if (
      visionResult     && visionResult.fixes.length     > 0 &&
      simplifierResult && simplifierResult.fixes.length > 0
    ) {
      const $ = cheerio.load(html);

      // Index of selectors that Vision fixed (img elements with new alt text)
      const visionImgSelectors = visionResult.fixes
        .filter(f => f.attribute === 'alt')
        .map(f => f.selector);

      for (const simplFix of simplifierResult.fixes) {
        if (simplFix.attribute !== 'textContent') continue;

        const $block = $(simplFix.selector).first();
        if (!$block.length) continue;

        // Find the first Vision-fixed img that lives inside this text block
        let conflictingImgSel = '';
        for (const imgSel of visionImgSelectors) {
          if ($block.find(imgSel).length > 0) {
            conflictingImgSel = imgSel;
            break;
          }
        }

        if (!conflictingImgSel) continue;

        // Vision wins — block the Simplifier fix for this selector
        blockedSimplifierSelectors.add(simplFix.selector);

        const conflict: ConflictResolution = {
          id:      uuidv4(),
          agents:  [AgentType.VISION, AgentType.SIMPLIFIER],
          description:
            `Simplifier wants to rewrite text block "${simplFix.selector}", ` +
            `but it contains a Vision-generated alt text for "${conflictingImgSel}".`,
          resolution:
            'Vision Agent wins: text block will not be rewritten to preserve alt-text context.',
          winner:    AgentType.VISION,
          reasoning:
            'Alt text generated by Vision Agent is calibrated to the image\'s surrounding context. ' +
            'Rewriting that context could make the alt text misleading for screen reader users.',
          timestamp: Date.now(),
        };

        conflicts.push(conflict);

        this.emitEvent({
          timestamp: Date.now(),
          agentType: AgentType.ORCHESTRATOR,
          status:    AgentStatus.CONFLICT,
          message:
            `Vision wins over Simplifier for "${simplFix.selector}" ` +
            `— alt-text context preserved (img: "${conflictingImgSel}")`,
          data: { conflict },
        });
      }
    }

    return { conflicts, blockedSimplifierSelectors };
  }

  // ── Fix application ───────────────────────────────────────────────────────

  /**
   * Apply all agent fixes to the original HTML.
   * Priority: Vision (alt text) → Navigator (structure) → Simplifier (text).
   *
   * Mutates `allIssues` in place — sets fixApplied = true for each issue
   * whose selector was successfully patched. This is what makes scoreAfter
   * differ from scoreBefore.
   */
  private applyFixes(
    html:                       string,
    agentResults:               AgentResult[],
    allIssues:                  AccessibilityIssue[],
    blockedSimplifierSelectors: Set<string>,
  ): string {
    const $ = cheerio.load(html);

    /**
     * Mark the first unfixed issue whose selector and agentType match.
     * Uses the first match so that multiple issues on the same element
     * (e.g. two different WCAG rules on the same img) are individually tracked.
     */
    const markFixed = (selector: string, agentType: AgentType): void => {
      const issue = allIssues.find(
        i => i.selector === selector && i.agentType === agentType && !i.fixApplied,
      );
      if (issue) issue.fixApplied = true;
    };

    // ── 1. Vision: set alt attributes on images ───────────────────────────────
    // Low-confidence Vision results (< 0.5, e.g. offline heuristics) are left
    // as suggestions — the human decides whether to accept them.
    const visionResult = agentResults.find(r => r.agentType === AgentType.VISION);
    if (visionResult && visionResult.confidence >= 0.5) {
      let applied = 0;
      for (const fix of visionResult.fixes) {
        if (fix.attribute !== 'alt') continue;
        try {
          const $el = $(fix.selector).first();
          if (!$el.length) continue;
          $el.attr('alt', fix.newValue);
          markFixed(fix.selector, AgentType.VISION);
          applied++;
        } catch { /* bad selector — skip */ }
      }
    }

    // ── 2. Navigator: ARIA attributes, scope, role, skip link ─────────────────
    const navigatorResult = agentResults.find(r => r.agentType === AgentType.NAVIGATOR);
    if (navigatorResult) {
      let applied = 0;
      for (const fix of navigatorResult.fixes) {
        // tagName changes require full DOM surgery — report only, never auto-apply
        if (fix.attribute === 'tagName') continue;
        try {
          const $el = $(fix.selector).first();
          if (!$el.length) continue;

          if (fix.attribute === 'prepend') {
            $el.prepend(fix.newValue);
          } else if (fix.attribute) {
            $el.attr(fix.attribute, fix.newValue);
          } else {
            continue;
          }

          markFixed(fix.selector, AgentType.NAVIGATOR);
          applied++;
        } catch { /* bad selector — skip */ }
      }
    }

    // ── 3. Simplifier: rewrite text content (skip Vision-conflicted blocks) ───
    const simplifierResult = agentResults.find(r => r.agentType === AgentType.SIMPLIFIER);
    if (simplifierResult) {
      for (const fix of simplifierResult.fixes) {
        if (fix.attribute !== 'textContent') continue;
        if (blockedSimplifierSelectors.has(fix.selector)) continue;
        try {
          const $el = $(fix.selector).first();
          if (!$el.length) continue;
          $el.text(fix.newValue);
          markFixed(fix.selector, AgentType.SIMPLIFIER);
        } catch { /* bad selector — skip */ }
      }
    }

    return $.html();
  }
}
