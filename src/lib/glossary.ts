import type { GlossaryEntry, MasterItem } from "./types";

// Descriptions marked "confirm" are placeholders: only S10B, S16A and S63A were given
// with descriptions (from WO 4222352). The crew edits these in the Glossary tab.
export const SEED_GLOSSARY: GlossaryEntry[] = [
  { code: "S10A", description: "Cut Pairs (confirm description)", unitType: "PAIRS" },
  { code: "S10B", description: "Cut Pairs Dead", unitType: "PAIRS" },
  { code: "S16A", description: "Test/Verify Pairs", unitType: "PAIRS" },
  { code: "S63A", description: "Place Air Pressure Devices", unitType: "EACH" },
  { code: "S12D", description: "Confirm description", unitType: "FOOTAGE" },
  { code: "S13E", description: "Confirm description", unitType: "FOOTAGE" },
  { code: "P22K1", description: "Confirm description", unitType: "FOOTAGE" },
  { code: "P73A", description: "Confirm description", unitType: "EACH" },
];

export const DEMO_MASTER: MasterItem[] = [
  { code: "S10B", description: "Cut Pairs Dead", estQty: 3825 },
  { code: "S16A", description: "Test/Verify Pairs", estQty: 3600 },
  { code: "S63A", description: "Place Air Pressure Devices", estQty: 5 },
];
