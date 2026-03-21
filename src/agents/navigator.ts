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
      const id   = elem.attribs?.id;

      if (id) {
        parts.unshift(`#${cssEscape(id)}`);
        break;
      }

      const cls     = elem.attribs?.class;
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
type Fix        = AgentResult['fixes'][number];

function makeIssue(input: IssueInput): AccessibilityIssue {
  return {
    ...input,
    id:         uuidv4(),
    agentType:  AgentType.NAVIGATOR,
    fixApplied: false,
    confidence: 1.0,
  };
}

function calculateScore(issues: AccessibilityIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === IssueSeverity.CRITICAL)   score -= 10;
    else if (issue.severity === IssueSeverity.MAJOR) score -= 5;
    else                                             score -= 2;
  }
  return Math.max(0, score);
}

// ─── 1. Heading Hierarchy ─────────────────────────────────────────────────────

function checkHeadingHierarchy($: cheerio.CheerioAPI): {
  issues: AccessibilityIssue[];
  fixes: Fix[];
  headingStructure: string[];
} {
  const issues: AccessibilityIssue[] = [];
  const fixes: Fix[]                 = [];
  const headingStructure: string[]   = [];

  try {
    const headings: Array<{ level: number; el: Element }> = [];
    $('h1, h2, h3, h4, h5, h6').each((_, el) => {
      const elem = el as Element;
      headings.push({ level: parseInt(elem.name[1], 10), el: elem });
      headingStructure.push(elem.name);
    });

    if (headings.length === 0) return { issues, fixes, headingStructure };

    // Missing h1
    if (!headings.some(h => h.level === 1)) {
      issues.push(makeIssue({
        severity:    IssueSeverity.CRITICAL,
        wcagRule:    '1.3.1',
        wcagLevel:   'A',
        category:    'robust',
        description: 'Page has no <h1> element. A page must have exactly one h1 as its primary heading.',
        element:     '<body>',
        selector:    'body',
        suggestion:  'Add a single <h1> that describes the main purpose of this page. Consider using the <title> text as a starting point.',
      }));
    }

    // Gaps in hierarchy
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1].level;
      const curr = headings[i].level;

      if (curr > prev + 1) {
        const elem      = headings[i].el;
        const selector  = getSelector(elem, $);
        const corrected = `h${prev + 1}`;

        issues.push(makeIssue({
          severity:    IssueSeverity.MAJOR,
          wcagRule:    '1.3.1',
          wcagLevel:   'A',
          category:    'robust',
          description: `Heading hierarchy skips from <h${prev}> to <h${curr}> — level h${prev + 1} is missing.`,
          element:     getSnippet(elem, $),
          selector,
          suggestion:  `Change this <h${curr}> to <${corrected}>, or insert an intermediate <h${prev + 1}> before it.`,
        }));

        fixes.push({
          selector,
          attribute: 'tagName',
          oldValue:  `h${curr}`,
          newValue:  corrected,
          reason:    `Fix heading hierarchy gap: h${prev} → h${curr} corrected to h${prev} → ${corrected}.`,
        });
      }
    }
  } catch {}

  return { issues, fixes, headingStructure };
}

// ─── 2. ARIA Landmarks ────────────────────────────────────────────────────────

function checkLandmarks($: cheerio.CheerioAPI): {
  issues: AccessibilityIssue[];
  fixes: Fix[];
  landmarksFound: string[];
  landmarksMissing: string[];
} {
  const issues: AccessibilityIssue[] = [];
  const fixes: Fix[]                 = [];
  const landmarksFound: string[]     = [];
  const landmarksMissing: string[]   = [];

  try {
    // ── main ──────────────────────────────────────────────────────────────────
    if ($('main, [role="main"]').length > 0) {
      landmarksFound.push('main');
    } else {
      landmarksMissing.push('main');
      issues.push(makeIssue({
        severity:    IssueSeverity.MAJOR,
        wcagRule:    '1.3.1',
        wcagLevel:   'A',
        category:    'robust',
        description: 'Page is missing a <main> landmark. Screen reader users rely on landmarks for fast page navigation.',
        element:     '<body>',
        selector:    'body',
        suggestion:  'Wrap the primary page content in <main id="main-content">…</main>.',
      }));
    }

    // ── nav: multiple navs without aria-label ─────────────────────────────────
    const navs = $('nav, [role="navigation"]');
    if (navs.length > 0) {
      landmarksFound.push('nav');

      if (navs.length > 1) {
        navs.each((i, el) => {
          const elem = el as Element;
          if (!$(elem).attr('aria-label') && !$(elem).attr('aria-labelledby') && !$(elem).attr('title')) {
            const selector  = getSelector(elem, $);
            const suggested = i === 0 ? 'Main navigation' : `Navigation ${i + 1}`;
            issues.push(makeIssue({
              severity:    IssueSeverity.MINOR,
              wcagRule:    '2.4.1',
              wcagLevel:   'A',
              category:    'operable',
              description: `Page has ${navs.length} <nav> elements but this one has no aria-label. Screen reader landmark menus cannot distinguish between them.`,
              element:     getSnippet(elem, $),
              selector,
              suggestion:  `Add aria-label="${suggested}" to this <nav> element.`,
            }));
            fixes.push({
              selector,
              attribute: 'aria-label',
              oldValue:  '',
              newValue:  suggested,
              reason:    `Distinguish this nav landmark from ${navs.length - 1} other(s) on the page.`,
            });
          }
        });
      }
    }

    // ── banner (<header> direct child of body) ────────────────────────────────
    if ($('body > header, [role="banner"]').length > 0) {
      landmarksFound.push('banner');
    } else {
      landmarksMissing.push('banner');
      issues.push(makeIssue({
        severity:    IssueSeverity.MINOR,
        wcagRule:    '1.3.6',
        wcagLevel:   'AA',
        category:    'robust',
        description: 'Page is missing a banner landmark. A <header> element (direct child of <body>) provides the implicit banner role used by screen readers.',
        element:     '<body>',
        selector:    'body',
        suggestion:  'Wrap site-level header content in a <header> that is a direct child of <body>.',
      }));
    }

    // ── contentinfo (<footer> direct child of body) ───────────────────────────
    if ($('body > footer, [role="contentinfo"]').length > 0) {
      landmarksFound.push('contentinfo');
    } else {
      landmarksMissing.push('contentinfo');
      issues.push(makeIssue({
        severity:    IssueSeverity.MINOR,
        wcagRule:    '1.3.6',
        wcagLevel:   'AA',
        category:    'robust',
        description: 'Page is missing a contentinfo landmark (<footer> direct child of <body> or role="contentinfo").',
        element:     '<body>',
        selector:    'body',
        suggestion:  'Wrap site-level footer content in a <footer> that is a direct child of <body>.',
      }));
    }
  } catch {}

  return { issues, fixes, landmarksFound, landmarksMissing };
}

// ─── 3. Skip Navigation ───────────────────────────────────────────────────────

const SKIP_HREF_RE = /^#(main[-_]?content|content|main|skip|primary|maincontent)$/i;

function checkSkipNav($: cheerio.CheerioAPI): {
  issues: AccessibilityIssue[];
  fixes: Fix[];
  skipLinkPresent: boolean;
} {
  const issues: AccessibilityIssue[] = [];
  const fixes: Fix[]                 = [];
  let   skipLinkPresent              = false;

  try {
    $('a[href]').each((_, el) => {
      const href = ($(el as Element).attr('href') ?? '').trim();
      if (SKIP_HREF_RE.test(href)) {
        skipLinkPresent = true;
        return false; // break .each
      }
    });

    if (!skipLinkPresent) {
      issues.push(makeIssue({
        severity:    IssueSeverity.MAJOR,
        wcagRule:    '2.4.1',
        wcagLevel:   'A',
        category:    'operable',
        description: 'Page is missing a skip navigation link. Keyboard users must tab through every navigation item to reach main content.',
        element:     '<body>',
        selector:    'body',
        suggestion:  'Add <a href="#main-content" class="skip-link">Skip to main content</a> as the very first element inside <body>, visible on focus.',
      }));

      fixes.push({
        selector:  'body',
        attribute: 'prepend',
        oldValue:  '',
        newValue:  '<a href="#main-content" class="skip-link" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;focus-visible:left:0;focus-visible:width:auto;focus-visible:height:auto;">Skip to main content</a>',
        reason:    'Add skip navigation link for keyboard and screen reader users (WCAG 2.4.1).',
      });
    }
  } catch {}

  return { issues, fixes, skipLinkPresent };
}

// ─── 4. Table Accessibility ───────────────────────────────────────────────────

function checkTables($: cheerio.CheerioAPI): {
  issues: AccessibilityIssue[];
  fixes: Fix[];
  tablesFound: number;
} {
  const issues: AccessibilityIssue[] = [];
  const fixes: Fix[]                 = [];
  let   tablesFound                  = 0;

  try {
    $('table').each((_, el) => {
      const elem     = el as Element;
      const $table   = $(elem);
      const selector = getSelector(elem, $);
      tablesFound++;

      const hasHeaders = $table.find('th').length > 0;
      const existingRole = ($table.attr('role') ?? '').toLowerCase();

      // Layout table (no <th>, no presentational role)
      if (!hasHeaders && existingRole !== 'presentation' && existingRole !== 'none') {
        issues.push(makeIssue({
          severity:    IssueSeverity.MAJOR,
          wcagRule:    '1.3.1',
          wcagLevel:   'A',
          category:    'perceivable',
          description: 'Table has no <th> elements — it appears to be a layout table. Layout tables force screen readers to navigate a confusing grid structure.',
          element:     getSnippet(elem, $),
          selector,
          suggestion:  'If used for layout: add role="presentation". If it\'s a data table: add <th scope="col"> for column headers.',
        }));
        fixes.push({
          selector,
          attribute: 'role',
          oldValue:  existingRole,
          newValue:  'presentation',
          reason:    'Mark layout table as presentational to suppress spurious grid navigation for screen readers.',
        });
        return; // skip further checks on this table
      }

      // Missing caption
      if (!$table.find('caption').length) {
        issues.push(makeIssue({
          severity:    IssueSeverity.MINOR,
          wcagRule:    '1.3.1',
          wcagLevel:   'A',
          category:    'perceivable',
          description: 'Data table is missing a <caption>. Screen readers announce the caption before reading table contents, giving users essential context.',
          element:     getSnippet(elem, $),
          selector,
          suggestion:  'Add <caption>Brief description of what this table shows</caption> as the first child of <table>.',
        }));
      }

      // <th> elements without scope
      $table.find('th').each((_, thEl) => {
        const th    = thEl as Element;
        const $th   = $(th);
        if ($th.attr('scope')) return;

        const inThead  = $th.closest('thead').length > 0;
        const isFirst  = $th.index() === 0;
        const guessed  = inThead ? 'col' : isFirst ? 'row' : 'col';
        const thSel    = getSelector(th, $);

        issues.push(makeIssue({
          severity:    IssueSeverity.MINOR,
          wcagRule:    '1.3.1',
          wcagLevel:   'A',
          category:    'perceivable',
          description: '<th> is missing a scope attribute. Screen readers use scope to associate headers with their data cells.',
          element:     getSnippet(th, $),
          selector:    thSel,
          suggestion:  `Add scope="${guessed}" to this <th> element.`,
        }));
        fixes.push({
          selector:  thSel,
          attribute: 'scope',
          oldValue:  '',
          newValue:  guessed,
          reason:    `Associate <th> with its ${guessed === 'col' ? 'column' : 'row'} data cells.`,
        });
      });
    });
  } catch {}

  return { issues, fixes, tablesFound };
}

// ─── 5. Form Enhancement ──────────────────────────────────────────────────────

const GENERIC_SUBMIT_LABELS = new Set(['submit', 'send', 'ok', 'go', 'yes', 'continue', 'next']);

function checkFormEnhancement($: cheerio.CheerioAPI): {
  issues: AccessibilityIssue[];
  fixes: Fix[];
  formsFound: number;
} {
  const issues: AccessibilityIssue[] = [];
  const fixes: Fix[]                 = [];
  const formsFound                   = $('form').length;

  try {
    // fieldset without legend
    $('fieldset').each((_, el) => {
      const elem = el as Element;
      if (!$(elem).find('> legend').length) {
        issues.push(makeIssue({
          severity:    IssueSeverity.MINOR,
          wcagRule:    '1.3.1',
          wcagLevel:   'A',
          category:    'understandable',
          description: '<fieldset> is missing a <legend>. Screen readers rely on legends to provide context for grouped form controls.',
          element:     getSnippet(elem, $),
          selector:    getSelector(elem, $),
          suggestion:  'Add <legend>Descriptive group name</legend> as the first child of <fieldset>.',
        }));
      }
    });

    // Radio groups without fieldset
    const flaggedRadioNames  = new Set<string>();
    $('input[type="radio"]').each((_, el) => {
      const elem = el as Element;
      const name = $(elem).attr('name') ?? '';
      if (name && !flaggedRadioNames.has(name) && !$(elem).closest('fieldset').length) {
        flaggedRadioNames.add(name);
        issues.push(makeIssue({
          severity:    IssueSeverity.MINOR,
          wcagRule:    '1.3.1',
          wcagLevel:   'A',
          category:    'understandable',
          description: `Radio group "${name}" is not wrapped in a <fieldset>. Without a <fieldset> + <legend>, screen readers cannot convey what the group is asking.`,
          element:     getSnippet(elem, $),
          selector:    getSelector(elem, $),
          suggestion:  `Wrap all radio buttons with name="${name}" in: <fieldset><legend>Question text</legend>… inputs …</fieldset>`,
        }));
      }
    });

    // Checkbox groups without fieldset
    const flaggedCheckboxNames = new Set<string>();
    $('input[type="checkbox"]').each((_, el) => {
      const elem = el as Element;
      const name = $(elem).attr('name') ?? '';
      if (name && !flaggedCheckboxNames.has(name) && !$(elem).closest('fieldset').length) {
        flaggedCheckboxNames.add(name);
        issues.push(makeIssue({
          severity:    IssueSeverity.MINOR,
          wcagRule:    '1.3.1',
          wcagLevel:   'A',
          category:    'understandable',
          description: `Checkbox group "${name}" is not wrapped in a <fieldset>. Screen readers cannot associate the checkboxes with their shared question.`,
          element:     getSnippet(elem, $),
          selector:    getSelector(elem, $),
          suggestion:  `Wrap checkboxes with name="${name}" in: <fieldset><legend>Question text</legend>… inputs …</fieldset>`,
        }));
      }
    });

    // Generic submit button labels
    $('button[type="submit"], button:not([type]), input[type="submit"]').each((_, el) => {
      const elem  = el as Element;
      const $el   = $(elem);
      const text  = ($el.text().trim() || $el.attr('value') || '').toLowerCase();
      if (GENERIC_SUBMIT_LABELS.has(text)) {
        issues.push(makeIssue({
          severity:    IssueSeverity.MINOR,
          wcagRule:    '2.4.6',
          wcagLevel:   'AA',
          category:    'operable',
          description: `Submit button has a generic label "${text}" that doesn't describe the form action.`,
          element:     getSnippet(elem, $),
          selector:    getSelector(elem, $),
          suggestion:  `Replace "${text}" with a descriptive action label like "Create account", "Send message", or "Search products".`,
        }));
      }
    });
  } catch {}

  return { issues, fixes, formsFound };
}

// ─── 6. Link Enhancement ──────────────────────────────────────────────────────

function checkLinkEnhancement($: cheerio.CheerioAPI): {
  issues: AccessibilityIssue[];
  fixes: Fix[];
  linksAnalyzed: number;
} {
  const issues: AccessibilityIssue[] = [];
  const fixes: Fix[]                 = [];
  let   linksAnalyzed                = 0;

  try {
    // Build text → [href, …] map for same-text check
    const textToHrefs = new Map<string, Set<string>>();

    $('a[href]').each((_, el) => {
      const elem      = el as Element;
      const $el       = $(elem);
      const href      = $el.attr('href') ?? '';
      const target    = $el.attr('target') ?? '';
      const ariaLabel = ($el.attr('aria-label') ?? '').toLowerCase();
      const visText   = $el.text().trim();
      const lowerText = visText.toLowerCase();
      const selector  = getSelector(elem, $);
      linksAnalyzed++;

      // target="_blank" without new-window warning
      if (
        target === '_blank' &&
        !ariaLabel.includes('new') &&
        !ariaLabel.includes('window') &&
        !ariaLabel.includes('tab')
      ) {
        const label = ($el.attr('aria-label') ?? visText).trim() || 'link';
        issues.push(makeIssue({
          severity:    IssueSeverity.MINOR,
          wcagRule:    '3.2.2',
          wcagLevel:   'A',
          category:    'understandable',
          description: `Link "${visText.slice(0, 50) || href.slice(0, 50)}" opens in a new tab without notifying users. This can disorient people using screen readers or keyboard navigation.`,
          element:     getSnippet(elem, $),
          selector,
          suggestion:  `Add aria-label="${label} (opens in new tab)" or append visible text "(opens in new tab)" inside the link.`,
        }));
        fixes.push({
          selector,
          attribute: 'aria-label',
          oldValue:  $el.attr('aria-label') ?? '',
          newValue:  `${label} (opens in new tab)`,
          reason:    'Warn users this link opens in a new browser tab (WCAG 3.2.2).',
        });
      }

      // Collect same-text → different URL mapping (skip anchors and JS voids)
      if (lowerText && !href.startsWith('#') && !href.startsWith('javascript')) {
        const set = textToHrefs.get(lowerText) ?? new Set();
        set.add(href);
        textToHrefs.set(lowerText, set);
      }
    });

    // Same visible text pointing to different URLs
    const flaggedTexts = new Set<string>();
    for (const [text, hrefs] of Array.from(textToHrefs.entries())) {
      if (hrefs.size < 2) continue;

      $('a[href]').each((_, el) => {
        const elem  = el as Element;
        const $el   = $(elem);
        const href  = $el.attr('href') ?? '';
        if ($el.text().trim().toLowerCase() !== text) return;
        if (href.startsWith('#') || href.startsWith('javascript')) return;

        const key = `${text}::${href}`;
        if (flaggedTexts.has(key)) return;
        flaggedTexts.add(key);

        issues.push(makeIssue({
          severity:    IssueSeverity.MINOR,
          wcagRule:    '2.4.4',
          wcagLevel:   'A',
          category:    'operable',
          description: `${hrefs.size} links share the text "${text}" but point to different URLs. Users who navigate by link list cannot distinguish them.`,
          element:     getSnippet(elem, $),
          selector:    getSelector(elem, $),
          suggestion:  `Add a unique aria-label to each, e.g. aria-label="${text} — [specific destination or product name]".`,
        }));
      });
    }
  } catch {}

  return { issues, fixes, linksAnalyzed };
}

// ─── Navigator Agent ──────────────────────────────────────────────────────────

export class NavigatorAgent implements BaseAgent {
  readonly name        = 'Navigator Agent';
  readonly type        = AgentType.NAVIGATOR;
  readonly description =
    'Semantic structure and navigation agent. Deterministically fixes heading hierarchy, ARIA landmarks, skip navigation, table accessibility, form grouping, and link context. No AI required. Confidence: 1.0.';

  async analyze(html: string, url: string): Promise<AgentResult> {
    const startTime = Date.now();
    const issues:   AccessibilityIssue[] = [];
    const fixes:    AgentResult['fixes'] = [];
    const $         = cheerio.load(html);

    let headingStructure: string[] = [];
    let landmarksFound:   string[] = [];
    let landmarksMissing: string[] = [];
    let tablesFound                = 0;
    let formsFound                 = 0;
    let linksAnalyzed              = 0;
    let skipLinkPresent            = false;

    const checks: Array<() => void> = [
      () => {
        const r      = checkHeadingHierarchy($);
        issues.push(...r.issues);
        fixes.push(...r.fixes);
        headingStructure = r.headingStructure;
      },
      () => {
        const r      = checkLandmarks($);
        issues.push(...r.issues);
        fixes.push(...r.fixes);
        landmarksFound   = r.landmarksFound;
        landmarksMissing = r.landmarksMissing;
      },
      () => {
        const r         = checkSkipNav($);
        issues.push(...r.issues);
        fixes.push(...r.fixes);
        skipLinkPresent = r.skipLinkPresent;
      },
      () => {
        const r      = checkTables($);
        issues.push(...r.issues);
        fixes.push(...r.fixes);
        tablesFound = r.tablesFound;
      },
      () => {
        const r      = checkFormEnhancement($);
        issues.push(...r.issues);
        fixes.push(...r.fixes);
        formsFound = r.formsFound;
      },
      () => {
        const r      = checkLinkEnhancement($);
        issues.push(...r.issues);
        fixes.push(...r.fixes);
        linksAnalyzed = r.linksAnalyzed;
      },
    ];

    for (const check of checks) {
      try {
        check();
      } catch {
        // Isolated: a single failing check never stops the rest
      }
    }

    const score   = calculateScore(issues);
    const endTime = Date.now();

    return {
      agentType: AgentType.NAVIGATOR,
      status:    AgentStatus.DONE,
      issues,
      fixes,
      metadata: {
        url,
        score,
        totalIssues:     issues.length,
        critical:        issues.filter(i => i.severity === IssueSeverity.CRITICAL).length,
        major:           issues.filter(i => i.severity === IssueSeverity.MAJOR).length,
        minor:           issues.filter(i => i.severity === IssueSeverity.MINOR).length,
        landmarksFound,
        landmarksMissing,
        headingStructure,
        skipLinkPresent,
        tablesFound,
        formsFound,
        linksAnalyzed,
        duration:        endTime - startTime,
      },
      startTime,
      endTime,
      confidence: 1.0,
    };
  }
}

export const navigatorAgent = new NavigatorAgent();
