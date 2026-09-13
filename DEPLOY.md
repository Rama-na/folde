# Deploying Snug

## It does not need a server

No API routes, nothing reads the environment at runtime, and every byte of work
happens in the browser. `npm run build:static` produces a 3.5 MB folder of plain
files, and `npm run test:static` drives that folder through the full journeys —
the Web Worker, pdf.js loading its own nested worker, and the 42-file job at phone
width — to prove it.

So the right home is a CDN, not a container. That is cheaper, faster from India,
and there is nothing running to keep patched.

**Recommended: Cloudflare Pages.** Free, unlimited bandwidth, and many Indian
points of presence, which matters when the audience is mid-range Android on mobile
data. A container host would run a Node process in one region to serve files that
never change.

The container path still works and is documented below, because it is the sibling
Thinnai repo's arrangement and there is value in consistency if you would rather
keep one deployment story.

---

## Cloudflare Pages

**1. Merge to `main`.** Pages builds from a branch.

```sh
git checkout main
git merge claude/practical-allen-7r7bss
git push origin main
```

**2. Create the project.** Cloudflare dashboard → Workers & Pages → Create →
Pages → Connect to Git → pick `Rama-na/folde`.

**3. Build settings.**

| Field | Value |
|---|---|
| Framework preset | None |
| Build command | `npm run build:static` |
| Build output directory | `out` |
| Node version | `22` |

Set Node via an environment variable if the UI does not offer it:
`NODE_VERSION` = `22`.

There are no other environment variables. If you find yourself adding one, check
why — nothing in the app reads any.

**4. Save and Deploy.** First build takes two or three minutes, mostly `npm ci`.
You get a `*.pages.dev` URL.

**5. Custom domain.** Pages project → Custom domains → Set up a domain. If the
domain is already on Cloudflare, DNS is automatic. Otherwise point a CNAME at the
`pages.dev` hostname.

**6. Check it on a phone**, on mobile data rather than wifi. Drop in a real photo
and a real scan. The thing to confirm is that the worker runs and the number lands
green — that is the whole product.

Every push to `main` redeploys. Pull requests get their own preview URL.

---

## Railway, if you prefer one deployment story

The `Dockerfile` builds the standalone Node target and is the same shape as
Thinnai's.

**1.** Railway → New Project → Deploy from GitHub repo → `Rama-na/folde`.

**2.** Railway detects the `Dockerfile` and uses it. No build command to set.

**3.** No environment variables are required. `APP_URL` is optional and only
affects absolute URLs in metadata; on Railway, `RAILWAY_PUBLIC_DOMAIN` is picked
up already.

**4.** Settings → Networking → Generate Domain.

**5.** Custom domain in the same panel, then a CNAME at the Railway host.

Note the Dockerfile runs `npm run build`, which is the *static* target. For a
container you want the server one, so either set `BUILD_TARGET=server` as a
Railway build variable, or change the Dockerfile's build step to
`npm run build:server`.

**Not verified here.** The sandbox this was built in has the Docker CLI but no
daemon, so the image was never actually built. What was verified is that
`npm run build:server` succeeds and produces everything the Dockerfile copies:
`.next/standalone/server.js`, `.next/static`, and `public/pdf.worker.min.mjs`.
The container layer itself is unproven — build it once locally before trusting it.

---

## Before you point a domain at it

- **Clear the name.** "Snug" has had a web search and nothing significant turned
  up, which is not clearance. Check the trademark register and the app stores in
  your jurisdiction before paying for a domain or printing anything. The name
  lives in `lib/brand.ts` and `package.json` only, so a rename is cheap while it
  is still cheap.
- **The repo is still called `folde`.** That is fine and costs nothing; the
  deployed name comes from `lib/brand.ts`.
- **Nothing collects anything.** No analytics, no accounts, no error reporting. If
  you add any of those, the promise in the footer has to change with them.

## Getting a release wrong

Both hosts keep previous deployments and can roll back from their dashboard in
one click. Cloudflare Pages keeps every build; Railway keeps recent ones.

Before any deploy that touches compression, delivery or batching:

```sh
npm run test          # the engine and the arithmetic
npm run build:static
npm run test:static   # the real journeys, against what will actually ship
```

`npm run test:all` runs everything including the container target.
