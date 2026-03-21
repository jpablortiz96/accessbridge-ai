// Offline Vision Agent — tiered heuristic alt-text generation without Azure OpenAI.
// Confidence 0.5 → orchestrator auto-applies fixes.
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

// ─── Generic alt values that signal "no real alt text" ───────────────────────

const GENERIC_ALTS = new Set([
  '', 'image', 'img', 'photo', 'picture', 'banner',
  'logo', 'icon', 'graphic', 'figure', 'thumbnail', 'undefined', 'null',
]);

// ─── Heuristic helpers ────────────────────────────────────────────────────────

/** Convert a URL path segment into a readable label.
 *  "hero-banner_2024.jpg" → "Hero banner" */
function cleanFilename(src: string): string {
  try {
    const raw  = src.startsWith('http') ? new URL(src).pathname : src;
    const base = raw.split('/').filter(Boolean).pop() ?? '';
    const cleaned = base
      .replace(/\.[^.]+$/, '')          // strip extension
      .replace(/[-_]+/g, ' ')           // dashes/underscores → spaces
      .replace(/\s*\d{3,}\s*/g, ' ')   // strip long number strings (IDs, timestamps)
      .trim();
    if (!cleaned || cleaned.length < 2) return '';
    // Capitalise first letter only
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
  } catch {
    return '';
  }
}

/** Return the domain of an image src URL, e.g. "cdn.example.com". */
function imgDomain(src: string): string {
  try { return new URL(src).hostname; } catch { return ''; }
}

/** Walk up ancestors to find the nearest preceding heading. */
function nearestHeading($: cheerio.CheerioAPI, $el: cheerio.Cheerio<Element>): string {
  let node: cheerio.Cheerio<Element> = $el;
  for (let depth = 0; depth < 5; depth++) {
    // Check preceding siblings for a heading
    const $prev = node.prev();
    if ($prev.length && /^h[1-6]$/i.test($prev.prop('tagName') ?? '')) {
      return $prev.text().trim().slice(0, 70);
    }
    // Check the parent's own text only (not recursive)
    const $parent = node.parent() as cheerio.Cheerio<Element>;
    if (!$parent.length) break;
    // Check if parent is itself a heading
    if (/^h[1-6]$/i.test($parent.prop('tagName') ?? '')) {
      return $parent.text().trim().slice(0, 70);
    }
    node = $parent;
  }
  return '';
}

/**
 * Tiered alt-text generator — each tier is tried in priority order.
 *
 * Tier 1 (functional): image inside <a> → describe the link destination
 * Tier 2 (captioned):  image inside <figure> with <figcaption>
 * Tier 3 (filename):   meaningful filename words  → "{Name} image"
 * Tier 4 (heading):    nearest heading context    → "Image related to {heading}"
 * Tier 5 (fallback):   domain of the image src   → "Image - {domain}"
 */
function buildAltText(
  $: cheerio.CheerioAPI,
  $img: cheerio.Cheerio<Element>,
  src: string,
): string {
  // ── Tier 1: functional image inside a link ────────────────────────────────
  const $a = $img.closest('a');
  if ($a.length) {
    const linkText = $a.clone().find('img').remove().end().text().trim();
    if (linkText && linkText.length > 2) {
      return `Link to ${linkText.slice(0, 90)}`;
    }
    try {
      const href = $a.attr('href') ?? '';
      const dest = href.startsWith('http') ? new URL(href).hostname : href.replace(/^\//, '');
      if (dest) return `Link to ${dest.slice(0, 90)}`;
    } catch { /* fall through */ }
    return 'Navigational link image';
  }

  // ── Tier 2: image in <figure> with <figcaption> ───────────────────────────
  const caption = $img.closest('figure').find('figcaption').first().text().trim();
  if (caption) return caption.slice(0, 125);

  // ── Tier 3: meaningful filename ───────────────────────────────────────────
  const name = cleanFilename(src);
  if (name && name.length > 3) return `${name} image`;

  // ── Tier 4: nearest heading context ──────────────────────────────────────
  const heading = nearestHeading($, $img);
  if (heading) return `Image related to: ${heading.slice(0, 90)}`;

  // ── Tier 5: domain fallback ───────────────────────────────────────────────
  const domain = imgDomain(src);
  if (domain) return `Image - ${domain}`;

  return 'Image';
}

/** Build a stable, specific CSS selector for an img element. */
function imgSelector(
  $img: cheerio.Cheerio<Element>,
  src: string,
  idx: number,
): string {
  const id  = $img.attr('id');
  if (id) return `img#${id}`;
  const cls = ($img.attr('class') ?? '').split(/\s+/).filter(Boolean)[0];
  if (cls) return `img.${cls}`;
  if (src) return `img[src="${src.replace(/"/g, '\\"').slice(0, 80)}"]`;
  return `img:nth-of-type(${idx + 1})`;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export class OfflineVisionAgent implements BaseAgent {
  readonly name        = 'Offline Vision Agent';
  readonly type        = AgentType.VISION;
  readonly description =
    'Generates alt-text using tiered heuristics (link context, captions, ' +
    'filename, headings). Confidence 0.5 — fixes are auto-applied offline.';

  async analyze(html: string, _url: string): Promise<AgentResult> {
    const startTime = Date.now();
    const $         = cheerio.load(html);
    const issues:   AccessibilityIssue[] = [];
    const fixes:    AgentResult['fixes'] = [];

    const images = $('img').toArray() as Element[];
    const limit  = Math.min(images.length, 15);

    let applied = 0;

    for (let idx = 0; idx < limit; idx++) {
      const el   = images[idx];
      const $img = $(el) as cheerio.Cheerio<Element>;

      const src       = ($img.attr('src') ?? '').trim();
      const alt       = ($img.attr('alt') ?? '').trim();
      const isGeneric = GENERIC_ALTS.has(alt.toLowerCase());
      if (!isGeneric && alt !== '') continue;  // already has good alt

      const newAlt   = buildAltText($, $img, src);
      const selector = imgSelector($img, src, idx);

      issues.push({
        id:          uuidv4(),
        severity:    alt === '' ? IssueSeverity.MAJOR : IssueSeverity.MINOR,
        wcagRule:    '1.1.1',
        wcagLevel:   'A',
        category:    'perceivable',
        description: alt === ''
          ? `Image missing alt text. Heuristic: "${newAlt}"`
          : `Generic alt "${alt}" replaced. Heuristic: "${newAlt}"`,
        element:     ($.html(el) ?? '').slice(0, 150),
        selector,
        suggestion:  `alt="${newAlt}" (generated offline from ${
          $img.closest('a').length ? 'link context' :
          $img.closest('figure').find('figcaption').length ? 'figcaption' :
          cleanFilename(src) ? 'filename' : 'URL domain'
        })`,
        fixApplied:     false,   // orchestrator sets this to true after applying
        fixDescription: `Offline heuristic alt: "${newAlt}"`,
        agentType:      AgentType.VISION,
        confidence:     0.5,
        isEnhancement:  true,
      });

      fixes.push({
        selector,
        attribute: 'alt',
        oldValue:  alt,
        newValue:  newAlt,
        reason:    `Offline heuristic (tier: ${
          $img.closest('a').length ? 'functional-link' :
          $img.closest('figure').find('figcaption').length ? 'figcaption' :
          cleanFilename(src) ? 'filename' : 'heading/domain'
        })`,
      });

      applied++;
    }

    return {
      agentType:  AgentType.VISION,
      status:     AgentStatus.DONE,
      issues,
      fixes,
      metadata: {
        totalImages:     images.length,
        imagesProcessed: limit,
        fixesGenerated:  applied,
        offlineMode:     true,
        strategy:        'tiered-heuristics',
      },
      startTime,
      endTime:    Date.now(),
      confidence: 0.5,  // ≥0.5 → orchestrator auto-applies
    };
  }
}
