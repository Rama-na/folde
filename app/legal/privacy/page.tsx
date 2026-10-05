import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Privacy ${BRAND.separator} ${BRAND.name}`,
  description:
    "What happens to your documents. The short version: for the free product, nothing — they never leave your device.",
};

/**
 * Written against what the code does, checked line by line, rather than adapted from
 * a template. Where a claim is made here there is a file that makes it true, and
 * where something is planned rather than built it says so.
 */
export default function Privacy() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="text-ink-soft">Last updated 2 October 2026.</p>

      <h2>The short version</h2>
      <p>
        When you compress, split, merge, organise or lock a document here, that
        document never leaves the device you are holding. Not briefly, not
        encrypted, not to a server that deletes it afterwards. There is no upload
        at all.
      </p>
      <p>
        That is not a promise about how we behave. The tool is a folder of static
        files served from a CDN, and the compression runs inside your own browser.
        There is no server behind it that could receive a document even if someone
        wanted one to.
      </p>

      <h2>What we do not collect</h2>
      <ul>
        <li>Your documents, or any part of them.</li>
        <li>The names of your files.</li>
        <li>Anything that identifies you, unless you create an account.</li>
      </ul>
      <p>
        There is no analytics script, no advertising pixel, no session recorder and
        no error-reporting service on the free product. Nothing is written to
        browser storage either: close the tab and the work is gone, which is
        deliberate, because a shared or family phone is the wrong place to leave
        somebody&apos;s identity documents sitting in a cache.
      </p>

      <h2>The one time a document is uploaded</h2>
      <p>
        If you pay for a subscription and use <strong>Send</strong>, we have to
        move the finished files to send them. That is the only path in this product
        that uploads anything, and when you use it the screen tells you so before
        anything moves, not afterwards and not only here.
      </p>
      <p>What happens then:</p>
      <ul>
        <li>
          Your browser uploads the finished files straight to our storage. They do
          not pass through our application.
        </li>
        <li>
          We send the emails, then delete the files. A storage rule deletes
          anything left behind within one hour, as a backstop rather than as the
          mechanism.
        </li>
        <li>
          If you signed in with Google and granted permission, the email is sent
          <em> from your own Gmail account</em>, and the attachments travel through
          Google rather than through us. This is the better route and we prefer it.
        </li>
      </ul>

      <h2>What an account stores</h2>
      <p>If you create one: your email address, and if you used Google, the name and
        profile picture Google gives us. Plus, for each thing you send:
      </p>
      <ul>
        <li>When it was sent, how many files, how many emails, and the total size.</li>
        <li>
          A one-way fingerprint of the recipient&apos;s address, so repeated sends to
          the same person can be counted. <strong>We do not store the address
          itself.</strong>
        </li>
      </ul>
      <p>
        We do not store the names of the files you sent, or their contents, or who
        they were about.
      </p>

      <h2>Logs</h2>
      <p>
        Our server records technical logs: sizes, counts, durations, outcomes and
        opaque job identifiers. By design these cannot contain a document, a
        filename or an email address — the logging code accepts a description of a
        name rather than a name. Logs are kept for 30 days.
      </p>

      <h2>Payments</h2>
      <p>
        We do not see or store your card. Payments are handled by our payment
        provider, who is the seller of record and holds that information under
        their own terms.
      </p>

      <h2>Your rights</h2>
      <p>
        You can delete your account at any time from your account page, which
        removes your email address, your subscription record and your send history.
        You can ask for a copy of what we hold by writing to us. If you used the
        Google send permission, you can withdraw it in your{" "}
        <a href="https://myaccount.google.com/permissions">Google account</a> at any
        time, independently of us.
      </p>
      <p>
        Because the free product collects nothing, there is nothing to request or
        delete unless you created an account.
      </p>

      <h2>Children</h2>
      <p>
        This is not intended for children under 13, and we do not knowingly hold
        information about them.
      </p>

      <h2>Changes</h2>
      <p>
        If this changes in a way that affects what happens to your documents, we
        will say so on the page itself and not only in this document. Quietly
        starting to upload something that used to stay on your device would be the
        one change that makes everything else here worthless.
      </p>
    </>
  );
}
