import * as cheerio from 'cheerio';
import type { Element, AnyNode } from 'domhandler';
import { v4 as uuidv4 } from 'uuid';
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
  'image', 'photo', 'img', 'picture', 'graphic', 'icon',
  'thumbnail', 'banner', 'logo', 'screenshot', 'figure',
  'placeholder', 'image of', 'photo of', 'picture of',
]);

const NON_DESCRIPTIVE_LINK_TEXTS = new Set([
  'click here', 'read more', 'here', 'link', 'more',
  'click', 'this', 'go', 'continue', 'visit', 'learn more',
  'details', 'info', 'click me', 'button', 'download',
]);

/** Maps normalized input name/id/type → expected autocomplete value (WCAG 1.3.5) */
const AUTOCOMPLETE_FIELDS = new Map<string, string>([
  ['email', 'email'],
  ['tel', 'tel'],
  ['phone', 'tel'],
  ['mobile', 'tel'],
  ['name', 'name'],
  ['fname', 'given-name'],
  ['lname', 'family-name'],
  ['firstname', 'given-name'],
  ['lastname', 'family-name'],
  ['username', 'username'],
  ['user', 'username'],
  ['password', 'current-password'],
  ['pass', 'current-password'],
  ['zip', 'postal-code'],
  ['postal', 'postal-code'],
  ['postcode', 'postal-code'],
  ['address', 'street-address'],
  ['city', 'address-level2'],
  ['country', 'country-name'],
  ['ccname', 'cc-name'],
  ['cardname', 'cc-name'],
  ['ccnumber', 'cc-number'],
  ['cardnumber', 'cc-number'],
]);

const VALID_ARIA_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote',
  'button', 'caption', 'cell', 'checkbox', 'code', 'columnheader', 'combobox',
  'comment', 'complementary', 'contentinfo', 'definition', 'deletion', 'dialog',
  'directory', 'document', 'emphasis', 'feed', 'figure', 'form', 'generic',
  'grid', 'gridcell', 'group', 'heading', 'img', 'insertion', 'link', 'list',
  'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'menu', 'menubar',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'meter', 'navigation',
  'none', 'note', 'option', 'paragraph', 'presentation', 'progressbar',
  'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar',
  'search', 'searchbox', 'separator', 'slider', 'spinbutton', 'status',
  'strong', 'subscript', 'superscript', 'switch', 'tab', 'table', 'tablist',
  'tabpanel', 'term', 'textbox', 'time', 'timer', 'toolbar', 'tooltip', 'tree',
  'treegrid', 'treeitem',
]);

// ─── Color / Contrast Utilities ───────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  const expanded = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  if (expanded.length !== 6 && expanded.length !== 8) return null;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return isNaN(r) || isNaN(g) || isNaN(b) ? null : [r, g, b];
}

function parseRgb(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
}

function parseColor(color: string): [number, number, number] | null {
  const c = color.trim().toLowerCase();
  if (c.startsWith('#')) return parseHex(c);
  if (c.startsWith('rgb')) return parseRgb(c);
  return null;
}

function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Selector / Snippet Utilities ─────────────────────────────────────────────

function cssEscape(str: string): string {
  return str.replace(/([^\w-])/g, '\\$1');
}

function getSelector(el: Element, $: cheerio.CheerioAPI): string {
  try {
    const parts: string[] = [];
    let current: AnyNode | null = el;

    while (current && parts.length < 4) {
      if (current.type !== 'tag') break;
      const elem = current as Element;
      const id = elem.attribs?.id;

      if (id) {
        parts.unshift(`#${cssEscape(id)}`);
        break;
      }

      const cls = elem.attribs?.class;
      const clsPart = cls
        ? '.' + cls.trim().split(/\s+/).slice(0, 2).map(cssEscape).join('.')
        : '';

      parts.unshift(`${elem.name}${clsPart}`);
      current = elem.parent ?? null;
    }

    return parts.length ? parts.join(' > ') : 'unknown';
  } catch {
    return 'unknown';
  }
}

function getSnippet(el: Element, $: cheerio.CheerioAPI): string {
  try {
    return ($.html(el) ?? 'unknown').slice(0, 150);
  } catch {
    return 'unknown';
  }
}

// ─── Issue Factory ────────────────────────────────────────────────────────────

type IssueInput = Omit<AccessibilityIssue, 'id' | 'agentType' | 'fixApplied' | 'confidence'>;

function makeIssue(input: IssueInput): AccessibilityIssue {
  return {
    ...input,
    id: uuidv4(),
    agentType: AgentType.SCANNER,
    fixApplied: false,
    confidence: 1.0,
  };
}

// ─── Score Calculation ────────────────────────────────────────────────────────

function calculateScore(issues: AccessibilityIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === IssueSeverity.CRITICAL) score -= 10;
    else if (issue.severity === IssueSeverity.MAJOR)   score -= 5;
    else if (issue.severity === IssueSeverity.MINOR)   score -= 2;
  }
  return Math.max(0, score);
}

// ─── PERCEIVABLE Checks ───────────────────────────────────────────────────────

function checkImages($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  try {
    $('img').each((_, el) => {
      const elem = el as Element;
      const alt = $(elem).attr('alt');
      const selector = getSelector(elem, $);
      const snippet = getSnippet(elem, $);

      if (alt === undefined) {
        issues.push(makeIssue({
          severity: IssueSeverity.CRITICAL,
          wcagRule: '1.1.1',
          wcagLevel: 'A',
          category: 'perceivable',
          description: 'Image is missing an alt attribute.',
          element: snippet,
          selector,
          suggestion: 'Add a descriptive alt attribute. Use alt="" for purely decorative images.',
        }));
      } else if (alt !== '' && GENERIC_ALT_TEXTS.has(alt.trim().toLowerCase())) {
        issues.push(makeIssue({
          severity: IssueSeverity.MAJOR,
          wcagRule: '1.1.1',
          wcagLevel: 'A',
          category: 'perceivable',
          description: `Image has generic alt text: "${alt}".`,
          element: snippet,
          selector,
          suggestion: `Replace alt="${alt}" with a specific description of what the image depicts.`,
        }));
      }
    });
  } catch {}
  return issues;
}

function checkMediaAlternatives($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  try {
    $('video, audio').each((_, el) => {
      const elem = el as Element;
      const $el = $(elem);
      const tag = elem.name;
      const hasAriaLabel = $el.attr('aria-label') || $el.attr('aria-labelledby');
      const hasCaption = $el.find('track[kind="captions"], track[kind="subtitles"]').length > 0;
      const hasTitle = $el.attr('title');

      if (!hasAriaLabel && !hasCaption && !hasTitle) {
        issues.push(makeIssue({
          severity: IssueSeverity.CRITICAL,
          wcagRule: '1.2.1',
          wcagLevel: 'A',
          category: 'perceivable',
          description: `<${tag}> element has no text alternative (missing aria-label, title, or <track> element).`,
          element: getSnippet(elem, $),
          selector: getSelector(elem, $),
          suggestion: tag === 'video'
            ? 'Add <track kind="captions" src="..."> inside the <video> element, or provide an aria-label.'
            : 'Add an aria-label or title attribute describing the audio content.',
        }));
      }
    });
  } catch {}
  return issues;
}

function checkInlineContrast($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  try {
    $('[style]').each((_, el) => {
      const elem = el as Element;
      const style = $(elem).attr('style') ?? '';

      const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
      const bgMatch    = style.match(/(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i);

      if (!colorMatch || !bgMatch) return;

      const fg = parseColor(colorMatch[1].trim());
      const bg = parseColor(bgMatch[1].trim());
      if (!fg || !bg) return;

      const ratio = contrastRatio(relativeLuminance(fg), relativeLuminance(bg));

      if (ratio < 4.5) {
        issues.push(makeIssue({
          severity: IssueSeverity.MAJOR,
          wcagRule: '1.4.3',
          wcagLevel: 'AA',
          category: 'perceivable',
          description: `Color contrast ratio is ${ratio.toFixed(2)}:1 — below the 4.5:1 minimum for normal text.`,
          element: getSnippet(elem, $),
          selector: getSelector(elem, $),
          suggestion: `Adjust text or background color to reach at least 4.5:1 contrast. Current ratio: ${ratio.toFixed(2)}:1.`,
        }));
      }
    });
  } catch {}
  return issues;
}

function checkFontSize($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  try {
    $('[style]').each((_, el) => {
      const elem = el as Element;
      const style = $(elem).attr('style') ?? '';
      const m = style.match(/font-size\s*:\s*([\d.]+)px/i);
      if (!m) return;

      const size = parseFloat(m[1]);
      if (size < 12) {
        issues.push(makeIssue({
          severity: IssueSeverity.MINOR,
          wcagRule: '1.4.4',
          wcagLevel: 'AA',
          category: 'perceivable',
          description: `Text font size is ${size}px, which is below the recommended minimum of 12px.`,
          element: getSnippet(elem, $),
          selector: getSelector(elem, $),
          suggestion: `Increase font-size to at least 12px (16px recommended for body text). Avoid using px units — prefer rem to respect user font size settings.`,
        }));
      }
    });
  } catch {}
  return issues;
}

// ─── OPERABLE Checks ─────────────────────────────────────────────────────────

function checkLinks($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  try {
    $('a').each((_, el) => {
      const elem = el as Element;
      const $el = $(elem);
      const text = $el.text().trim().toLowerCase();
      const ariaLabel      = $el.attr('aria-label')?.trim();
      const ariaLabelledBy = $el.attr('aria-labelledby')?.trim();
      const title          = $el.attr('title')?.trim();
      const hasAccessibleName = !!(ariaLabel || ariaLabelledBy || title);
      const snippet  = getSnippet(elem, $);
      const selector = getSelector(elem, $);

      if (!text && !hasAccessibleName) {
        issues.push(makeIssue({
          severity: IssueSeverity.CRITICAL,
          wcagRule: '2.4.4',
          wcagLevel: 'A',
          category: 'operable',
          description: 'Link has no accessible name (no text content, aria-label, aria-labelledby, or title).',
          element: snippet,
          selector,
          suggestion: 'Add descriptive text inside the <a> element or add an aria-label attribute describing the link\'s destination.',
        }));
      } else if (!hasAccessibleName && NON_DESCRIPTIVE_LINK_TEXTS.has(text)) {
        issues.push(makeIssue({
          severity: IssueSeverity.MAJOR,
          wcagRule: '2.4.4',
          wcagLevel: 'A',
          category: 'operable',
          description: `Link text "${text}" is non-descriptive and doesn't convey the destination or purpose.`,
          element: snippet,
          selector,
          suggestion: `Replace "${text}" with a meaningful description like "Read our accessibility guide", or add aria-label="..." for context.`,
        }));
      }
    });
  } catch {}
  return issues;
}

function checkTabindex($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  try {
    $('[tabindex]').each((_, el) => {
      const elem = el as Element;
      const tabindex = parseInt($(elem).attr('tabindex') ?? '0', 10);
      if (tabindex > 0) {
        issues.push(makeIssue({
          severity: IssueSeverity.MINOR,
          wcagRule: '2.4.3',
          wcagLevel: 'A',
          category: 'operable',
          description: `Element has tabindex="${tabindex}" which creates a custom tab order that can confuse keyboard users.`,
          element: getSnippet(elem, $),
          selector: getSelector(elem, $),
          suggestion: 'Use tabindex="0" to include the element in the natural tab order. Restructure the DOM to reflect the logical reading order instead.',
        }));
      }
    });
  } catch {}
  return issues;
}

function checkFocusVisible($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  try {
    $('a, button, input, select, textarea, [tabindex="0"]').each((_, el) => {
      const elem = el as Element;
      const style = $(elem).attr('style') ?? '';
      const outlineRemoved =
        /outline\s*:\s*0(?:px)?(?:\s*;|$)/i.test(style) ||
        /outline\s*:\s*none/i.test(style);

      if (outlineRemoved) {
        issues.push(makeIssue({
          severity: IssueSeverity.MAJOR,
          wcagRule: '2.4.7',
          wcagLevel: 'AA',
          category: 'operable',
          description: 'Interactive element has focus outline removed via inline style, making keyboard navigation invisible.',
          element: getSnippet(elem, $),
          selector: getSelector(elem, $),
          suggestion: 'Remove "outline: none" / "outline: 0" from inline styles. If a custom focus indicator is needed, ensure it has 3:1 contrast against adjacent colors.',
        }));
      }
    });
  } catch {}
  return issues;
}

// ─── UNDERSTANDABLE Checks ────────────────────────────────────────────────────

function checkLang($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  try {
    const lang = $('html').first().attr('lang');
    if (!lang?.trim()) {
      issues.push(makeIssue({
        severity: IssueSeverity.MAJOR,
        wcagRule: '3.1.1',
        wcagLevel: 'A',
        category: 'understandable',
        description: 'The <html> element is missing a lang attribute.',
        element: '<html>',
        selector: 'html',
        suggestion: 'Add a lang attribute to the <html> element (e.g., lang="en"). This allows screen readers to use correct pronunciation and language rules.',
      }));
    }
  } catch {}
  return issues;
}

function checkFormLabels($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  const excludedTypes = new Set(['hidden', 'submit', 'reset', 'button', 'image']);
  try {
    $('input, select, textarea').each((_, el) => {
      const elem = el as Element;
      const $el  = $(elem);
      const type = ($el.attr('type') ?? '').toLowerCase();

      if (excludedTypes.has(type)) return;

      const id              = $el.attr('id');
      const ariaLabel       = $el.attr('aria-label');
      const ariaLabelledBy  = $el.attr('aria-labelledby');
      const title           = $el.attr('title');
      const hasWrapping     = $el.closest('label').length > 0;
      const hasLinked       = id ? $(`label[for="${id}"]`).length > 0 : false;
      const isLabelled      = hasWrapping || hasLinked || ariaLabel || ariaLabelledBy || title;

      if (!isLabelled) {
        const fieldType = type || elem.name;
        issues.push(makeIssue({
          severity: IssueSeverity.CRITICAL,
          wcagRule: '3.3.2',
          wcagLevel: 'A',
          category: 'understandable',
          description: `Form ${fieldType} field has no associated label.`,
          element: getSnippet(elem, $),
          selector: getSelector(elem, $),
          suggestion: id
            ? `Add <label for="${id}">Field description</label> before this input, or add an aria-label attribute.`
            : 'Add an id to the input and a corresponding <label for="id"> element, or use aria-label.',
        }));
      }
    });
  } catch {}
  return issues;
}

function checkAutocomplete($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  try {
    $('input[type="text"], input[type="email"], input[type="tel"], input[type="password"], input:not([type])').each((_, el) => {
      const elem = el as Element;
      const $el  = $(elem);

      if ($el.attr('autocomplete')) return;

      const normalize = (s: string) => s.toLowerCase().replace(/[-_\s]/g, '');
      const name = normalize($el.attr('name') ?? '');
      const id   = normalize($el.attr('id') ?? '');
      const type = normalize($el.attr('type') ?? '');

      const expected =
        AUTOCOMPLETE_FIELDS.get(name) ||
        AUTOCOMPLETE_FIELDS.get(id)   ||
        AUTOCOMPLETE_FIELDS.get(type);

      if (expected) {
        issues.push(makeIssue({
          severity: IssueSeverity.MINOR,
          wcagRule: '1.3.5',
          wcagLevel: 'AA',
          category: 'understandable',
          description: `Input "${name || id || type}" is missing the autocomplete attribute, making it harder for users to auto-fill personal data.`,
          element: getSnippet(elem, $),
          selector: getSelector(elem, $),
          suggestion: `Add autocomplete="${expected}" to this input field.`,
        }));
      }
    });
  } catch {}
  return issues;
}

// ─── ROBUST Checks ────────────────────────────────────────────────────────────

function checkHeadingHierarchy($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  try {
    const headings: Array<{ level: number; el: Element }> = [];
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const elem = el as Element;
      headings.push({ level: parseInt(elem.name[1], 10), el: elem });
    });

    if (headings.length === 0) return issues;

    if (!headings.some(h => h.level === 1)) {
      issues.push(makeIssue({
        severity: IssueSeverity.MAJOR,
        wcagRule: '1.3.1',
        wcagLevel: 'A',
        category: 'robust',
        description: 'Page has no <h1> element. Every page must have a single h1 as the primary heading.',
        element: '<body>',
        selector: 'body',
        suggestion: 'Add an <h1> element that describes the main topic or purpose of this page.',
      }));
    }

    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1].level;
      const curr = headings[i].level;
      if (curr > prev + 1) {
        const elem = headings[i].el;
        issues.push(makeIssue({
          severity: IssueSeverity.MAJOR,
          wcagRule: '1.3.1',
          wcagLevel: 'A',
          category: 'robust',
          description: `Heading hierarchy skips from h${prev} to h${curr}. Levels must not be skipped.`,
          element: getSnippet(elem, $),
          selector: getSelector(elem, $),
          suggestion: `Change this <h${curr}> to <h${prev + 1}>, or add intermediate heading levels to maintain a logical hierarchy.`,
        }));
      }
    }
  } catch {}
  return issues;
}

function checkDuplicateIds($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  try {
    const idMap = new Map<string, Element[]>();

    $('[id]').each((_, el) => {
      const elem = el as Element;
      const id   = $(elem).attr('id') ?? '';
      if (!id) return;
      const arr = idMap.get(id) ?? [];
      arr.push(elem);
      idMap.set(id, arr);
    });

    for (const [id, elems] of Array.from(idMap.entries())) {
      if (elems.length > 1) {
        issues.push(makeIssue({
          severity: IssueSeverity.CRITICAL,
          wcagRule: '4.1.1',
          wcagLevel: 'A',
          category: 'robust',
          description: `id="${id}" is duplicated across ${elems.length} elements. IDs must be unique within a document.`,
          element: getSnippet(elems[0], $),
          selector: `[id="${id}"]`,
          suggestion: `Make each id unique. Rename duplicates to "${id}-1", "${id}-2", etc., and update any aria-labelledby/for references accordingly.`,
        }));
      }
    }
  } catch {}
  return issues;
}

function checkLandmarks($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  try {
    const hasMain = $('main, [role="main"]').length > 0;
    if (!hasMain) {
      issues.push(makeIssue({
        severity: IssueSeverity.MAJOR,
        wcagRule: '1.3.1',
        wcagLevel: 'A',
        category: 'robust',
        description: 'Page is missing a <main> landmark. Screen reader users rely on landmarks for fast page navigation.',
        element: '<body>',
        selector: 'body',
        suggestion: 'Wrap the primary page content in a <main> element.',
      }));
    }

    const linkCount = $('a[href]').length;
    const hasNav    = $('nav, [role="navigation"]').length > 0;
    if (linkCount >= 3 && !hasNav) {
      issues.push(makeIssue({
        severity: IssueSeverity.MAJOR,
        wcagRule: '1.3.1',
        wcagLevel: 'A',
        category: 'robust',
        description: 'Page has multiple links but no <nav> landmark to group navigation regions.',
        element: '<body>',
        selector: 'body',
        suggestion: 'Wrap groups of navigation links in a <nav aria-label="Main navigation"> element.',
      }));
    }
  } catch {}
  return issues;
}

function checkAriaRoles($: cheerio.CheerioAPI): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  try {
    $('[role]').each((_, el) => {
      const elem  = el as Element;
      const roles = ($(elem).attr('role') ?? '').trim().toLowerCase().split(/\s+/);

      for (const role of roles) {
        if (role && !VALID_ARIA_ROLES.has(role)) {
          issues.push(makeIssue({
            severity: IssueSeverity.MAJOR,
            wcagRule: '4.1.2',
            wcagLevel: 'A',
            category: 'robust',
            description: `Invalid ARIA role "${role}". Assistive technologies will not recognize this role.`,
            element: getSnippet(elem, $),
            selector: getSelector(elem, $),
            suggestion: `Replace role="${role}" with a valid WAI-ARIA role. See https://www.w3.org/TR/wai-aria-1.1/#role_definitions for the full list.`,
          }));
        }
      }
    });
  } catch {}
  return issues;
}

// ─── Scanner Agent ────────────────────────────────────────────────────────────

export class ScannerAgent implements BaseAgent {
  readonly name        = 'Scanner Agent';
  readonly type        = AgentType.SCANNER;
  readonly description =
    'Static HTML accessibility scanner. Detects WCAG 2.1 violations across all four POUR principles using rule-based analysis — no AI required. Confidence: 1.0.';

  async analyze(html: string, url: string): Promise<AgentResult> {
    const startTime = Date.now();
    const issues: AccessibilityIssue[] = [];
    const $ = cheerio.load(html);

    const checks: Array<() => AccessibilityIssue[]> = [
      // Perceivable
      () => checkImages($),
      () => checkMediaAlternatives($),
      () => checkInlineContrast($),
      () => checkFontSize($),
      // Operable
      () => checkLinks($),
      () => checkTabindex($),
      () => checkFocusVisible($),
      // Understandable
      () => checkLang($),
      () => checkFormLabels($),
      () => checkAutocomplete($),
      // Robust
      () => checkHeadingHierarchy($),
      () => checkDuplicateIds($),
      () => checkLandmarks($),
      () => checkAriaRoles($),
    ];

    for (const check of checks) {
      try {
        issues.push(...check());
      } catch {
        // Isolated: a single failing check never stops the rest
      }
    }

    const score    = calculateScore(issues);
    const endTime  = Date.now();
    const critical = issues.filter(i => i.severity === IssueSeverity.CRITICAL).length;
    const major    = issues.filter(i => i.severity === IssueSeverity.MAJOR).length;
    const minor    = issues.filter(i => i.severity === IssueSeverity.MINOR).length;

    return {
      agentType: AgentType.SCANNER,
      status:    AgentStatus.DONE,
      issues,
      fixes:     [] as AgentResult['fixes'],
      metadata:  {
        url,
        score,
        totalIssues: issues.length,
        critical,
        major,
        minor,
        duration: endTime - startTime,
      },
      startTime,
      endTime,
      confidence: 1.0,
    };
  }
}

export const scannerAgent = new ScannerAgent();
