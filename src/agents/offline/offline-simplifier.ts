// Offline Simplifier Agent — deterministic sentence splitting without Azure OpenAI.
// Splits long sentences (>30 words) at natural break points.
// Confidence 0.6 → orchestrator auto-applies fixes.
// Server-side only.

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentType,
  AgentStatus,
  IssueSeverity,
} from '@/types/agents';
import type { BaseAgent, AgentResult, AccessibilityIssue } from '@/types/agents';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_BLOCKS         = 6;
const MIN_WORDS          = 30;
const MAX_SENTENCE_WORDS = 30;

// Conjunctions / subordinators that make good sentence-break points
const BREAK_WORDS = new Set([
  'and', 'or', 'but', 'however', 'although', 'though', 'while',
  'which', 'that', 'because', 'since', 'if', 'when', 'where',
  'whereas', 'despite', 'therefore', 'furthermore', 'moreover',
]);

// ─── Sentence helpers ─────────────────────────────────────────────────────────

/** Split text into sentences, preserving terminating punctuation. */
function toSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Deterministically split a long sentence at the best break point.
 *
 * Strategy:
 *   1. Look near the midpoint (±30% window) for a comma.
 *   2. If no comma, look for a BREAK_WORD preceded by a comma or at word start.
 *   3. If still nothing, split at the midpoint word.
 *
 * Returns two trimmed sentence fragments joined by ". ".
 */
function splitSentence(sentence: string): string | null {
  const words = sentence.split(/\s+/);
  if (words.length <= MAX_SENTENCE_WORDS) return null;

  const mid   = Math.floor(words.length / 2);
  const lo    = Math.floor(mid * 0.6);
  const hi    = Math.ceil(mid * 1.4);

  // ── Pass 1: comma within window ──────────────────────────────────────────
  for (let i = hi; i >= lo; i--) {
    if (words[i - 1]?.endsWith(',')) {
      const left  = words.slice(0, i).join(' ').replace(/,\s*$/, '');
      const right = words.slice(i).join(' ');
      const rightCap = right.charAt(0).toUpperCase() + right.slice(1);
      return `${left}. ${rightCap}`;
    }
  }

  // ── Pass 2: conjunction within window ────────────────────────────────────
  for (let i = lo; i <= hi; i++) {
    const w = words[i]?.toLowerCase().replace(/[^a-z]/g, '') ?? '';
    if (BREAK_WORDS.has(w)) {
      // Split BEFORE the conjunction (drop it to avoid "But." starting a sentence)
      const left  = words.slice(0, i).join(' ').replace(/[,]\s*$/, '');
      const rest  = words.slice(i + 1).join(' ');
      if (!rest.trim()) break;
      const restCap = rest.charAt(0).toUpperCase() + rest.slice(1);
      return `${left}. ${restCap}`;
    }
  }

  // ── Pass 3: hard split at midpoint ───────────────────────────────────────
  const left  = words.slice(0, mid).join(' ').replace(/[,]\s*$/, '');
  const right = words.slice(mid).join(' ');
  const rightCap = right.charAt(0).toUpperCase() + right.slice(1);
  return `${left}. ${rightCap}`;
}

/**
 * Rewrite a block of text by splitting every long sentence.
 * Returns the rewritten text (or null if nothing changed).
 */
function simplifyBlock(text: string): string | null {
  const sentences = toSentences(text);
  let changed = false;
  const output: string[] = [];

  for (const s of sentences) {
    const words = s.split(/\s+/).length;
    if (words > MAX_SENTENCE_WORDS) {
      const split = splitSentence(s);
      if (split) {
        output.push(split);
        changed = true;
        continue;
      }
    }
    output.push(s);
  }

  return changed ? output.join(' ') : null;
}

/** Build a stable selector for a block element. */
function blockSelector(
  $el: cheerio.Cheerio<Element>,
  el: Element,
): string {
  const id      = $el.attr('id');
  if (id) return `${el.name}#${id}`;
  const cls     = ($el.attr('class') ?? '').split(/\s+/).filter(Boolean)[0];
  if (cls) return `${el.name}.${cls}`;
  return el.name ?? 'p';
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export class OfflineSimplifierAgent implements BaseAgent {
  readonly name        = 'Offline Simplifier Agent';
  readonly type        = AgentType.SIMPLIFIER;
  readonly description =
    'Splits long sentences (>30 words) at natural break points ' +
    '(commas, conjunctions). Deterministic — no AI required.';

  async analyze(html: string, _url: string): Promise<AgentResult> {
    const startTime = Date.now();
    const $         = cheerio.load(html);
    const issues:   AccessibilityIssue[] = [];
    const fixes:    AgentResult['fixes'] = [];

    // Only target simple <p> tags — avoids clobbering child elements
    const candidates = $('p').toArray() as Element[];
    let blocksFixed  = 0;

    for (const el of candidates) {
      if (blocksFixed >= MAX_BLOCKS) break;

      const $el = $(el) as cheerio.Cheerio<Element>;

      // Skip paragraphs that contain child elements (links, spans, etc.)
      // to avoid $el.text() clobbering their markup
      if ($el.children().length > 0) continue;

      const text      = $el.text().trim();
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      if (wordCount < MIN_WORDS) continue;

      const sentences    = toSentences(text);
      const longSentence = sentences.find((s) => s.split(/\s+/).length > MAX_SENTENCE_WORDS);
      if (!longSentence) continue;

      const newText = simplifyBlock(text);
      if (!newText || newText === text) continue;

      const selector = blockSelector($el, el);
      blocksFixed++;

      issues.push({
        id:          uuidv4(),
        severity:    IssueSeverity.MINOR,
        wcagRule:    '3.1.5',
        wcagLevel:   'AAA',
        category:    'understandable',
        description:
          `Paragraph contains sentence(s) over ${MAX_SENTENCE_WORDS} words — ` +
          `split at natural break point offline.`,
        element:     text.slice(0, 120) + (text.length > 120 ? '…' : ''),
        selector,
        suggestion:  `Sentences split at commas / conjunctions for readability.`,
        fixApplied:     false,   // orchestrator sets this after applying
        fixDescription: `Sentence split applied. New text starts: "${newText.slice(0, 80)}…"`,
        agentType:      AgentType.SIMPLIFIER,
        confidence:     0.6,
        isEnhancement:  true,
      });

      fixes.push({
        selector,
        attribute: 'textContent',
        oldValue:  text,
        newValue:  newText,
        reason:    `Sentence(s) over ${MAX_SENTENCE_WORDS} words split at comma/conjunction`,
      });
    }

    return {
      agentType:  AgentType.SIMPLIFIER,
      status:     AgentStatus.DONE,
      issues,
      fixes,
      metadata: {
        blocksFixed,
        offlineMode: true,
        strategy:    'deterministic-sentence-split',
      },
      startTime,
      endTime:    Date.now(),
      confidence: 0.6,  // ≥0.5 → orchestrator auto-applies
    };
  }
}
