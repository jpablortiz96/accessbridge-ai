"use client";

import { useState } from "react";
import type { AnalysisMode } from "@/types";

interface ModeToggleProps {
  value: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
}

export default function ModeToggle({ value, onChange }: ModeToggleProps) {
  const isCloud = value === "cloud";

  const handleToggle = () => {
    onChange(isCloud ? "offline" : "cloud");
  };

  return (
    <div className="flex items-center gap-3" role="group" aria-label="Analysis mode selection">
      <span
        className={`text-sm font-medium transition-colors duration-200 ${
          !isCloud ? "text-primary" : "text-primary/40"
        }`}
        aria-hidden="true"
      >
        Offline
      </span>

      <button
        role="switch"
        aria-checked={isCloud}
        aria-label={`Switch to ${isCloud ? "offline" : "cloud"} mode`}
        onClick={handleToggle}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full
          transition-colors duration-300 ease-in-out
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
          ${isCloud ? "bg-accent" : "bg-primary/20"}
        `}
      >
        <span
          className={`
            inline-block h-4 w-4 rounded-full bg-white shadow-md
            transition-transform duration-300 ease-in-out
            ${isCloud ? "translate-x-6" : "translate-x-1"}
          `}
        />
      </button>

      <span
        className={`text-sm font-medium transition-colors duration-200 ${
          isCloud ? "text-primary" : "text-primary/40"
        }`}
        aria-hidden="true"
      >
        Cloud
      </span>
    </div>
  );
}
