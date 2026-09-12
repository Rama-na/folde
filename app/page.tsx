import { BRAND } from "@/lib/brand";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-5 py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {BRAND.name}
      </h1>
      <p className="mt-3 text-lg text-ink-soft">{BRAND.tagline}</p>

      <div className="mt-10 space-y-5 border-t border-edge pt-8 text-[15px] leading-relaxed">
        <p>
          Two problems, one answer. A portal form that rejects anything over 200 KB
          and gives you no useful error. An email that bounces because the other
          side caps attachments at 5 MB.
        </p>
        <p className="text-ink-soft">
          You name the limit. {BRAND.name} measures the real bytes of the real
          output and only tells you it fits once it does.
        </p>
      </div>
    </main>
  );
}
