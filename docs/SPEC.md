# BUILD PACKAGE — BARDEN LineOS

## Goal
Field app for line crews on Frontier copper-retirement work prints. Upload the work print PDF +
master unit list, mark highlighted work, measure it, and the app spreads the unit codes across the
sheets by what is highlighted. It never exceeds the master totals. Output: clean sheets (no
highlighter) with codes placed on the map plus a "WORK PERFORMED" code/qty box.

## Setup
- Repo BARDEN-sys/barden-lineos, branch main.
- Fully separate from CoordOS, Trading, PreconOS, ClashOS, Mining (no shared DB, no cross-project
  changes). Existing BARDEN GitHub/Vercel accounts; no new accounts.
- Next.js 15 App Router, TypeScript, Tailwind, Zod, Supabase later, in-memory demo mode first,
  tests + GitHub Actions CI. Mobile-first.

## Inputs
1. Work print PDF (multi-page). Text layer via pdf.js: WO#, project #, engineers, sheet/page
   numbers, street names, cable labels (e.g. "AKF 50 24", footage like 449'), PPR/PPX tags,
   splicer/line crew notes.
2. Master unit list: Unit Code / Description / Est Qty (WO 4222352: S10B Cut Pairs Dead 3825,
   S16A Test/Verify Pairs 3600, S63A Place Air Pressure Devices 5). Manual entry + screenshot OCR.
3. Code glossary (editable): code, description, unit type FOOTAGE | PAIRS | EACH. Seed: S10A, S10B,
   S16A, S63A, S12D, S13E, P22K1, P73A. Codes on a print but missing from the master are flagged.

## Allocation engine
- Each sheet has marked items: runs (length ft, pair count) and spots (splice/cut/removal).
- FOOTAGE codes split by measured highlighted feet per sheet.
- PAIRS/EACH codes split by marked locations (pair count at each cut point).
- A sheet with no highlights gets 0 of that code.
- Largest-remainder integer rounding; per-code sum never above master Est Qty; show remaining.
- Crew can override any number and lock it; unlocked sheets rebalance.
- Hard rule: total of any code across all sheets <= master. Block export if over.

## Output
- Each sheet: the ORIGINAL PDF page + code callouts at each marked location + "WORK PERFORMED:
  <date>" box with CODE / QTY rows; fill the UNITS / ACCT CODES block.
- Export: per-sheet PDF, combined PDF, summary CSV (code, sheet, qty, totals vs master).

## Milestones
- **M1:** PDF upload + text extraction, master list, glossary, manual marking of runs/spots,
  allocation engine, clean output PDF. Demo mode with WO 4222352.
- **M2:** Photo of marked-up paper → perspective correction, detect yellow (runs) and pink
  (removal spots), map to PDF page, crew confirms.
- **M3:** Measuring. Google Maps (geocode streets, trace run, snap to roads, length in ft) and GPS
  track mode. Cross-check against printed footage. Env `GOOGLE_MAPS_API_KEY` (Maps JS, Geocoding, Roads).
- **M4:** Supabase project + crew logins + crew invites ([addendum](addendum-crew-invites.md)) + saved jobs.

## M1 done when
- WO 4222352 demo reproduces the crew's markups: S10B 50+50+100+25+3600 = 3825,
  S16A 1800+1800 = 3600; totals equal master, none over.
- Over-master entry is blocked; S10A is flagged as not in master.
- Allocation engine tests pass in CI.
