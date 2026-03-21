import type { Metadata } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ibm-plex",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-ibm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default:  "AccessBridge AI — AI-Powered Universal Accessibility",
    template: "%s | AccessBridge AI",
  },
  description:
    "Multi-agent AI system that transforms web content into universally accessible content. " +
    "Built with Azure AI for the JS Build-a-thon 2026.",
  keywords: [
    "accessibility", "WCAG", "AI", "a11y", "screen reader",
    "web accessibility", "Azure AI", "alt text", "plain language",
  ],
  authors:   [{ name: "AccessBridge AI Team" }],
  creator:   "AccessBridge AI",
  metadataBase: new URL("https://accessbridge-ai.vercel.app"),
  openGraph: {
    title:       "AccessBridge AI — AI-Powered Universal Accessibility",
    description:
      "Multi-agent AI that analyzes any URL and transforms it into WCAG AA+ accessible content. " +
      "5 specialized agents: Scanner, Vision, Simplifier, Navigator, Orchestrator.",
    type:        "website",
    siteName:    "AccessBridge AI",
    locale:      "en_US",
  },
  twitter: {
    card:        "summary_large_image",
    title:       "AccessBridge AI — AI-Powered Universal Accessibility",
    description:
      "Paste any URL. 5 AI agents analyze and fix accessibility issues automatically.",
    creator:     "@accessbridgeai",
  },
  icons: {
    icon:        "/favicon.svg",
    shortcut:    "/favicon.svg",
  },
  manifest: "/manifest.json",
  robots: {
    index:  true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plusJakartaSans.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
    >
      <body
        className="bg-background text-primary font-sans antialiased min-h-screen"
        style={{ backgroundColor: "#FAFAFA", color: "#1A1A2E" }}
      >
        {children}
      </body>
    </html>
  );
}
