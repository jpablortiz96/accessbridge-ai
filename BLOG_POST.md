# Building AccessBridge AI: How 5 AI Agents Collaborate to Make the Web Accessible

*Built for the JS AI Build-a-thon 2026 — Agents for Impact*

---

## The Problem That Inspired Us

**96.3% of the top million websites fail basic accessibility standards.**

That statistic, from the 2024 WebAIM Million report, stopped me cold. We're not talking about edge cases or rare corner cases — we're talking about the overwhelming majority of the web being effectively inaccessible to 1.3 billion people who live with some form of disability.

The tools that exist today are part of the problem. Axe, WAVE, Lighthouse — these are excellent auditors. They'll tell you that you have 23 accessibility violations. What they won't do is fix a single one of them. The burden always falls back on the developer, who may not have the time, budget, or expertise to address every flag.

We wanted to change the question from *"Where are the problems?"* to *"Here's the fixed version — would you like to use it?"*

That's AccessBridge AI.

---

## What We Built

AccessBridge AI is a multi-agent system where 5 specialized AI agents collaborate in real-time to transform any web page into universally accessible content. You paste a URL. Fifteen seconds later, you get back:

- An **accessibility score** (before and after) on a 0-100 scale
- A list of every issue found, with the agent that found it and the confidence score
- An **automatically transformed HTML file** with fixes applied
- A **full decision log** explaining every choice the system made
- A **WCAG breakdown** across all four principles: Perceivable, Operable, Understandable, Robust

When you analyze a URL, here's what happens under the hood:

1. The **Orchestrator** fetches the HTML server-side (15s timeout, custom User-Agent)
2. The **Scanner**, **Vision**, **Simplifier**, and **Navigator** agents all run in parallel
3. The Orchestrator **resolves conflicts** between agents (more on this below)
4. High-confidence fixes are **automatically applied** to the HTML
5. Low-confidence suggestions are flagged for **human review**
6. Scores are calculated and the full result is returned to the UI

On our test runs: average score improvement of **+31 to +42 points**, depending on how accessibility-challenged the original page was.

---

## Architecture Deep Dive

### The BaseAgent Contract

Every agent in the system implements a single interface:

```typescript
export interface BaseAgent {
  name: string;
  type: AgentType;
  description: string;
  analyze(html: string, url: string, context?: any): Promise<AgentResult>;
}
```

That's it. Every agent receives raw HTML and a URL, and returns a structured `AgentResult` containing issues found, fixes proposed, metadata, and a confidence score. This contract is what makes the system composable — swapping the cloud Vision agent for an offline heuristic agent requires zero changes to the Orchestrator.

The `AgentResult` shape:

```typescript
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
```

Every fix carries a `selector` (CSS selector targeting the element), the old value, the new value, and — critically — a human-readable `reason`. This is what powers the Decision Log in the UI.

### The `isEnhancement` Flag: An Honest Score Model

This is one of the subtler design decisions that took three iterations to get right.

The problem: Vision and Simplifier agents find *opportunities* — images that could have better alt text, paragraphs that could be simpler. These aren't pre-existing defects that the website owner created. They're improvements AccessBridge can make. If we counted them in the `scoreBefore` calculation, we'd be artificially penalizing the site for things it never claimed to do.

The solution: an `isEnhancement` flag on `AccessibilityIssue`.

```typescript
export interface AccessibilityIssue {
  // ...
  fixApplied: boolean;
  confidence: number;
  /** True for Vision / Simplifier issues that represent *improvements*
   *  AccessBridge found, not pre-existing defects. These are shown in the
   *  UI but never penalise scoreBefore, and their fixes (if applied)
   *  add to scoreAfter. */
  isEnhancement?: boolean;
}
```

The scoring model then becomes additive — honest and non-decreasing:

```typescript
// scoreBefore: only real pre-existing defects (Scanner + Navigator)
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

// scoreAfter: scoreBefore + points earned per applied fix
const FIX_POINTS = {
  vision:     3,  // contextual alt text
  navigator:  4,  // structural fixes have high WCAG impact
  simplifier: 2,  // readability improvements
  scanner:    3,
};

function calcScoreAfter(issues: IssueLike[], before: number): number {
  let gain = 0;
  for (const i of issues) {
    if (!i.fixApplied) continue;
    gain += FIX_POINTS[i.agentType] ?? 2;
  }
  return Math.max(0, Math.min(100, before + gain));
}
```

Navigator gets the highest fix points because structural changes — adding landmark regions, fixing heading hierarchy, inserting skip links — have the biggest real-world impact for keyboard and screen reader users.

### Parallel Execution via Promise.all

All four specialist agents run concurrently. The Orchestrator wraps each in a try/catch so one failing agent (e.g., Azure timeout) doesn't bring down the entire analysis:

```typescript
const settled = await Promise.all(
  this.agents.map(async (agent) => {
    this.emitEvent({
      timestamp: Date.now(),
      agentType: agent.type,
      status: AgentStatus.WORKING,
      message: `${agent.name} started analyzing…`,
    });

    try {
      const result = await agent.analyze(html, url);
      this.emitEvent({
        timestamp: Date.now(),
        agentType: agent.type,
        status: AgentStatus.DONE,
        message: `${agent.name} found ${result.issues.length} issues`,
        data: { issueCount: result.issues.length, fixCount: result.fixes.length },
      });
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.emitEvent({
        timestamp: Date.now(),
        agentType: agent.type,
        status: AgentStatus.ERROR,
        message: `${agent.name} failed: ${msg}`,
      });
      return null;
    }
  })
);
```

Each `emitEvent` call feeds the real-time agent timeline in the UI via an `EventEmitter` pattern — the Orchestrator extends Node's `EventEmitter`, and the API route streams events back to the browser using a readable stream.

### The Conflict Resolution Engine

Agents running in parallel will inevitably step on each other's toes. We handle two conflict types:

**Type 1: Same WCAG rule, same element, different agents.**
The Scanner might flag `img:nth-of-type(3)` for missing alt text (WCAG 1.1.1), and so might the Navigator. We deduplicate by keeping the first reporter:

```typescript
const seenIssues = new Map<string, { agentType: AgentType }>();

for (const result of results) {
  for (const issue of result.issues) {
    const key = `${issue.selector}::${issue.wcagRule}`;
    const existing = seenIssues.get(key);

    if (existing && existing.agentType !== result.agentType) {
      // Log conflict, first-reporter wins
      conflicts.push({ winner: existing.agentType, reasoning: 'First-reporter wins' });
    } else if (!existing) {
      seenIssues.set(key, { agentType: result.agentType });
    }
  }
}
```

**Type 2: Vision vs Simplifier — the context preservation conflict.**
This is the interesting one. Imagine Vision generates the alt text: *"Promotes transforming your future through education and growth opportunities"* for an image inside a paragraph. Then Simplifier comes along and rewrites that paragraph to be shorter. Now the alt text no longer makes sense in context — screen reader users would hear the simplified text followed by the original (now out-of-context) alt text.

Our rule: **Vision always wins over Simplifier on the same element.** If a Vision-fixed image lives inside a paragraph that Simplifier wants to rewrite, that paragraph is blocked:

```typescript
// Find text blocks where Vision has fixed an img inside
for (const simplFix of simplifierResult.fixes) {
  const $block = $(simplFix.selector).first();

  for (const imgSel of visionImgSelectors) {
    if ($block.find(imgSel).length > 0) {
      // Vision wins — block the Simplifier fix
      blockedSimplifierSelectors.add(simplFix.selector);
      conflicts.push({
        winner: AgentType.VISION,
        reasoning:
          'Alt text generated by Vision Agent is calibrated to the image\'s ' +
          'surrounding context. Rewriting that context could make the alt text ' +
          'misleading for screen reader users.',
      });
    }
  }
}
```

This conflict — and its resolution — is recorded in the Decision Log and surfaced in the Responsible AI panel so users can understand why a particular fix wasn't applied.

---

## The Secret Sauce: Contextual Alt Text

The Vision Agent is where Azure OpenAI earns its place in the system.

Most accessibility scanners will tell you: "This image has no alt text." The best ones will say: "Add meaningful alt text." But what does "meaningful" mean for a specific image on a specific page?

Before even calling the API, we extract rich context from the DOM:

```typescript
interface ExtractedContext {
  imageUrl: string;
  filename: string;
  imageType: 'decorative' | 'functional' | 'informative';
  heading: string;         // nearest ancestor or preceding h1-h6
  surroundingText: string; // text content of parent element
  caption: string;         // figcaption if present
  linkText: string;        // text of wrapping <a> if present
  title: string;           // title attribute
  selector: string;
  snippet: string;         // the raw HTML element
  currentAlt: string | undefined;
}
```

The agent classifies each image into one of three roles:
- **Decorative** — purely visual, no information content → `alt=""` (handled by Scanner)
- **Functional** — inside a link or button → alt text describes the destination/action
- **Informative** — content image → alt text describes what the image communicates

This role classification shapes the system prompt sent to GPT-4o:

```
You are an accessibility expert generating alt text for a web image.

Image role: FUNCTIONAL (this image is inside a link or button)
For functional images, describe the DESTINATION or ACTION, not just what you see.
Generate alt text that a screen reader user would find helpful.

RULES:
- Be concise (under 125 characters)
- Describe PURPOSE, not visual appearance
- If it's functional, what does it DO or WHERE does it go?
- Do NOT start with "Image of", "Picture of", "Photo of"
- Do NOT include quotes in your response

Context:
- Surrounding text: "Learn more about our engineering bootcamp programs"
- Link text: "Apply now"
- Nearest heading: "Transform Your Career in Tech"
```

**Result:** *"Apply for engineering bootcamp — Transform Your Career in Tech"*

Without this context, a generic vision model might return: *"A button with text."*

The agent also penalizes its own confidence score when context is thin:

```typescript
const hasContext = ctx.heading || ctx.surroundingText || ctx.caption || ctx.linkText;
confidence = hasContext ? 0.88 : 0.72;
```

A confidence below 0.5 means the fix is surfaced as a suggestion, never auto-applied. This is human-in-the-loop by design — the system acknowledges its own uncertainty.

---

## Going Offline: Accessibility Without Internet

We built two fully functional modes from day one, and the offline mode is not a degraded fallback — it's a genuine capability with a specific use case.

**Why?** Because the communities that most need accessibility tooling — nonprofits, government agencies in emerging markets, small educational institutions — often have unreliable or metered internet connectivity. A tool that stops working without cloud connectivity isn't truly accessible.

| Feature | ☁️ Cloud | 📡 Offline |
|---|---|---|
| Scanner (20+ WCAG rules) | Full | Full (same code) |
| Navigator (structure) | Full | Full (same code) |
| Vision (alt text) | AI-powered via GPT-4o | 5-tier heuristic |
| Simplifier (readability) | AI rewriting | Deterministic splitting |
| Typical speed | ~12 seconds | ~2 seconds |
| Privacy | Processed via Azure | Zero external requests |

### The Offline Vision Heuristic

When no API key is present, the Vision agent falls back to a 5-tier priority system:

```
Tier 1: <img> inside <a>
  → "Link to {link text}" or "Link to {domain name}"
  Rationale: functional images communicate navigation intent

Tier 2: <figure> with <figcaption>
  → Use the caption verbatim (the author already wrote it)

Tier 3: Meaningful filename
  → "hero-education-program.jpg" → "Hero education program image"
  (strip extension, convert hyphens/underscores to spaces, title-case)

Tier 4: Nearest heading in the DOM
  → "Image related to: {heading text}"

Tier 5: Image URL domain
  → "Image — cdn.example.com"
```

All offline Vision issues are marked `isEnhancement: true` with confidence `0.5`, which means they're auto-applied (the threshold is `≥ 0.5`) but don't penalize the before-score.

### The Offline Simplifier

The offline Simplifier uses a deterministic algorithm instead of calling GPT-4o. For any `<p>` element with a sentence over 30 words, it attempts a three-pass split:

```
Pass 1 — Natural break (comma near midpoint):
  Find the comma closest to the ±30% midpoint of the sentence.
  "The program, which was founded in 2019, has helped over 1,000 students..."
  → "The program, which was founded in 2019, has helped over 1,000 students..."
  → Split at comma before "has"

Pass 2 — Conjunction split:
  Find the first coordinating/subordinating conjunction after the midpoint:
  (and, but, which, because, however, although, while, whereas...)
  → Split before the conjunction, add a period

Pass 3 — Hard midpoint:
  If no natural break found, split at the word nearest the midpoint.
  (Last resort — preserves meaning better than cutting arbitrarily)
```

Result on Wikipedia: Cloud mode +37 pts, Offline mode +31 pts. The gap is real but smaller than you'd expect.

---

## Responsible AI: Not an Afterthought

We made a deliberate decision early: transparency and human oversight are architectural requirements, not features we'd add later.

Every `AgentEvent` is timestamped and stored:

```typescript
export interface AgentEvent {
  timestamp: number;
  agentType: AgentType;
  status: AgentStatus; // WORKING | DONE | ERROR | CONFLICT
  message: string;
  data?: any;
}
```

The Decision Log in the UI renders every event — including conflicts — in chronological order. Conflict events are highlighted in amber. The Responsible AI panel shows:

- **Transparency**: total number of agent decisions logged
- **Human-in-the-Loop**: count of suggestions vs auto-applied fixes
- **Confidence Scoring**: breakdown of high/medium/low confidence fixes per agent
- **Privacy**: mode used and data retention policy (none — all processing is ephemeral)

The confidence threshold for auto-apply is explicitly `≥ 0.5`. Anything below that is shown as a suggestion with a reason: *"Confidence 0.42 — flagged for human review."*

This design reflects a real belief: AI systems that affect people's lives — and accessibility directly affects how 1.3 billion people experience the web — need to be auditable, explainable, and humble about their own limitations.

---

## Building with AI: Our Claude Code Workflow

This section is the most honest part of this post.

We used **Claude Code** (Anthropic's CLI coding assistant) for the vast majority of this project. Here's what that actually looked like, warts included.

### What Worked Exceptionally Well

**Generating the type system.** We gave Claude Code the exact interfaces we wanted and it produced clean, idiomatic TypeScript on the first try. The `AccessibilityIssue`, `AgentResult`, and `AnalysisResult` interfaces required almost no revision.

**The Scanner Agent.** We asked for a WCAG 2.1 auditor covering all four principles. Claude generated 20+ detection rules using cheerio, each wrapped in its own try/catch, with proper severity and WCAG rule codes. This would have taken a week to research and write manually.

**UI components with specific constraints.** When we described the exact visual behavior we wanted — "a segmented control using visually-hidden radio inputs, two options, with an offline disclaimer that animates in with aria-live='polite'" — we got exactly that. No hallucinated React libraries, no unnecessary dependencies.

**Debugging TypeScript errors across a multi-agent system.** When we hit a `TS2322` error about `IssueSeverity` string literals, we described the error and the surrounding code, and got the right fix immediately: import the enum and use `IssueSeverity.MAJOR` instead of the string `'major'`.

### What Didn't Work (At First)

**The scoring algorithm needed three iterations to get right.**

Our first attempt: a single `calcScore(issues, afterFixes: boolean)` function that counted all issues and tried to subtract fixed ones. When we tested in offline mode, scores were going *down* — from 72 to 51 — because Vision and Simplifier were generating issues that got counted against the baseline.

Second attempt: separate before/after calculations. Better, but still wrong — the "after" score was recounting all unfixed issues instead of adding earned points.

Third attempt: the additive model with `isEnhancement` flag described above. The key insight was identifying *why* the model was wrong, not just that it was wrong.

The lesson: **AI-assisted coding works best when you can articulate the bug precisely.** "The offline score goes down" didn't help. "The before-score counts Vision issues that are improvements, not defects — they shouldn't appear in the baseline" produced an exact, correct solution.

**Complex cheerio selectors were brittle.**

Early versions of the agents generated selectors like `div.container > section:first-child > img:nth-child(3)`. These worked on the test page but broke on real sites. We had to manually establish the selector priority rule (id > class > src attribute > nth-of-type) and explain it precisely before the generated code became stable.

**Conflict resolution logic needed manual refinement.**

The initial conflict resolution was purely deduplication. The Vision-vs-Simplifier context preservation conflict — where rewriting a paragraph could make an adjacent alt text misleading — was a design decision we arrived at ourselves, then asked Claude to implement. The "what" came from us; the "how" came from Claude.

### Our Prompting Strategy

The difference between a prompt that works and one that doesn't, in our experience:

**Specify the interface, not just the behavior.**
Instead of: *"Create a Scanner Agent that checks accessibility"*
We used: *"Create a Scanner Agent that implements the BaseAgent interface below. It should use cheerio to parse the HTML and detect these specific WCAG violations, returning issues with these exact fields..."*

**Describe bugs with reproduction steps, not symptoms.**
Instead of: *"The score is wrong"*
We used: *"The `scoreBefore` function at line 35 is including Vision agent issues (marked `isEnhancement: true`) in its baseline count. These should be excluded. The fix should modify the filter condition to check `!i.isEnhancement &&` before the agentType check."*

**Iterate on real output, not hypothetical code.**
We ran the app, analyzed a real URL, saw the output, identified what was wrong, then described that specific wrong output and the expected correct output. Every iteration was grounded in real behavior.

**Example prompts we used:**

```
Create the Vision Agent in /src/agents/vision.ts. It must implement BaseAgent.
It should:
1. Use cheerio to find all <img> elements with missing or generic alt text
2. For each image, extract this context object: [interface definition]
3. Call Azure OpenAI with this exact system prompt: [prompt text]
4. Mark each issue with isEnhancement: true and confidence: 0.85
5. Fall back to generateFallbackAlt() if Azure is not configured
The fallback function should try: linkText → figcaption → filename → heading → domain
```

```
There is a TypeScript error in orchestrator.ts line 482:
  Type 'string' is not assignable to type 'IssueSeverity'
The line reads: issue.severity = 'major';
Fix it by importing IssueSeverity from @/types/agents and using IssueSeverity.MAJOR.
Apply the same fix wherever 'critical' and 'minor' string literals are used.
```

---

## Results

We tested on a range of real websites. Here's a representative sample from a real run:

**Test site: eduky.co (education platform)**
- Score before: 51 / 100
- Score after: 93 / 100 (**+42 points**)
- Issues detected: 21 across all 4 WCAG categories
- Fixes auto-applied: 13 (high confidence)
- Suggestions for review: 8 (lower confidence)
- Analysis time (cloud): 14.4 seconds
- Analysis time (offline): 1.6 seconds

**WCAG Breakdown (before → after):**
- Perceivable: 48 → 89 (+41)
- Operable: 71 → 85 (+14)
- Understandable: 62 → 78 (+16)
- Robust: 55 → 91 (+36)

**Test site: Wikipedia (English article)**
- Score before: 68 / 100
- Cloud mode score after: 105 → capped at 100 (**+32 points**)
- Offline mode score after: 99 (**+31 points**)
- Analysis time (cloud): 18.2 seconds (many images → many API calls)
- Analysis time (offline): 2.1 seconds

The near-parity between cloud and offline on Wikipedia demonstrates that the heuristic offline agents are genuinely useful — most Wikipedia images follow predictable patterns (figures with captions, file-name-described diagrams) that the heuristic system handles well.

---

## What's Next

AccessBridge AI was built in five days for a hackathon. Here's where we'd take it with more time:

**Browser Extension** — Run AccessBridge directly in the browser without pasting URLs. Inject the transformed HTML into the current tab so users can see the before/after in situ.

**CI/CD Integration** — An API endpoint that returns a machine-readable WCAG report and exits non-zero when critical violations are detected. Plug it into your GitHub Actions pipeline: no PR gets merged if it regresses accessibility.

**Foundry Local Integration** — Replace the offline heuristics with actual on-device AI inference using Azure AI Foundry Local and Phi-4. True intelligence without any internet dependency.

**Multi-language Support** — The Simplifier currently targets English readability (Flesch-Kincaid). Extending to Spanish, French, and Portuguese would dramatically expand the tool's impact in underserved markets.

**Accessibility Score Tracking** — Store historical scores per domain. Show a site owner their accessibility trend over time, not just a single snapshot.

---

## Try It Yourself

**[🚀 Live Demo](https://YOUR_VERCEL_URL.vercel.app)**

**[📦 GitHub Repository](https://github.com/jpablortiz96/accessbridge-ai)**

Drop any public URL into the analyzer and watch 5 agents work in real time. Try it on:
- A site you own (and care about improving)
- `https://example.com` (a minimal, intentionally bare page)
- A Wikipedia article (rich with images, complex structure)
- A government or nonprofit site (where accessibility matters most)

If the analysis finds something, the fixed HTML is available for download immediately.

---

## Final Thoughts

Accessibility is one of those problems where the technical solution is well-understood and the barrier is almost entirely friction. We know what good alt text looks like. We know what heading hierarchy should be. We know what ARIA landmarks do. The problem is that fixing 47 violations across a 200-page website is a week of tedious work.

AI agents can absorb that friction. Not perfectly — our confidence scores and human-in-the-loop design reflect genuine humility about what the system can and can't do reliably. But good enough, fast enough, that the decision for a small nonprofit to have an accessible website no longer has to be "we can't afford the developer time."

That's the goal. Everything else is implementation details.

---

*Built with ❤️ for the JS AI Build-a-thon 2026 — because the web should work for everyone.*

*— Juan Pablo Enriquez Ortiz*
