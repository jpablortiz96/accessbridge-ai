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
  title: "AccessBridge AI — Universal Accessibility",
  description:
    "AI-powered multi-agent system that analyzes and transforms any web page into a WCAG AA+ compliant experience.",
  keywords: ["accessibility", "WCAG", "AI", "web", "a11y"],
  openGraph: {
    title: "AccessBridge AI",
    description: "AI-Powered Universal Accessibility",
    type: "website",
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
