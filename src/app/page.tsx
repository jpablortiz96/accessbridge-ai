"use client";

import { useState } from "react";
import BridgeIcon from "@/components/BridgeIcon";
import ModeToggle from "@/components/ModeToggle";
import UrlInput from "@/components/UrlInput";
import StatsBar from "@/components/StatsBar";
import type { AnalysisMode } from "@/types";

export default function Home() {
  const [mode, setMode] = useState<AnalysisMode>("cloud");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleAnalyze = async (url: string) => {
    setIsAnalyzing(true);
    // Placeholder — agent pipeline will plug in here
    await new Promise((r) => setTimeout(r, 2000));
    setIsAnalyzing(false);
    console.log("Analyzing:", url, "mode:", mode);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-6 py-4 animate-fade-in">
        <div className="flex items-center gap-2.5">
          <BridgeIcon size={36} />
          <span className="font-display font-semibold text-primary text-base tracking-tight">
            AccessBridge<span className="text-accent"> AI</span>
          </span>
        </div>

        <nav aria-label="Site navigation">
          <ul className="flex items-center gap-6 text-sm font-medium text-primary/50 list-none">
            <li>
              <a
                href="#"
                className="hover:text-primary transition-colors duration-150 focus-visible:text-primary rounded"
              >
                Docs
              </a>
            </li>
            <li>
              <a
                href="#"
                className="hover:text-primary transition-colors duration-150 focus-visible:text-primary rounded"
              >
                Pricing
              </a>
            </li>
            <li>
              <a
                href="#"
                className="
                  px-4 py-1.5 rounded-lg border-2 border-primary/15
                  hover:border-accent hover:text-accent
                  transition-all duration-150
                  text-primary/70
                "
              >
                Sign in
              </a>
            </li>
          </ul>
        </nav>
      </header>

      {/* ── Hero ── */}
      <main
        className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center"
        id="main-content"
      >
        {/* Skip to main content link — WCAG 2.4.1 */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-lg focus:font-medium"
        >
          Skip to main content
        </a>

        {/* Logo mark */}
        <div className="animate-slide-up mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/5 ring-1 ring-primary/8">
            <BridgeIcon size={48} />
          </div>
        </div>

        {/* Headline */}
        <div className="animate-slide-up-delay">
          <h1 className="text-5xl md:text-6xl font-bold text-primary leading-tight tracking-tight mb-3">
            AccessBridge{" "}
            <span
              className="text-accent"
              style={{ WebkitTextFillColor: "#16C172" }}
            >
              AI
            </span>
          </h1>
          <p className="text-lg md:text-xl text-primary/55 font-display font-light max-w-lg mx-auto leading-relaxed">
            AI-Powered Universal Accessibility
          </p>
        </div>

        {/* Mode toggle */}
        <div className="animate-slide-up-delay-2 mt-8 mb-6">
          <ModeToggle value={mode} onChange={setMode} />
        </div>

        {/* URL input */}
        <div className="animate-slide-up-delay-2 w-full flex justify-center">
          <UrlInput onAnalyze={handleAnalyze} isLoading={isAnalyzing} />
        </div>

        {/* Feature chips */}
        <div
          className="animate-slide-up-delay-3 flex flex-wrap justify-center gap-2 mt-10"
          aria-label="Supported accessibility features"
        >
          {[
            "WCAG 2.1 AA",
            "WCAG 2.2",
            "ARIA",
            "Color Contrast",
            "Keyboard Nav",
            "Screen Reader",
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

      {/* ── Stats footer ── */}
      <StatsBar />
    </div>
  );
}
