import type { GlossaryEntry, MasterItem } from "./types";

// S10B, S16A, S63A descriptions come from the WO 4222352 master list; P73A from a finished
// sheet ("P73A SPLICE PIT"). Unit types for S12D, S13E, P73A follow the finished sheet
// (qty 1 each); P22K1 follows the crew markups (one per cut location). Entries marked
// "confirm" still need the real description. The crew edits these in the Codes tab.
export const SEED_GLOSSARY: GlossaryEntry[] = [
  { code: "S10A", description: "Cut Pairs (confirm description)", unitType: "PAIRS" },
  { code: "S10B", description: "Cut Pairs Dead", unitType: "PAIRS" },
  { code: "S16A", description: "Test/Verify Pairs", unitType: "PAIRS" },
  { code: "S63A", description: "Place Air Pressure Devices", unitType: "EACH" },
  { code: "S12D", description: "Confirm description", unitType: "EACH" },
  { code: "S13E", description: "Confirm description", unitType: "EACH" },
  { code: "P22K1", description: "Confirm description", unitType: "EACH" },
  { code: "P73A", description: "Splice Pit", unitType: "EACH" },
];

export const DEMO_MASTER: MasterItem[] = [
  { code: "S10B", description: "Cut Pairs Dead", estQty: 3825 },
  { code: "S16A", description: "Test/Verify Pairs", estQty: 3600 },
  { code: "S63A", description: "Place Air Pressure Devices", estQty: 5 },
];
