"use client";

import { useState, type FormEvent } from "react";

interface UrlInputProps {
  onAnalyze: (url: string) => void;
  isLoading?: boolean;
}

export default function UrlInput({ onAnalyze, isLoading = false }: UrlInputProps) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const validate = (value: string): boolean => {
    if (!value.trim()) {
      setError("Please enter a URL to analyze.");
      return false;
    }
    try {
      const u = new URL(value.startsWith("http") ? value : `https://${value}`);
      if (!["http:", "https:"].includes(u.protocol)) {
        setError("Only HTTP and HTTPS URLs are supported.");
        return false;
      }
    } catch {
      setError("Please enter a valid URL (e.g. https://example.com).");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    if (validate(url)) {
      onAnalyze(normalized);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-2xl"
      noValidate
      aria-label="Accessibility analysis form"
    >
      <div className="relative">
        <label htmlFor="url-input" className="sr-only">
          Website URL to analyze
        </label>

        {/* Globe icon */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-primary/30"
          >
            <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
            <ellipse cx="10" cy="10" rx="3.5" ry="8.5" stroke="currentColor" strokeWidth="1.5" />
            <line x1="1.5" y1="7" x2="18.5" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="1.5" y1="13" x2="18.5" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>

        <input
          id="url-input"
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError("");
          }}
          placeholder="Paste any URL..."
          autoComplete="url"
          spellCheck={false}
          aria-describedby={error ? "url-error" : "url-hint"}
          aria-invalid={!!error}
          disabled={isLoading}
          className={`
            w-full pl-12 pr-36 py-4 text-lg rounded-2xl border-2
            bg-white text-primary placeholder-primary/30
            transition-all duration-200
            focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error
              ? "border-red-400 focus-visible:ring-red-400"
              : "border-primary/10 hover:border-primary/20 focus-visible:border-accent"
            }
          `}
        />

        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          aria-label="Analyze website accessibility"
          className={`
            absolute right-2 top-1/2 -translate-y-1/2
            px-5 py-2.5 rounded-xl text-sm font-semibold
            bg-accent text-white
            hover:bg-accent-dark active:scale-95
            transition-all duration-150
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
            disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
          `}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Analyzing…
            </span>
          ) : (
            "Analyze"
          )}
        </button>
      </div>

      {error ? (
        <p id="url-error" role="alert" className="mt-2 text-sm text-red-600 pl-1">
          {error}
        </p>
      ) : (
        <p id="url-hint" className="mt-2 text-xs text-primary/40 pl-1">
          Supports any public HTTP/HTTPS website
        </p>
      )}
    </form>
  );
}
