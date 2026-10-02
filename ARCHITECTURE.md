# ReadyPDF — architecture

> Status: the free product is built and deployed. Accounts, billing and sending are
> designed here and not yet built. Where something is a decision rather than a fact,
> it says so.

## The one line that governs everything

**The free product never uploads a document, and that is not a policy — it is a
property of the build.** The compression tool is a folder of static files on a CDN.
There is no server behind it that *could* receive a document. That is worth more than
any privacy policy, and the paid tier must not quietly take it away.

So the system is two deployments, not one.

```
  readypdf.app                      api.readypdf.app
  ┌────────────────────────────┐    ┌──────────────────────────────┐
  │ static assets, no server   │    │ Cloudflare Worker            │
  │                            │    │                              │
  │ marketing + the whole tool │    │ accounts  (D1)               │
  │ compression in a Worker    │───▶│ billing   (merchant of rec.) │
  │ on the user's own device   │    │ sending   (Gmail / Resend)   │
  │                            │    │ staging   (R2, minutes)      │
  │ works with the API down    │    │                              │
  └────────────────────────────┘    └──────────────────────────────┘
         free, no account                paid, account required
```

The arrow is the only place documents cross a network, it exists only for the send
feature, and the interface says so in that moment rather than in a policy.

### Why not one app on OpenNext

Moving the whole thing to a server runtime would be simpler to operate and is the
obvious thing to do. It is rejected because it costs the property above: the moment
`/` is served by code, "we could not read your documents if we wanted to" becomes
"we promise not to". It also couples the free tool's uptime to the billing system's,
which is exactly backwards — the free tool is the one with users.

A second reason, smaller but real: the first Cloudflare deploy of this project failed
precisely because Wrangler detected Next.js, assumed a server, and installed OpenNext
underneath us. `wrangler.jsonc` exists to stop that. Adopting OpenNext should be a
decision, not a default.

## About the R2 bucket

The bucket named in passing — `snug-opennext-cache` — **is not storage you set up.**
That name is what the OpenNext Cloudflare adapter creates for its own incremental
cache, left over from the deploy attempt that failed. It holds build artefacts.

Do not put user documents in it. Create a separate bucket, `readypdf-outbox`, with a
lifecycle rule that deletes objects after **1 hour**. The cache bucket can be deleted
once it is confirmed nothing references it.

## What a paid account buys

The thing a free user cannot do on their own device is *send*. Everything else —
compressing, splitting, merging, locking — already works without an account and
should stay that way. Gating a feature that costs nothing to run would be charging
for an artificial lock.

| | Free | Paid |
|---|---|---|
| Compress, split, merge, organise, lock | yes, no account | yes |
| Sends the emails for you | no | yes |
| Remembers your limits and recipients | no | yes |
| A record of what was sent and when | no | yes |

That last row is the one a business actually pays for. Somebody filing documents on
behalf of clients needs to answer "did we send it, when, and to whom" six months
later, and nothing on their device will tell them.

### Price

One customer at **$99/month** is the known quantity. That is a business price, not a
consumer one, which says the paid tier is for firms that send documents on behalf of
other people — accountants, recruiters, law offices, visa consultants.

Proposed, and needing the owner's call:

- **Free** — everything local, forever, no account.
- **₹499/month** — sending, 200 emails a month, one user. The Indian solo
  professional.
- **$99/month** — sending, 2,000 emails a month, five users, a sent log that can be
  exported. The known customer.

Charging per *email sent* rather than per file matches the cost: a send costs us
storage for minutes and one API call. Compression costs us nothing, so it is free and
unmetered in every tier.

## Sending

The user's question was whether a Google sign-in can mean we send the finished
packages to an address they name, as however many emails it takes. Yes, and there are
two routes with very different properties.

### Route A — send as the user, through Gmail

With the `gmail.send` OAuth scope, the email goes **from their own Gmail account**.
The attachments travel Google's pipe, not ours; the recipient sees a normal email
from a person they know; it lands in the sent folder of the sender.

This is strictly better for deliverability and for privacy, and it is the one to
build. Two things to know before committing:

- `gmail.send` is a **sensitive** scope, not a restricted one. It needs Google's
  OAuth verification (expect **2 to 8 weeks**), but it does **not** need the CASA
  Tier 2 security assessment that `gmail.modify` and `mail.google.com` require.
  Asking for the narrowest scope is what keeps this affordable; widening it later is
  expensive.
- Until verification clears, the app is capped at **100 test users** and everyone
  else sees an "unverified app" screen. Start verification early — it is the long
  pole in this whole plan.

Gmail's own attachment ceiling is 25 MB, which is a limit the packer already models.

### Route B — send as ReadyPDF, through Resend

A fallback for people who did not sign in with Google. The email comes from our
domain, which means SPF, DKIM and DMARC on a verified sending domain, and a warm-up
period before volume. Worse deliverability, and the recipient gets mail from a
service they have never heard of carrying somebody's documents — which is exactly
what a corporate filter is built to stop.

Build it second, and keep it clearly the lesser option in the interface.

### How many emails

The packer already answers this. `planBatches` produces N batches that each fit under
the recipient's cap; sending is simply N emails, each subject-tagged `Part 01 of 03`,
with `buildManifest` attached to the first so the recipient can check the set is
complete. Nothing new is needed in the engine.

### The upload, and saying so

A send is the only path that uploads. The sequence:

1. The browser finishes compressing. Files are in memory, nothing has left.
2. The user presses Send and sees, **on that screen before anything moves**, exactly
   what is about to be uploaded, where it goes, and that it is deleted within the
   hour.
3. The browser requests one presigned PUT per file and uploads straight to R2. The
   bytes do not pass through the Worker.
4. The Worker sends the mail, then deletes the objects. The lifecycle rule is the
   backstop, not the mechanism.

## Data

Cloudflare D1 (SQLite). Four tables plus whatever Better Auth needs for sessions.

```sql
-- Better Auth owns: user, session, account, verification

CREATE TABLE subscription (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES user(id),
  plan          TEXT NOT NULL,          -- free | solo | team
  status        TEXT NOT NULL,          -- trialing | active | past_due | cancelled
  provider      TEXT NOT NULL,          -- paddle | razorpay
  provider_ref  TEXT NOT NULL,
  period_end    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE send (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES user(id),
  to_hash       TEXT NOT NULL,          -- sha256 of the recipient, never the address
  parts         INTEGER NOT NULL,
  files         INTEGER NOT NULL,
  bytes         INTEGER NOT NULL,       -- measured, as everywhere else
  route         TEXT NOT NULL,          -- gmail | resend
  status        TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE usage (
  user_id       TEXT NOT NULL REFERENCES user(id),
  month         TEXT NOT NULL,          -- YYYY-MM
  emails        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
```

**No filenames, no recipient addresses, no document content, ever.** The sent log
answers "did we send it, when, how big, how many parts" without becoming a second
copy of the customer's client list. If a customer needs the recipient shown back to
them, that is a decision to revisit deliberately — not something to slip in because
the column was handy.

## Auth

**Better Auth** (MIT) with the D1 adapter. Email and password, Google OAuth, and
email verification. It runs on Workers, which most of the alternatives do not.

The Google sign-in is doing double duty: it is the login, and — if the user grants
the extra scope — it is the send route. Keep those two consents **separate**. Signing
in should ask for identity only; the permission to send mail as you is asked for the
first time you try to send, with the reason on screen. An app that asks to send email
as you before you have used it reads as malware, and rightly.

## Logging

Workers observability is already enabled. Logs are structured JSON through
`lib/log.ts`, and the module exists to make the wrong thing hard rather than to be a
nicer `console.log`.

The rule: **a log line may contain sizes, counts, durations, outcomes and opaque
ids. It may not contain document bytes, a filename, or an email address.** Filenames
are personal data in this product — `Aadhaar front.jpeg` and
`offer-letter-infosys.pdf` both say something about somebody. Where a name is needed
for support, log its extension and length.

Levels are `debug` (dropped in production), `info` (the shape of a job), `warn` (a
refusal the user saw), `error` (a thing we did not expect). Every line carries a
`jobId` so one person's run can be followed without knowing who they are.

## Build order

1. **UI revamp.** No dependencies, the biggest visible return.
2. **Legal pages.** Needed before a payment link can exist.
3. **Start Google OAuth verification.** 2 to 8 weeks. Begin it before writing the
   send code, not after.
4. **Accounts.** Better Auth on D1. Sign in does nothing yet except exist.
5. **Billing.** Merchant of record, webhook to `subscription`.
6. **Sending.** Gmail route first, Resend second.
7. **Sent log.** The thing the $99 customer is actually buying.

## Decisions still open

- **Payments.** An Indian company cannot bill a US customer $99/month recurring
  through Stripe without a foreign entity, and Razorpay's recurring billing is built
  for domestic cards. The usual answer for a solo founder is a **merchant of record**
  — Paddle, Lemon Squeezy or Dodo — which takes a larger cut but becomes the seller
  of record, handles VAT and GST, and needs no US entity. Recommended: start on a
  merchant of record, add Razorpay for Indian customers when there are Indian
  customers. This is the owner's call and it has tax consequences.
- **Where the company is.** Terms, refunds and the GST position all depend on it.
- **Whether the sent log shows recipients.** See the note under Data.
