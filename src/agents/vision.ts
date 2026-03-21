// Vision Agent — contextual alt-text generation via Azure OpenAI (or fallback)
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

const GENERIC_ALT_TEXTS = new Set([
  '', 'image', 'photo', 'img', 'picture', 'graphic', 'icon',
  'thumbnail', 'banner', 'logo', 'screenshot', 'figure',
  'placeholder', 'image of', 'photo of', 'picture of',
]);

const MAX_IMAGES     = 10;
const AZURE_DELAY_MS = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

type ImageRole = 'decorative' | 'functional' | 'informative';

interface ExtractedContext {
  imageUrl:   string;
  filename:   string;
  imageType:  ImageRole;
  heading:    string;
  surroundingText: string;
  caption:    string;
  linkText:   string;
  title:      string;
  selector:   string;
  snippet:    string;
  currentAlt: string | undefined;
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
      current = (current.parent?.type === 'tag' ? current.parent as Element : null);
    }
    return parts.join(' > ') || 'img';
  } catch { return 'img'; }
}

function getSnippet(el: Element, $: cheerio.CheerioAPI): string {
  try { return ($.html(el) ?? '').slice(0, 120); } catch { return '<img>'; }
}

/** Walk up the DOM looking for a preceding heading sibling at any ancestor level. */
function getNearestHeading(el: Element, $: cheerio.CheerioAPI): string {
  let $node = $(el).parent();
  for (let depth = 0; depth < 6 && $node.length; depth++) {
    const $prev = $node.prevAll('h1, h2, h3, h4, h5, h6').first();
    if ($prev.length) return $prev.text().trim().slice(0, 100);
    $node = $node.parent();
  }
  // Last resort: first document heading
  return $('h1, h2').first().text().trim().slice(0, 100);
}

/** Extract readable text surrounding the image (without the img itself). */
function getSurroundingText(el: Element, $: cheerio.CheerioAPI): string {
  // Prefer the closest semantic container
  const $block = $(el).closest('p, li, td, figcaption, blockquote, div, section');
  if ($block.length) {
    const clone = $block.first().clone();
    clone.find('img, script, style, svg').remove();
    const text = clone.text().trim().replace(/\s+/g, ' ');
    if (text.length > 5) return text.slice(0, 200);
  }
  return '';
}

/** Extract the filename from a src URL (strips query string, path, and extension). */
function getFilename(src: string): string {
  try {
    const path = new URL(src, 'https://x').pathname;
    return path.split('/').pop() ?? '';
  } catch {
    return src.split('/').pop()?.split('?')[0] ?? '';
  }
}

/** Classify an image element into decorative / functional / informative. */
function classifyImage(el: Element, $: cheerio.CheerioAPI): ImageRole {
  const $el = $(el);

  // Explicit ARIA decorative markers
  const role = $el.attr('role')?.toLowerCase().trim();
  if (role === 'presentation' || role === 'none') return 'decorative';

  // Spacer / pixel-tracker heuristics
  const filename = getFilename($el.attr('src') ?? '').toLowerCase();
  if (/spacer|pixel|blank|transparent|1x1|dot\./.test(filename)) return 'decorative';

  const w = parseInt($el.attr('width')  ?? '', 10);
  const h = parseInt($el.attr('height') ?? '', 10);
  if (!isNaN(w) && !isNaN(h) && w <= 2 && h <= 2) return 'decorative';

  // Functional: inside an interactive element
  if ($el.closest('a, button').length > 0) return 'functional';

  return 'informative';
}

/** Build the full ExtractedContext for a single img element. */
function extractContext(el: Element, $: cheerio.CheerioAPI, pageUrl: string): ExtractedContext {
  const $el     = $(el);
  const src     = $el.attr('src') ?? '';
  const imageType = classifyImage(el, $);

  // Resolve to absolute URL for the prompt
  let imageUrl = src;
  try { imageUrl = new URL(src, pageUrl).href; } catch {}

  // Figure caption (only if the img is inside a <figure>)
  const $figure  = $el.closest('figure');
  const caption  = $figure.length
    ? $figure.find('figcaption').first().text().trim().slice(0, 150)
    : '';

  // Link text (if img is inside <a>)
  const $link    = $el.closest('a');
  const linkText = $link.length
    ? $link.clone().find('img').remove().end().text().trim().slice(0, 100)
    : '';

  return {
    imageUrl,
    filename:        getFilename(src),
    imageType,
    heading:         getNearestHeading(el, $),
    surroundingText: getSurroundingText(el, $),
    caption,
    linkText,
    title:           $el.attr('title')?.trim() ?? '',
    selector:        getSelector(el, $),
    snippet:         getSnippet(el, $),
    currentAlt:      $el.attr('alt'),
  };
}

// ─── Alt-text generation ──────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  `You are an accessibility expert generating alt text for screen reader users. ` +
  `Generate concise, descriptive alt text that explains the PURPOSE of the image ` +
  `in its context, not just its visual content. Follow these rules:\n` +
  `- For informative images: max 125 characters. Describe what the image communicates.\n` +
  `- For charts/infographics: max 250 characters. Describe the data insight.\n` +
  `- For functional images (in links/buttons): describe the ACTION, ` +
  `e.g., 'Go to homepage' not 'Company logo'.\n` +
  `- Never start with 'Image of' or 'Picture of'.\n` +
  `- If you cannot determine the image content from context alone, provide the best ` +
  `possible description based on the filename and surrounding text.\n` +
  `Respond with ONLY the alt text, nothing else.`;

function buildUserPrompt(ctx: ExtractedContext): string {
  return [
    `Image URL: ${ctx.imageUrl}`,
    `Image filename: ${ctx.filename}`,
    `Image type: ${ctx.imageType}`,
    `Nearest heading: ${ctx.heading || '(none)'}`,
    `Surrounding text: ${ctx.surroundingText || '(none)'}`,
    `Figure caption: ${ctx.caption || '(none)'}`,
    `Link text: ${ctx.linkText || '(none)'}`,
    '',
    'Generate appropriate alt text.',
  ].join('\n');
}

/** Heuristic alt text when Azure is unavailable (no API key). */
function generateFallbackAlt(ctx: ExtractedContext): string {
  if (ctx.imageType === 'functional') {
    if (ctx.linkText) return ctx.linkText.slice(0, 125);
    if (ctx.title)    return ctx.title.slice(0, 125);
    if (ctx.heading)  return ctx.heading.slice(0, 125);
  }

  if (ctx.caption)  return ctx.caption.slice(0, 125);

  // Sanitize filename into readable text
  const readable = ctx.filename
    .replace(/\.(jpe?g|png|gif|webp|svg|avif|bmp|tiff?)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const label = readable
    ? readable.charAt(0).toUpperCase() + readable.slice(1)
    : '';

  if (ctx.heading && label) return `${label} — ${ctx.heading}`.slice(0, 125);
  if (label)                return label.slice(0, 125);
  if (ctx.heading)          return `Illustration for: ${ctx.heading}`.slice(0, 125);
  if (ctx.surroundingText)  return ctx.surroundingText.slice(0, 80);

  return 'Image';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isAzureConfigured(): boolean {
  return !!(process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT);
}

// ─── Issue + Fix factories ────────────────────────────────────────────────────

function buildIssue(ctx: ExtractedContext, generatedAlt: string): AccessibilityIssue {
  const missingAlt = ctx.currentAlt === undefined;
  return {
    id:          uuidv4(),
    severity:    missingAlt ? IssueSeverity.CRITICAL : IssueSeverity.MAJOR,
    wcagRule:    '1.1.1',
    wcagLevel:   'A',
    category:    'perceivable',
    description: missingAlt
      ? 'Image is missing an alt attribute.'
      : `Image has generic alt text: "${ctx.currentAlt}".`,
    element:     ctx.snippet,
    selector:    ctx.selector,
    suggestion:  `Set alt="${generatedAlt}"`,
    fixApplied:  false,
    fixDescription: generatedAlt,
    agentType:   AgentType.VISION,
    confidence:  0.85,
  };
}

type Fix = AgentResult['fixes'][number];

function buildFix(ctx: ExtractedContext, generatedAlt: string, usedFallback: boolean): Fix {
  return {
    selector: ctx.selector,
    attribute: 'alt',
    oldValue:  ctx.currentAlt ?? '(missing)',
    newValue:  generatedAlt,
    reason:    usedFallback
      ? `Fallback alt text derived from filename and page context (Azure not configured).`
      : `AI-generated alt text based on image role (${ctx.imageType}), surrounding context, and page structure.`,
  };
}

// ─── Vision Agent ─────────────────────────────────────────────────────────────

export class VisionAgent implements BaseAgent {
  readonly name        = 'Vision Agent';
  readonly type        = AgentType.VISION;
  readonly description =
    'Generates contextual, purpose-driven alt text for images using Azure OpenAI. ' +
    'Falls back to filename/context heuristics when the API is unavailable.';

  async analyze(html: string, url: string): Promise<AgentResult> {
    const startTime = Date.now();
    const issues:  AccessibilityIssue[] = [];
    const fixes:   Fix[]                = [];
    const $        = cheerio.load(html);
    const useAI    = isAzureConfigured();

    if (!useAI) {
      console.log('[vision-agent] Azure not configured — running in fallback mode');
    }

    // ── Collect images that need alt text ─────────────────────────────────────

    const needsAlt: ExtractedContext[] = [];

    $('img').each((_, el) => {
      const elem = el as Element;
      const alt  = $(elem).attr('alt');
      const isGeneric = alt !== undefined && GENERIC_ALT_TEXTS.has(alt.trim().toLowerCase());

      if (alt === undefined || isGeneric) {
        const ctx = extractContext(elem, $, url);
        if (ctx.imageType === 'decorative') return; // handled by Scanner
        needsAlt.push(ctx);
      }
    });

    // Limit to MAX_IMAGES to control API cost
    const toProcess = needsAlt.slice(0, MAX_IMAGES);

    let totalConfidence = 0;
    let azureCalls      = 0;
    let fallbackCount   = 0;

    const counts = { functional: 0, informative: 0, decorative: 0 };

    // ── Process each image ────────────────────────────────────────────────────

    for (let i = 0; i < toProcess.length; i++) {
      const ctx = toProcess[i];
      counts[ctx.imageType]++;

      let generatedAlt = '';
      let confidence   = 0.85;
      let usedFallback = false;

      if (useAI) {
        // Rate-limit: wait between calls (skip delay before the first)
        if (i > 0) await sleep(AZURE_DELAY_MS);

        try {
          const userPrompt = buildUserPrompt(ctx);
          const raw = await getAzureCompletion(SYSTEM_PROMPT, userPrompt, {
            maxTokens:   80,
            temperature: 0.3,
          });

          // Sanitize: strip surrounding quotes, trim, enforce max length
          generatedAlt = raw
            .replace(/^["']|["']$/g, '')
            .trim()
            .slice(0, 250);

          // Penalise confidence when context was thin
          const hasContext =
            ctx.heading || ctx.surroundingText || ctx.caption || ctx.linkText;
          confidence = hasContext ? 0.88 : 0.72;

          azureCalls++;
        } catch (err) {
          console.warn(`[vision-agent] Azure call failed for "${ctx.filename}":`, err);
          generatedAlt = generateFallbackAlt(ctx);
          confidence   = 0.5;
          usedFallback = true;
          fallbackCount++;
        }
      } else {
        generatedAlt = generateFallbackAlt(ctx);
        confidence   = 0.5;
        usedFallback = true;
        fallbackCount++;
      }

      // Guarantee we always have something
      if (!generatedAlt) {
        generatedAlt = generateFallbackAlt(ctx);
        usedFallback = true;
        confidence   = 0.4;
      }

      totalConfidence += confidence;
      issues.push(buildIssue(ctx, generatedAlt));
      fixes.push(buildFix(ctx, generatedAlt, usedFallback));
    }

    const avgConfidence = toProcess.length > 0
      ? parseFloat((totalConfidence / toProcess.length).toFixed(2))
      : 1.0;

    return {
      agentType:  AgentType.VISION,
      status:     AgentStatus.DONE,
      issues,
      fixes,
      metadata: {
        url,
        totalImages:      $('img').length,
        imagesNeedingAlt: needsAlt.length,
        imagesProcessed:  toProcess.length,
        skippedByLimit:   Math.max(0, needsAlt.length - MAX_IMAGES),
        decorativeCount:  counts.decorative,
        functionalCount:  counts.functional,
        informativeCount: counts.informative,
        azureCalls,
        fallbackCount,
        usedAI: useAI,
      },
      startTime,
      endTime:    Date.now(),
      confidence: avgConfidence,
    };
  }
}

export const visionAgent = new VisionAgent();
