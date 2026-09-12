import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
