import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Refunds ${BRAND.separator} ${BRAND.name}`,
  description: "Cancelling, and getting your money back.",
};

/**
 * A separate page because Indian payment gateways and most merchants of record
 * require a reachable, specific refund policy before they will approve an account.
 * It is also the page a cautious first customer looks for.
 */
export default function Refunds() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">
        Refunds and cancellation
      </h1>
      <p className="text-ink-soft">Last updated 2 October 2026.</p>

      <p className="rounded-[12px] border border-wont/40 bg-wont/5 p-4 text-sm">
        <strong>Before this goes live:</strong> confirm these windows against what
        your payment provider actually enforces, and fill in the support address.
      </p>

      <h2>Cancelling</h2>
      <p>
        Cancel from your account page at any time. Cancelling stops the next
        payment. Your plan keeps working until the end of the period you have
        already paid for, and nothing is deleted when it ends — you simply stop
        being able to send, and everything else goes on working for free as it
        always did.
      </p>

      <h2>Refunds</h2>
      <ul>
        <li>
          <strong>Within 7 days of your first payment</strong>, for any reason at
          all: a full refund, no questions. Write to us.
        </li>
        <li>
          <strong>If it did not work</strong> — the sending feature failed and we
          could not fix it — a full refund of the period in which it failed,
          whenever you tell us.
        </li>
        <li>
          <strong>If you were charged after cancelling</strong>, or charged twice:
          a full refund of the wrong charge, always.
        </li>
      </ul>
      <p>
        Outside those cases we do not refund part-used months, because the cost of a
        month is incurred when the month runs.
      </p>

      <h2>How long it takes</h2>
      <p>
        We approve refunds within 3 working days. Once approved, the money is
        returned by the payment provider to the method you paid with, which usually
        takes a further 5 to 10 working days depending on your bank.
      </p>

      <h2>How to ask</h2>
      <p>
        Write to <em>[support address]</em> from the email address on the account,
        and say what happened. You do not need a reason for a first-week refund.
      </p>

      <h2>The free product</h2>
      <p>
        Everything except sending is free and always has been. There is nothing to
        refund there, and nothing you can lose by cancelling.
      </p>
    </>
  );
}
