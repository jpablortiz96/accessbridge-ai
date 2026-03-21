// Simplifier Agent — plain-language rewriting via Azure OpenAI (or issue-only fallback)
// Server-side only.

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { v4 as uuidv4 } from 'uuid';
import { getAzureCompletion } from '@/lib/azure-client';
import {
  AgentType,
  AgentStatus,
  IssueSeverity,
  type BaseAgent,
  type AgentResult,
  type AccessibilityIssue,
} from '@/types/agents';

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_WORDS   = 50;   // minimum words to analyse a block
const MAX_BLOCKS  = 5;    // max blocks simplified per run (API cost control)
const DELAY_MS    = 500;  // ms between Azure calls
const SCORE_SKIP  = 60;   // Flesch ≥ 60 → already simple, skip
const SCORE_MAJOR = 30;   // Flesch < 30 → major issue; 30–60 → minor

// ─── Flesch Reading Ease ──────────────────────────────────────────────────────

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function countSentences(text: string): number {
  return Math.max(1, text.split(/[.!?]+/).filter(s => s.trim().length > 0).length);
}

/** Approximate syllable count: count vowel clusters, subtract silent trailing 'e'. */
function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  const groups = w.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 1;
  if (w.length > 2 && w.endsWith('e') && !/[aeiouy]e$/.test(w)) count--;
  return Math.max(1, count);
}

/**
 * Flesch Reading Ease score.
 * 100 = very easy · 60 = standard · 30 = very difficult · 0 = incomprehensible
 */
function fleschScore(text: string): number {
  const words = countWords(text);
  if (words < 5) return 100;

  const sentences = countSentences(text);
  const wordTokens = text.trim().split(/\s+/).filter(w => w.length > 0);
  const syllables = wordTokens.reduce((sum, w) => sum + countSyllables(w), 0);

  const score = 206.835
    - 1.015 * (words / sentences)
    - 84.6  * (syllables / words);

  return Math.round(Math.max(0, Math.min(100, score)));
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

function cssEscape(str: string): string {
  return str.replace(/([^\w-])/g, '\\$1');
}

function getSelector(el: Element, $: cheerio.CheerioAPI): string {
  try {
    const parts: string[] = [];
    let current: Element | null = el;
    while (current && parts.length < 4) {
      const id = current.attribs?.id;
      if (id) { parts.unshift(`#${cssEscape(id)}`); break; }
      const cls = current.attribs?.class;
      const clsPart = cls
        ? '.' + cls.trim().split(/\s+/).slice(0, 2).map(cssEscape).join('.')
        : '';
      parts.unshift(`${current.name}${clsPart}`);
      current = current.parent?.type === 'tag' ? (current.parent as Element) : null;
    }
    return parts.join(' > ') || el.name;
  } catch { return el.name; }
}

function truncate(text: string, maxLen = 100): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

// ─── Text block discovery ─────────────────────────────────────────────────────

interface TextBlock {
  el:       Element;
  text:     string;
  score:    number;
  selector: string;
}

function findTextBlocks($: cheerio.CheerioAPI): TextBlock[] {
  const seen  = new Set<Element>();
  const blocks: TextBlock[] = [];

  // Helper: add a block if it has enough words and hasn't been seen
  const add = (el: Element, text: string) => {
    if (seen.has(el)) return;
    const words = countWords(text);
    if (words < MIN_WORDS) return;
    seen.add(el);
    blocks.push({ el, text, score: fleschScore(text), selector: getSelector(el, $) });
  };

  // 1. Paragraphs — skip those inside nav/header/footer/aside
  $('p').each((_, raw) => {
    const el = raw as Element;
    const $el = $(el);
    if ($el.closest('nav, header, footer, aside').length > 0) return;
    const text = $el.text().replace(/\s+/g, ' ').trim();
    add(el, text);
  });

  // 2. <article> / <section> with direct text only (no <p> children)
  $('article, section').each((_, raw) => {
    const el  = raw as Element;
    const $el = $(el);
    if ($el.find('p').length > 0) return; // paragraphs handled above

    // Extract only direct text nodes (not from child elements)
    const clone = $el.clone();
    clone.children().remove();
    const text = clone.text().replace(/\s+/g, ' ').trim();
    add(el, text);
  });

  return blocks;
}

// ─── Azure prompts ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  'You are a plain language expert. Rewrite the following text to be more accessible ' +
  'while preserving ALL factual information. Rules:\n' +
  '- Use shorter sentences (max 20 words per sentence)\n' +
  '- Replace jargon and technical terms with common words\n' +
  '- Use active voice instead of passive\n' +
  '- Add brief parenthetical explanations for terms that cannot be simplified\n' +
  '- Maintain the same paragraph structure\n' +
  '- Do NOT add information that was not in the original\n' +
  '- Do NOT remove important information\n' +
  '- Keep the same tone (formal stays formal, just clearer)\n\n' +
  'Respond with ONLY the simplified text, nothing else.';

function buildUserPrompt(text: string, score: number): string {
  return (
    `Original text (reading level score: ${score}/100):\n\n${text}\n\n` +
    `Simplify this text to approximately a 6th–8th grade reading level.`
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isAzureConfigured(): boolean {
  return !!(process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT);
}

function severityForScore(score: number): IssueSeverity {
  return score < SCORE_MAJOR ? IssueSeverity.MAJOR : IssueSeverity.MINOR;
}

function readingLabel(score: number): string {
  if (score >= 80) return 'very easy';
  if (score >= 60) return 'standard';
  if (score >= 30) return 'difficult';
  return 'very difficult';
}

// ─── Simplifier Agent ─────────────────────────────────────────────────────────

export class SimplifierAgent implements BaseAgent {
  readonly name        = 'Simplifier Agent';
  readonly type        = AgentType.SIMPLIFIER;
  readonly description =
    'Detects complex text using Flesch Reading Ease and rewrites it to plain language ' +
    'via Azure OpenAI. Issues are reported in fallback mode when the API is unavailable.';

  async analyze(html: string, url: string): Promise<AgentResult> {
    const startTime = Date.now();
    const issues:  AccessibilityIssue[]  = [];
    const fixes:   AgentResult['fixes']  = [];
    const $        = cheerio.load(html);
    const useAI    = isAzureConfigured();

    if (!useAI) {
      console.log('[simplifier-agent] Azure not configured — running in issue-only mode');
    }

    // ── Discover complex blocks ───────────────────────────────────────────────

    const allBlocks   = findTextBlocks($);
    const needsWork   = allBlocks.filter(b => b.score < SCORE_SKIP);
    const toProcess   = needsWork.slice(0, MAX_BLOCKS);

    let totalScoreBefore = 0;
    let totalScoreAfter  = 0;
    let blocksSimplified = 0;
    let azureCalls       = 0;
    let totalConfidence  = 0;

    // ── Process each complex block ────────────────────────────────────────────

    for (let i = 0; i < toProcess.length; i++) {
      const { el, text, score, selector } = toProcess[i];
      totalScoreBefore += score;

      // Always emit an issue regardless of AI availability
      issues.push({
        id:          uuidv4(),
        severity:    severityForScore(score),
        wcagRule:    '3.1.5',
        wcagLevel:   'AAA',
        category:    'understandable',
        description: `Text block has a Flesch Reading Ease score of ${score}/100 (${readingLabel(score)}). Complex language may be hard for users with cognitive disabilities.`,
        element:     truncate(text, 120),
        selector,
        suggestion:  useAI
          ? 'Rewriting to plain language (6th–8th grade level)…'
          : 'Rewrite using shorter sentences, simpler words, and active voice. Aim for a Flesch score above 60.',
        fixApplied:    false,
        fixDescription: undefined,
        agentType:   AgentType.SIMPLIFIER,
        confidence:  useAI ? 0.85 : 0.40,
      });

      // ── Fallback mode: issue only, no fix ────────────────────────────────

      if (!useAI) {
        totalScoreAfter += score; // unchanged
        totalConfidence += 0.40;
        continue;
      }

      // ── Azure mode: fetch simplified text ────────────────────────────────

      if (i > 0) await sleep(DELAY_MS);

      try {
        const simplified = await getAzureCompletion(
          SYSTEM_PROMPT,
          buildUserPrompt(text, score),
          { maxTokens: 600, temperature: 0.4 },
        );

        const simplifiedText  = simplified.trim();
        const scoreAfter      = fleschScore(simplifiedText);

        totalScoreAfter  += scoreAfter;
        blocksSimplified += 1;
        totalConfidence  += 0.85;
        azureCalls       += 1;

        fixes.push({
          selector,
          attribute: 'textContent',
          oldValue:  truncate(text, 100),
          newValue:  truncate(simplifiedText, 100),
          reason:    `Simplified from reading level ${score}/100 to ${scoreAfter}/100`,
        });

        // Update the issue with the fix description
        const issue = issues[issues.length - 1];
        issue.fixApplied    = false; // HTML not yet mutated
        issue.fixDescription = truncate(simplifiedText, 200);
        issue.suggestion     = `Simplified version: "${truncate(simplifiedText, 120)}"`;

      } catch (err) {
        console.warn(`[simplifier-agent] Azure call failed for block ${i + 1}:`, err);
        totalScoreAfter += score; // no improvement
        totalConfidence += 0.40;
        // No fix added — leave just the issue
      }
    }

    // Blocks skipped as already simple contribute to the "after" average unchanged
    const skippedCount = allBlocks.length - needsWork.length;
    const skippedScoreSum = allBlocks
      .filter(b => b.score >= SCORE_SKIP)
      .reduce((sum, b) => sum + b.score, 0);

    const totalTracked = toProcess.length + skippedCount;
    const avgBefore = totalTracked > 0
      ? Math.round((totalScoreBefore + skippedScoreSum) / totalTracked)
      : 100;
    const avgAfter = totalTracked > 0
      ? Math.round((totalScoreAfter + skippedScoreSum) / totalTracked)
      : 100;

    const avgConfidence = toProcess.length > 0
      ? parseFloat((totalConfidence / toProcess.length).toFixed(2))
      : 1.0;

    return {
      agentType: AgentType.SIMPLIFIER,
      status:    AgentStatus.DONE,
      issues,
      fixes,
      metadata: {
        url,
        totalBlocksFound:          allBlocks.length,
        blocksNeedingSimplification: needsWork.length,
        blocksProcessed:           toProcess.length,
        blocksSimplified,
        skippedAlreadySimple:      skippedCount,
        skippedByLimit:            Math.max(0, needsWork.length - MAX_BLOCKS),
        averageReadingLevelBefore: avgBefore,
        averageReadingLevelAfter:  avgAfter,
        azureCalls,
        usedAI: useAI,
      },
      startTime,
      endTime:    Date.now(),
      confidence: avgConfidence,
    };
  }
}

export const simplifierAgent = new SimplifierAgent();
