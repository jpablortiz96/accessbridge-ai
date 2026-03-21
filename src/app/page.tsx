"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import BridgeIcon from "@/components/BridgeIcon";
import ModeToggle from "@/components/ModeToggle";
import UrlInput from "@/components/UrlInput";
import type { AnalysisMode } from "@/types";

// ─── Agent metadata ────────────────────────────────────────────────────────────

const AGENTS = [
  {
    emoji: "🎯",
    label: "Orchestrator",
    color: "#6366F1",
    description: "Coordinates all agents, resolves conflicts, and assembles the final result.",
  },
  {
    emoji: "🔍",
    label: "Scanner",
    color: "#F59E0B",
    description: "Detects WCAG 2.1 violations using 20+ static analysis rules.",
  },
  {
    emoji: "👁",
    label: "Vision",
    color: "#EC4899",
    description: "Generates contextual alt-text for images using Azure OpenAI GPT-4o.",
  },
  {
    emoji: "✏️",
    label: "Simplifier",
    color: "#10B981",
    description: "Rewrites complex language into plain English for cognitive accessibility.",
  },
  {
    emoji: "🧭",
    label: "Navigator",
    color: "#3B82F6",
    description: "Fixes semantic structure: headings, landmarks, skip links, and ARIA.",
  },
] as const;

// ─── How it works steps ───────────────────────────────────────────────────────

const STEPS = [
  {
    n: "1",
    title: "Paste any URL",
    body: "Drop any public web address. AccessBridge fetches the live HTML server-side — no browser extension needed.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    n: "2",
    title: "5 AI agents analyze & fix",
    body: "Scanner, Vision, Simplifier, and Navigator run in parallel. The Orchestrator merges results and resolves conflicts.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    n: "3",
    title: "Download & deploy",
    body: "Get the transformed HTML and a full report — WCAG score, every issue found, every fix applied.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
] as const;

// ─── Example URLs ─────────────────────────────────────────────────────────────

const EXAMPLES = [
  { label: "example.com",  url: "https://example.com",                               tag: "Simple" },
  { label: "Wikipedia",    url: "https://en.wikipedia.org/wiki/Web_accessibility",    tag: "Content-heavy" },
  { label: "W3C",          url: "https://www.w3.org/WAI/fundamentals/accessibility-intro/", tag: "Reference" },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();
  const [mode,        setMode]        = useState<AnalysisMode>("cloud");
  const [externalUrl, setExternalUrl] = useState<string | undefined>(undefined);

  const handleAnalyze = (url: string) => {
    router.push(`/analyze?url=${encodeURIComponent(url)}&mode=${mode}`);
  };

  const handleExample = (url: string) => {
    setExternalUrl(url);
    // Small delay so the input renders the pre-filled URL before navigating
    setTimeout(() => handleAnalyze(url), 120);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* ── Skip link — WCAG 2.4.1 ── */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-lg focus:font-semibold focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* ─────────────────────────────────────────────────────── Header ── */}
      <header className="flex items-center justify-between px-6 py-4 animate-fade-in" role="banner">
        <a
          href="/"
          className="flex items-center gap-2.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="AccessBridge AI — home"
        >
          <BridgeIcon size={36} />
          <span className="font-display font-semibold text-primary text-base tracking-tight">
            AccessBridge<span className="text-accent"> AI</span>
          </span>
        </a>

        <nav aria-label="Site navigation">
          <ul className="flex items-center gap-6 text-sm font-medium text-primary/50 list-none m-0 p-0">
            <li>
              <a
                href="#how-it-works"
                className="hover:text-primary transition-colors duration-150 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                How it works
              </a>
            </li>
            <li>
              <a
                href="https://github.com/jpablortiz96/accessbridge-ai"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View AccessBridge AI on GitHub (opens in new tab)"
                className="
                  px-4 py-1.5 rounded-lg border-2 border-primary/15 text-primary/70
                  hover:border-accent hover:text-accent transition-all duration-150
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
                "
              >
                GitHub
              </a>
            </li>
          </ul>
        </nav>
      </header>

      {/* ──────────────────────────────────────────────────────── Hero ── */}
      <main id="main-content" className="flex-1 flex flex-col items-center px-6 pt-10 pb-20">

        {/* Logo mark */}
        <div className="animate-slide-up mb-6">
          <div
            className="inline-flex items-center justify-center w-24 h-24 rounded-3xl ring-1 ring-primary/8"
            style={{ backgroundColor: "rgba(22,193,114,0.08)" }}
          >
            <BridgeIcon size={56} />
          </div>
        </div>

        {/* Headline + tagline */}
        <div className="animate-slide-up-delay text-center mb-8">
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-primary leading-tight tracking-tight mb-4">
            Access<span className="text-accent">Bridge</span>{" "}
            <span className="text-accent">AI</span>
          </h1>
          <p className="text-xl md:text-2xl text-primary/60 font-display font-light max-w-xl mx-auto leading-snug">
            5 AI agents. One mission:{" "}
            <span className="text-primary/80 font-medium">universal accessibility.</span>
          </p>
        </div>

        {/* Mode toggle */}
        <div className="animate-slide-up-delay-2 mb-6">
          <ModeToggle value={mode} onChange={setMode} />
        </div>

        {/* URL input */}
        <div className="animate-slide-up-delay-2 w-full flex justify-center mb-4">
          <UrlInput
            onAnalyze={handleAnalyze}
            isLoading={false}
            externalUrl={externalUrl}
          />
        </div>

        {/* Example URLs */}
        <div
          className="animate-slide-up-delay-3 flex flex-wrap items-center justify-center gap-2 mb-10"
          aria-label="Example URLs to try"
        >
          <span className="text-xs text-primary/35 mr-1">Try:</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.url}
              onClick={() => handleExample(ex.url)}
              className="
                group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                text-xs font-medium border border-primary/10 bg-white
                text-primary/55 hover:text-accent hover:border-accent/40
                transition-all duration-150
                focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
              "
              aria-label={`Analyze ${ex.label} (${ex.tag})`}
            >
              <span
                className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: "#16C17215", color: "#16C172" }}
              >
                {ex.tag}
              </span>
              {ex.label}
              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-accent" aria-hidden="true">→</span>
            </button>
          ))}
        </div>

        {/* ── Agent strip ── */}
        <div className="animate-slide-up-delay-3 w-full max-w-2xl mb-12">
          <div
            className="flex items-start justify-center flex-wrap gap-4 sm:gap-8"
            role="list"
            aria-label="AI agents"
          >
            {AGENTS.map((agent) => (
              <div
                key={agent.label}
                role="listitem"
                className="group relative flex flex-col items-center gap-1.5 cursor-default"
                aria-label={`${agent.label} agent: ${agent.description}`}
              >
                {/* Tooltip */}
                <div
                  className="
                    absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full
                    opacity-0 group-hover:opacity-100 pointer-events-none
                    transition-opacity duration-200 z-10
                  "
                  role="tooltip"
                >
                  <div
                    className="bg-primary text-white text-[11px] font-medium px-3 py-2 rounded-xl whitespace-nowrap shadow-xl max-w-[180px] text-center leading-snug"
                  >
                    {agent.description}
                  </div>
                  {/* Arrow */}
                  <div
                    className="w-2 h-2 bg-primary rotate-45 mx-auto -mt-1"
                    aria-hidden="true"
                  />
                </div>

                {/* Circle */}
                <div
                  className="
                    w-12 h-12 rounded-2xl flex items-center justify-center text-xl
                    transition-all duration-200
                    group-hover:scale-110 group-hover:-translate-y-1 group-hover:shadow-md
                  "
                  style={{
                    backgroundColor: agent.color + "15",
                    border: `1.5px solid ${agent.color}30`,
                  }}
                >
                  {agent.emoji}
                </div>

                <span className="text-[11px] font-medium text-primary/45 transition-colors group-hover:text-primary/70">
                  {agent.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-5 text-center text-xs text-primary/30 font-display">
            Hover over an agent to learn what it does
          </p>
        </div>

        {/* ──────────────────────────── How it works ── */}
        <section
          id="how-it-works"
          aria-labelledby="how-heading"
          className="animate-slide-up-delay-4 w-full max-w-3xl mb-16"
        >
          <div className="text-center mb-10">
            <h2
              id="how-heading"
              className="text-2xl sm:text-3xl font-bold text-primary tracking-tight mb-2"
            >
              How it works
            </h2>
            <p className="text-sm text-primary/45 font-display">
              From raw HTML to accessible content in seconds
            </p>
          </div>

          {/* Steps with dotted connectors */}
          <div className="flex flex-col sm:flex-row items-stretch gap-0">
            {STEPS.map((step, i) => (
              <Fragment key={step.n}>
                {/* Step card */}
                <div
                  className="
                    flex-1 bg-white rounded-3xl border border-primary/8 p-6
                    hover:border-primary/16 hover:shadow-sm transition-all duration-200
                    flex flex-col gap-4 relative
                  "
                >
                  {/* Large number */}
                  <span
                    className="text-6xl font-black leading-none select-none"
                    style={{ color: "#16C17220" }}
                    aria-hidden="true"
                  >
                    {step.n}
                  </span>

                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-accent"
                    style={{ backgroundColor: "#16C17215" }}
                    aria-hidden="true"
                  >
                    {step.icon}
                  </div>

                  {/* Text */}
                  <div>
                    <h3 className="text-sm font-bold text-primary mb-1.5">{step.title}</h3>
                    <p className="text-xs text-primary/50 leading-relaxed">{step.body}</p>
                  </div>
                </div>

                {/* Dotted connector between steps */}
                {i < STEPS.length - 1 && (
                  <div
                    className="hidden sm:flex items-center justify-center w-10 flex-shrink-0"
                    aria-hidden="true"
                  >
                    <div className="w-full border-t-2 border-dashed border-accent/25" />
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        </section>

        {/* ──────────────────────── Standards supported ── */}
        <div
          className="animate-slide-up-delay-4 flex flex-wrap justify-center gap-2 mb-16"
          aria-label="Supported accessibility standards"
        >
          {[
            "WCAG 2.1 AA",
            "WCAG 2.2",
            "ARIA 1.2",
            "Color Contrast",
            "Keyboard Navigation",
            "Screen Reader",
            "Plain Language",
          ].map((tag) => (
            <span
              key={tag}
              className="px-3 py-1 text-xs font-medium rounded-full bg-primary/5 text-primary/50 border border-primary/8"
            >
              {tag}
            </span>
          ))}
        </div>

      </main>

      {/* ──────────────────────────────────────────────── Footer ── */}
      <footer className="border-t border-primary/8 px-6 py-8" role="contentinfo">
        <div className="max-w-3xl mx-auto">

          {/* Top row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-5 mb-5">

            {/* Brand */}
            <div className="flex items-center gap-2.5">
              <BridgeIcon size={22} />
              <span className="font-semibold text-primary/70 text-sm">AccessBridge AI</span>
            </div>

            {/* Badge row */}
            <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs">
              <span
                className="px-3 py-1 rounded-full font-semibold border"
                style={{ background: "#16C17212", color: "#16C172", borderColor: "#16C17230" }}
              >
                🏆 JS AI Build-a-thon • Agents for Impact
              </span>
              <span className="flex items-center gap-1.5 text-primary/50">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M4.5 7h5M7 4.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                Powered by Azure AI + Foundry Local
              </span>
            </div>

            {/* GitHub */}
            <a
              href="https://github.com/jpablortiz96/accessbridge-ai"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View AccessBridge AI source code on GitHub (opens in new tab)"
              className="
                flex items-center gap-1.5 text-xs text-primary/45 hover:text-primary
                transition-colors duration-150
                rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
              "
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
              GitHub
            </a>
          </div>

          {/* Bottom row — attribution */}
          <div className="text-center text-xs text-primary/30">
            Made with{" "}
            <span aria-label="love">❤️</span>
            {" "}by{" "}
            <span className="text-primary/50 font-medium">Juan Pablo Enriquez Ortiz</span>
          </div>

        </div>
      </footer>

    </div>
  );
}
