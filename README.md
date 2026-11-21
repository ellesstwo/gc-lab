# GC Lab

**Live app: [gc-lab.app.space](https://gc-lab.app.space)** · No account needed to analyze; sign in to save and share.

GC Lab is a small full-stack web app for measuring the **GC content of DNA sequences**.
Paste a raw sequence or a FASTA record and it shows the overall GC content, the base
composition, and an interactive chart of GC content along the sequence. Signed-in users
can save analyses (private by default) and share them; shared analyses appear in other
users' libraries in real time.

It is built on the [DeepSpace SDK](https://docs.deep.space) (React + Cloudflare Workers)
and adapts algorithms from a computational genomics course exercise.

> This GitHub repository is a public mirror. The app is deployed from DeepSpace's own
> repository, which is its official source (see [Deploying](#deploying)).

---

## Features

| Feature | Details |
|---|---|
| **Sequence input** | Raw sequence or one FASTA record. Only A, C, G, T, N (any case); whitespace ignored. Clear errors with line and column, and a "Show me" button that selects the bad character. Maximum 25,000 nucleotides. |
| **GC statistics** | Length, overall GC %, unknown bases (N), base composition bar. |
| **GC chart** | Non-overlapping windows (adjustable size), plotted at their midpoints. Windows that are 80% N or more are **gaps**, not guesses. Hover or use the arrow keys to read a window; a data table shows every value. |
| **Guests** | Can analyze freely. Saving requires sign-in. |
| **Saving** | Confirmed by the server before the UI says "Saved". New analyses are **private**. |
| **Library** | `/library`: *My analyses* and *Shared by others*, updated live. |
| **Reopen** | *Open in analyzer* on any library card (yours or shared with you) loads the saved sequence and window size back into the analyzer. The saved original never changes; saving again creates a new copy. |
| **Sharing** | A Private/Shared switch on your own analyses. Shared analyses appear for every signed-in user without a refresh; making one private again removes it from their libraries. |

---

## The GC algorithm

The calculations are a TypeScript port of the original Python course code (`exercise1.py`,
kept locally and not committed). The port fixes several bugs in the original:

| Original behavior | GC Lab |
|---|---|
| `genome[i-p:i-1]`: each window was **one base short** | Windows are exactly `windowSize` bases: `[start, start + windowSize)` |
| `range(p, len(genome), p)`: the **last window was always dropped** | The last window is kept, even if shorter |
| N counted in the denominator | **GC % = (G + C) / (A + C + G + T)** |
| Windows over 80% N filled with the whole-region average | Windows with **≥ 80% N** are gaps (`gcPercent: null`) |
| Whole genome re-counted on every loop iteration | Each base is counted once |
| No input validation; extra FASTA records silently merged into one sequence | Only A/C/G/T/N accepted, one record only; anything else is rejected with a clear message (the user's data is never changed silently) |

Default window size follows the original: `ceil(length / 100)`, at least 5. The smallest
allowed window keeps the chart at **1,000 points or fewer**.

---

## Technology

| Layer | Tools |
|---|---|
| Language | TypeScript |
| Frontend | React 19, React Router (file-based routes via generouted), Tailwind CSS 4, Base UI components, Lucide icons, IBM Plex fonts (bundled) |
| Charts | Hand-written SVG (no chart library) |
| Backend and data | DeepSpace SDK 0.44 on Cloudflare Workers; a Durable Object with SQLite stores records and pushes real-time updates over WebSockets |
| Auth | DeepSpace sign-in (GitHub or Google) |
| Build | Vite |
| Tests | Vitest (unit), Playwright with DeepSpace's multi-user fixture (browser) |
| Hosting | DeepSpace (`*.app.space`) |

The project started from the DeepSpace app template; the files written for GC Lab are
listed under [Project structure](#project-structure-the-files-written-for-gc-lab).

---

## Architecture

```
Browser (React)                                     Cloudflare (DeepSpace)
──────────────────────────────────────────          ───────────────────────────────────
Analyzer page  /home                                 Worker (worker.ts)
  text ─► parseSequenceInput ─► analyzeSequence        └─ RecordRoom (Durable Object + SQLite)
            (src/lib/gc, pure functions,                    · stores the `analyses` collection
             all GC math runs in the browser)               · checks permissions on EVERY
  Save ─► createConfirmed ───── WebSocket ─────────►          read and write
                                                            · pushes changes only to users
Library page  /library                                        allowed to see them
  useQuery('analyses') ◄──── live updates ─────────┘
  Share switch ─► putConfirmed
```

- **All GC calculations run in the browser** (fast, and guests need no server). They are
  pure functions with no React or DeepSpace code, so they are easy to unit-test.
- **The server is the security boundary.** Size limits, privacy and ownership are enforced
  by the database schema inside the Durable Object, not by the React code. Tests prove
  this by sending raw WebSocket messages that bypass the UI.
- **Real time comes from `useQuery`.** It subscribes over a WebSocket. When a record is
  created, shared, un-shared or deleted, the server re-checks who may read it and pushes
  the change only to them. There is no polling and no refresh code.

### Project structure (the files written for GC Lab)

```
src/
  lib/gc/                      Pure logic (no React, no DeepSpace)
    sequence.ts                  parse + validate input (FASTA/raw, 25,000 limit)
    gc.ts                        base counts, GC %, windows, window-size rules
    analysis-record.ts           analysis -> database record; save-error messages
    open-analysis.ts             reading a saved analysis passed from the library
    example.ts                   synthetic example sequence (seeded, deterministic)
    *.test.ts                    unit tests (Vitest)
  schemas/analyses-schema.ts   The database collection: columns, limits, permissions
  components/gc/               UI pieces: SequenceInput, StatsPanel, GcChart,
                                 GcDataTable, WindowSizeControl, SaveAnalysisPanel,
                                 AnalysisCard, GcSparkline, chartColors, format
  components/GcLabMark.tsx     Logo (also public/favicon.svg)
  pages/index.tsx              Landing page (/), static and pre-rendered
  pages/(app)/home.tsx         Analyzer (/home), public
  pages/(app)/(protected)/library.tsx   Library (/library), sign-in required
  themes.css                   GC Lab colors, fonts, corner radius
tests/
  smoke.spec.ts                Pages, guest rules, saving, reopening, server-side
                                 limits, dropped-connection behavior
  collab.spec.ts               Two-account privacy, live sharing, reopening shared analyses
  helpers/                     Test helpers (raw WebSocket writes, library steps)
```

Everything else (auth routes, AI tool wiring, UI primitives in `src/components/ui/`) is
the DeepSpace project template.

---

## Database: the `analyses` collection

Defined in [`src/schemas/analyses-schema.ts`](src/schemas/analyses-schema.ts).

| Column | Type | Rules (enforced by the server) |
|---|---|---|
| `name` | text | required, max 100 characters |
| `sequence` | text | required, **max 25,000**, cannot be changed after saving |
| `length`, `gcPercent`, `countA`, `countC`, `countG`, `countT`, `countN` | number | cannot be changed after saving (`gcPercent` is empty for an all-N sequence) |
| `windowSize` | number | required |
| `visibility` | `private` / `shared` | defaults to `private` |

The owner (`createdBy`) and timestamps are set by the server from the verified login.

| Who | Read | Create | Update | Delete |
|---|---|---|---|---|
| Signed-out guest (`*` and `viewer`; guests connect as `viewer`) | – | – | – | – |
| Signed-in member | own + shared | yes | own | own |
| Admin (app owner) | own + shared | yes | own | any it can see |

`read: 'published'` with `visibilityField: { field: 'visibility', value: 'shared' }` means
"the owner, or anyone when the record is shared". Only the exact value `shared` makes a
record visible; anything else stays private.

---

## DeepSpace SDK features used

| Feature | Where | Purpose |
|---|---|---|
| `CollectionSchema` (columns, `maxLength`, `required`, `immutable`, `default`, `writableFields`) | `analyses-schema.ts` | Database table plus server-side validation |
| Permissions (`'*'`, `viewer`, `member`, `admin`; `'published'`, `'own'`, `visibilityField`) | `analyses-schema.ts` | Private by default, sharing, owner-only changes |
| `useMutations`: `createConfirmed`, `putConfirmed`, `removeConfirmed`, `ready` | save panel, library | Writes that wait for the server's answer |
| `useQuery` | library | Live, permission-filtered list of analyses |
| `useAuthStatus`, `AuthOverlay`, `(protected)` route group with `AuthGate` | save panel, library | Sign-in state, sign-in dialog, gated pages |
| `useUserLookup().getName` | library | "Shared by …" display names (no emails) |
| `RecordProvider allowAnonymous` (template) | `(app)/_layout.tsx` | Guests can use the analyzer |
| `deepspace/testing` (`users` fixture, test accounts) | `tests/` | Real two-account browser tests |

---

## Running locally

**Requirements:** Node.js 22.15+, 24, or 26; npm 11.6+ (see `package.json` → `engines`);
and a [DeepSpace](https://deep.space) account.

```sh
git clone https://github.com/ellesstwo/gc-lab.git
cd gc-lab
npm install
npx deepspace auth login     # one-time: opens a browser to sign in to DeepSpace
npx deepspace app init --new-id   # cloned copies only: register your OWN app (see below)
npx deepspace dev start      # http://localhost:5173 (Vite + local Workers runtime)
```

`wrangler.toml` contains GC Lab's app ID. If you clone this repository, run
`npx deepspace app init --new-id` first: it gives your copy its own ID, data and secrets
instead of pointing at the live GC Lab app.

The local database lives in `.wrangler/` (git-ignored). Restart the dev server after
changing a schema.

### Tests

```sh
npm run test:unit            # Vitest: parser, GC math, records, schema rules
npx tsc --noEmit             # TypeScript type check
npm run lint                 # ESLint
```

Browser tests (Playwright) start their own server. If the dev server is already on 5173,
use another port:

```sh
# PowerShell
$env:DEEPSPACE_PORT=5180; npx playwright test -c tests/playwright.config.ts
# bash
DEEPSPACE_PORT=5180 npx playwright test -c tests/playwright.config.ts
```

Signed-in and two-user tests need **two DeepSpace test accounts** on your machine
(emails must end in `@deepspace.test` and are global across all developers, so add a
unique suffix):

```sh
npx deepspace test accounts list --usable
npx deepspace test accounts create --email <unique>@deepspace.test --name "Tester A" --password-stdin
```

Without them, those tests are skipped. Test records are named `__test-…__` and deleted by
the tests themselves.

### Deploying

DeepSpace's own Git repository (the `space` remote) is GC Lab's official source; GitHub
(`origin`) is a mirror for reading the code.

```sh
git commit ...               # deploy records the commit and refuses uncommitted changes
npx deepspace deploy         # sync to DeepSpace and publish to https://gc-lab.app.space
git push origin main         # update the GitHub mirror
```

For documentation-only changes, `npx deepspace push` syncs DeepSpace's repository without
redeploying. Every deploy is recorded and can be rolled back (`npx deepspace releases`,
`npx deepspace rollback <release-id>`).

---

## Where to change things

| To change… | Edit |
|---|---|
| Maximum sequence length | `MAX_NUCLEOTIDES` in `src/lib/gc/sequence.ts` (the schema imports it, so the server limit follows) |
| The N-gap threshold (80%) | `N_GAP_THRESHOLD` in `src/lib/gc/gc.ts` (the comparison is `>=`) |
| Default window size / max chart points | `TARGET_WINDOW_COUNT`, `MIN_WINDOW_SIZE`, `MAX_WINDOW_COUNT` in `src/lib/gc/gc.ts` |
| Allowed characters or error messages | `VALID_BASES` and `describeInvalidCharacter` in `src/lib/gc/sequence.ts` |
| Add a saved field | Column in `analyses-schema.ts` + `Analysis` interface + `WRITABLE_FIELDS` + `buildAnalysisRecord` (a unit test checks these agree) |
| Who can see or change records | `permissions` in `analyses-schema.ts`, then run the browser tests |
| Colors, fonts, corner radius | `src/themes.css` (chart colors: `src/components/gc/chartColors.ts`) |
| Navigation links | `src/nav.ts` |

---

## Known limitations

- **Summary numbers are computed in the browser.** A modified browser could save a real
  sequence with wrong stats on its *own* record (it cannot affect anyone else's). Moving the
  calculation into a DeepSpace server action would close this.
- **One sequence per analysis.** Multi-record FASTA files are rejected rather than split.
- **Sharing is all-or-nothing:** "shared" means every signed-in user of the app, not
  specific people.
- **Reopening is a copy, not a link.** *Open in analyzer* carries the saved data along with
  the page navigation (React Router state). It needs no extra server request and can only
  open records the server already sent to the library, but it is not a shareable URL.
- **Dark theme only.**

---

## AI assistance

This project was built with substantial help from **Claude Code**, Anthropic's AI coding
assistant, working step by step under my direction.

**My role:** I defined the project and its scope, supplied my original Python course code,
and made the key design decisions: windows that are 80% N or more shown as gaps, GC % over
A+C+G+T only, non-overlapping windows, a 25,000-nucleotide limit, and analyses private by
default. I reviewed every step, tested the app by hand, asked for changes, and approved
each commit.

**Claude's role:** Claude identified bugs in the original Python, ported the algorithms to
TypeScript, and wrote most of the application code, database schema, automated tests and
this README, explaining each part as it went.

**Verification:** 119 unit tests and 24 browser tests (including two-account privacy and
real-time checks), plus the same flows checked on the live deployment.
