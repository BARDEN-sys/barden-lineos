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
  - **Daily report PDF:** pick a work day; units marked that day vs job to date and master,
    each crew member's marks with times, changes / overrides that day, and that day's photos.
  - **Billing task codes:** each unit code has a task code on the Master list; a sheet can
    change it ("Task codes on this sheet"). The **Daily** tab is the billing input: pick a
    day, add rows (sheet, unit code, task code auto-filled, qty, note) or fill them from the
    day's marks. Rows that would put a code over master are blocked. Billing CSV per day or
    all days; the daily report lists the rows and totals by task code.
  - **WORK PERFORMED box:** blue table like the crew's finished sheets; tap "Box" and then an
    empty spot on the map to place it. Code callouts are yellow tags with arrows.
- **Google Earth runs (Map tab):** upload a `.kml` or `.kmz`; each Placemark LineString is a run
  (`src/lib/kml.ts`).
  - Footage for the codes is the **printed callout total** from the line's description table
    (e.g. "PPX callout 2 = 116 ft", or an HTML Callout / Feet table with or without a Total row).
    The line's length on the map is shown only as a cross-check; a run is flagged when the two
    differ by more than 15%.
  - Folders named PPX and PPR stay separate. PPR is reference only: it is totalled on its own,
    never added to PPX, and cannot be put on a sheet.
  - "Put on sheet" turns a PPX run into a run mark on that sheet under a FOOTAGE code, so the
    normal allocation engine (and the never-over-master rule) bills it. The mark keeps the line
    and callouts, and syncs with the crew like any mark.
  - "Export marked runs (.kml)" writes the job's runs that are on sheets back out for Google Earth:
    one pink Placemark per run named "WO <number> · <run>", with the callout / feet table, sheet and code.
  - Test file: `tests/fixtures/wo-4222528-standin.kml` is a **stand-in** built to the WO 4222528
    footages (PPX 894 / 824 / 874 / 624 = 3,216; PPR 1,329). Swap in the real export when available.
- M2: photo of marked-up paper → detect highlights.
- M3: map / GPS measuring (`GOOGLE_MAPS_API_KEY`).
- **M4 (built):** crew logins and invites on LineOS's own Supabase project (see `supabase/`).
  - Sign in with a 6-digit code by email (or by text once the SMS provider is switched on).
  - Foreman shares a project with a crew; invite by **text** (opens your Messages app), **email**
    (opens your Mail app), copy link, or a **QR code for the truck**; whole crew or one project;
    Foreman or Crew role; change role / remove anytime; pending invites with resend / cancel.
  - Shared projects sync both ways: edits upload when there is signal (offline work waits on the
    phone), other people's changes arrive live, every mark/row shows who made it.
  - The server blocks any code going over master across all crew edits and names who billed it.
  - Crew members cannot change master totals, task codes or export final sheets.
  - See [docs/addendum-crew-invites.md](docs/addendum-crew-invites.md).

See [docs/SPEC.md](docs/SPEC.md) for the full build package.

## Offline and automatic updates

- **Install:** Android/Chrome shows "Install LineOS on this phone"; iPhone: Share → Add to
  Home Screen. Icons come from the BARDEN logo.
- **Works with no signal:** after the app has been opened online once, the service worker
  (`scripts/sw.template.js` → `public/sw.js` at build) serves the app offline. Print reading,
  marking, allocation, daily input and all PDFs/CSVs run on the phone.
- **Saves automatically on the phone:** every change is written to IndexedDB
  (`src/lib/storage.ts`) half a second after it is made, and immediately when the app goes
  to the background. Jobs survive closing the app or a dead battery; the home screen lists
  the jobs saved on that phone. Header shows "Saved on phone ✓" and "Offline".
- **Updates automatically:** each deploy gets a new service-worker build id. The app checks
  for updates when opened, when brought back, and every 30 minutes; the new version is
  downloaded in the background and takes over the next time the app is brought back.
- Still needs signal: OCR the first time (it downloads its language data, then it is cached),
  voice on Android, Google Maps (M3). Upload to the office comes with M4 logins.

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
