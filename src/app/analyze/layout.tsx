import type { Metadata } from "next";

// Static fallback — the client page overrides document.title once the URL is known.
export const metadata: Metadata = {
  title: "Analysis",   // rendered as "Analysis | AccessBridge AI" via the root template
  description:
    "Real-time multi-agent accessibility analysis. " +
    "Scanner, Vision, Simplifier, and Navigator agents working in parallel.",
  robots: { index: false, follow: false },  // don't index individual analysis pages
};

export default function AnalyzeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
