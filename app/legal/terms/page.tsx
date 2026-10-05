import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Terms ${BRAND.separator} ${BRAND.name}`,
  description: "The terms of use, in the plainest language they can be written in.",
};

export default function Terms() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Terms of use</h1>
      <p className="text-ink-soft">Last updated 2 October 2026.</p>

      <p className="rounded-[12px] border border-wont/40 bg-wont/5 p-4 text-sm">
        <strong>Before this goes live:</strong> the operating entity, its address and
        the governing jurisdiction are not filled in below, and a lawyer in that
        jurisdiction should read this. It is written to be honest and specific rather
        than to be sufficient.
      </p>

      <h2>Who we are</h2>
      <p>
        {BRAND.name} is operated by <em>[entity name]</em>, <em>[registered
        address]</em>. Contact: <em>[support address]</em>.
      </p>

      <h2>What you are agreeing to</h2>
      <p>
        Using {BRAND.name} means accepting these terms. If you do not accept them,
        do not use it.
      </p>

      <h2>The free product</h2>
      <p>
        Compressing, splitting, merging, organising and locking documents is free,
        needs no account, and runs entirely in your browser. We do not charge for
        it, we do not meter it, and we do not promise it will always exist.
      </p>

      <h2>Your documents are yours</h2>
      <p>
        You keep every right in anything you process here. We claim no licence over
        your documents, we do not use them to train anything, and for the free
        product we never receive them in the first place.
      </p>
      <p>
        You are responsible for having the right to process what you upload, and for
        the lawfulness of what you send and to whom.
      </p>

      <h2>What a subscription buys</h2>
      <p>
        A paid plan lets {BRAND.name} send your finished files by email on your
        behalf, keeps a record of what was sent, and remembers your settings. Plans,
        prices and monthly email allowances are shown at the point of purchase.
        Exceeding your allowance pauses sending until the next period or until you
        move to a larger plan; it never deletes anything.
      </p>

      <h2>Sending email</h2>
      <p>
        If you grant permission, we send email <em>from your own Gmail account</em>
        using the narrowest permission Google offers for the purpose, which allows
        sending and nothing else. We cannot read your mailbox. You can withdraw the
        permission in your Google account at any time, and doing so stops that route
        working immediately.
      </p>
      <p>You may not use the sending feature to send unsolicited bulk email, anything
        unlawful, or anything you do not have the right to send. We will suspend an
        account that does, without a refund for the period in which it happened.
      </p>

      <h2>What we do not promise</h2>
      <p>
        We measure every file we hand back and we will not show you a size we have
        not verified. What we cannot promise is that a particular portal or mail
        server will accept a particular file: limits are published inconsistently,
        enforced inconsistently, and changed without notice. If a form rejects a
        file that is genuinely under the limit it stated, that is the form&apos;s
        behaviour and not something we can control.
      </p>
      <p>
        Compression below a certain point loses detail. Where that happens the
        interface says so before you download anything. Converting pages to images
        removes selectable text permanently, and we warn about it every time.
      </p>
      <p>
        <strong>Keep your originals.</strong> This product makes new files; it does
        not manage your only copy, and nothing here is a backup.
      </p>

      <h2>Passwords</h2>
      <p>
        If you lock a document with a password, that password is never sent to us
        and never stored anywhere. We cannot recover it and nor can anyone else. A
        forgotten password means a document nobody will open again. The interface
        says so before the button, and it is worth repeating here.
      </p>

      <h2>Availability</h2>
      <p>
        We do not promise uninterrupted service. The free tool is static files on a
        content network and will usually outlive any outage of the paid parts, which
        is deliberate.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, our total liability to you for any claim is
        limited to what you paid us in the twelve months before it arose. We are not
        liable for a missed deadline, a rejected application, or a document that did
        not arrive. Nothing here limits liability that cannot lawfully be limited.
      </p>

      <h2>Ending it</h2>
      <p>
        You can cancel at any time, and you can delete your account at any time. We
        may suspend an account that breaks these terms, and we will say why.
      </p>

      <h2>Changes</h2>
      <p>
        We may change these terms. If a change matters to you — price, what we store,
        what we send — we will email anyone with an account before it takes effect.
      </p>

      <h2>Law</h2>
      <p>
        These terms are governed by the laws of <em>[jurisdiction]</em>, and its
        courts have exclusive jurisdiction.
      </p>
    </>
  );
}
