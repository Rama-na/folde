import Link from "next/link";
import { BRAND } from "@/lib/brand";

/**
 * The shell every legal page shares.
 *
 * Deliberately plain, and deliberately not hidden in a footer nobody reads: a person
 * deciding whether to hand this thing their Aadhaar should be able to find out what
 * happens to it in two taps, on a page that reads like it was written by somebody
 * who knew what the software does.
 */
export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh">
      <main className="mx-auto max-w-2xl px-5 py-8 sm:py-14">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center text-sm font-semibold tracking-tight"
        >
          {BRAND.name}
        </Link>
        <article className="mt-6 [&_a]:text-accent [&_a]:underline [&_h2]:mt-9 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-6 [&_h3]:font-semibold [&_li]:mt-1.5 [&_li]:leading-relaxed [&_p]:mt-3 [&_p]:leading-relaxed [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </article>
        <nav className="mt-12 flex flex-wrap gap-x-5 gap-y-1 border-t border-edge pt-6 text-sm">
          <Link href="/legal/terms" className="min-h-[44px] leading-[44px] text-ink-soft hover:text-accent">
            Terms
          </Link>
          <Link href="/legal/privacy" className="min-h-[44px] leading-[44px] text-ink-soft hover:text-accent">
            Privacy
          </Link>
          <Link href="/legal/refunds" className="min-h-[44px] leading-[44px] text-ink-soft hover:text-accent">
            Refunds
          </Link>
        </nav>
      </main>
    </div>
  );
}
