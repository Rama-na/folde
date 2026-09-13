import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BRAND } from "@/lib/brand";
import "./globals.css";

/*
 * Geist and Geist Mono, self-hosted and subset to latin by next/font.
 *
 * DESIGN.md used to forbid webfonts outright, on the grounds that a 200 KB font to
 * render a page about saving 200 KB is absurd. That reasoning still holds, so the
 * font is bought rather than assumed: latin subset only, and `adjustFontFallback`
 * metric-matches the system stack so a slow swap costs no layout shift. On a
 * Save-Data connection the fallback is simply what renders, and the page is fine.
 *
 * Geist Mono earns its place separately. Every file size in the product is set in
 * it, and drawn tabular figures hold a column of recomputing numbers still.
 */
const sans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
  adjustFontFallback: true,
});

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${BRAND.name} ${BRAND.separator} ${BRAND.tagline}`,
  description:
    "Name a size limit and get files that land under it — for portal uploads that " +
    "reject anything over 200 KB, and for email that bounces attachments.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
