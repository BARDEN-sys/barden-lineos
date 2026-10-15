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

- **M1 (done):** PDF upload + text extraction (pdf.js), master list (manual, paste, screenshot
  OCR), code glossary, manual run/spot marking, allocation engine, clean output PDFs + CSV.
  Demo mode, in memory (a job lives in the browser tab).
- M2: photo of marked-up paper → detect highlights.
- M3: map / GPS measuring (`GOOGLE_MAPS_API_KEY`).
- M4: Supabase project, crew logins and invites — see [docs/addendum-crew-invites.md](docs/addendum-crew-invites.md).

See [docs/SPEC.md](docs/SPEC.md) for the full build package.

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
