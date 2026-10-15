# BARDEN LineOS

Field app for line crews on copper-retirement work prints. Upload the work print PDF and
the master unit list, mark the highlighted work, and LineOS spreads the unit codes across
the sheets by what is marked, never above the master totals. It exports clean sheets
(original pages, no highlighter) with code callouts, a WORK PERFORMED box, and the
UNITS / ACCT CODES block filled.

Separate from every other BARDEN app: no shared database, no cross-project code.

## Run

```bash
npm install
npm run dev        # http://localhost:3000 → "Open demo job" for WO 4222352
npm test           # allocation engine, parsers, end-to-end demo
npm run typecheck
npm run build
```

## Status

- **M1 (done):** PDF upload + text extraction (pdf.js), master list (manual, paste, photo /
  screenshot OCR, voice), code glossary, manual run/spot marking, allocation engine, clean
  output PDFs + CSV, job report PDF. Demo mode, in memory (a job lives in the browser tab).
  - **Camera:** "Take photo" opens the phone's rear camera. Photos of the marked-up paper (or
    the work) attach to each sheet, open full-screen while marking, and go into the job report.
    M2 will read the highlights from these photos.
  - **Voice:** on a mark, say "S10B 50, P22K1 1" to fill codes, or dictate a note (browser
    speech recognition; falls back to the phone keyboard's mic key).
  - **Job report PDF:** BARDEN logo, units vs master, flags, work by sheet, crew marks and
    changes (who / when), photos. The logo is `public/barden-logo.png`.
  - **WORK PERFORMED box:** blue table like the crew's finished sheets; tap "Box" and then an
    empty spot on the map to place it. Code callouts are yellow tags with arrows.
- M2: photo of marked-up paper → detect highlights.
- M3: map / GPS measuring (`GOOGLE_MAPS_API_KEY`).
- M4: Supabase project, crew logins and invites — see [docs/addendum-crew-invites.md](docs/addendum-crew-invites.md).

See [docs/SPEC.md](docs/SPEC.md) for the full build package.

## Demo job (WO 4222352)

Laid out after the crew's marked-up paper prints (photos 10/8/2026): Tarpon Dr splices 1–2
(S10B 50, 50), Dolphin Dr splices 3–4 (S10B 100, 25), Haven Point Dr splice 5 (S10B 3600,
S16A 1800) and the South Beach Golf S16A 1800. S10A 1800 and P22K1 were written on the paper
but are not in the master, so they are flagged and get 0. S63A (master 5) was not written on
any photographed sheet, so it stays unmarked. The print itself is generated (placeholder
names), so no customer document is in the repo.

## How allocation works (`src/lib/allocation.ts`)

| Unit type | Split rule |
|---|---|
| FOOTAGE | The whole master qty is split across sheets in proportion to highlighted feet. |
| PAIRS / EACH | Each sheet gets the counts marked at its cut/splice spots; scaled down if marks add up to more than master. |

- Integer largest-remainder rounding: per-code totals never exceed master Est Qty.
- A sheet with no marks for a code gets 0.
- Crew can override and lock any sheet's number; unlocked sheets rebalance.
- An override that would push a code over master is rejected; export is blocked if any code is over.
- Codes found on the print or on marks but missing from the master are flagged.

## Code layout

- `src/lib/` — pure logic: `allocation.ts`, `printParse.ts`, `masterParse.ts`, `output.ts` (pdf-lib), `pdfText.ts` (pdf.js), `demo.ts`, `types.ts` (Zod).
- `src/components/` — mobile-first UI tabs: Sheets, Master, Codes, Allocation, Export.
- `tests/` — Vitest.

Every mark and override carries `jobId`, `createdBy`, `createdAt` so M4 can persist it to Supabase with an audit trail.
