// Help desk: short how-to steps the app can read out loud, and a matcher for typed/spoken questions.

export type HelpTopic = { id: string; title: string; keywords: string[]; steps: string[] };

export const HELP: HelpTopic[] = [
  {
    id: "new-project",
    title: "Start a new project (upload a print)",
    keywords: ["new", "project", "upload", "print", "pdf", "plans", "start", "add", "job", "work order"],
    steps: [
      "On the home screen, tap New project.",
      "Tap Choose work print PDF and pick the print from Files or Mail.",
      "The app reads the W O number and project number from the print. Fix them if they are wrong.",
      "Tap Create project.",
      "Next, go to the Master tab and add the master unit list.",
    ],
  },
  {
    id: "master",
    title: "Add the master unit list and task codes",
    keywords: ["master", "unit", "list", "estimate", "quantity", "qty", "task", "code", "billing", "codes"],
    steps: [
      "Open the project and tap the Master tab.",
      "Tap Photo of master list to take a picture of it, or Choose screenshot. You can also type each row.",
      "Check every code and quantity. These numbers are the most the app will ever give out.",
      "Type the billing task code next to each unit code.",
      "To change a task code on one sheet only, open that sheet and use Task codes on this sheet.",
    ],
  },
  {
    id: "mark",
    title: "Mark runs and spots on a sheet",
    keywords: ["mark", "run", "spot", "highlight", "sheet", "draw", "cut", "removal", "tap", "yellow", "pink"],
    steps: [
      "Open the project and tap the Sheets tab, then pick a sheet.",
      "For a highlighted cable run, tap Run, tap along the run, then tap Finish run.",
      "For a cut, splice or removal location, tap Spot, then tap the spot on the sheet.",
      "In the box that opens, tap Add code, pick the code and type the count. Or tap Speak codes and say them, like S10B 50.",
      "Tap Done when finished.",
    ],
  },
  {
    id: "measure",
    title: "Measure a run on the map or by walking",
    keywords: ["measure", "map", "maps", "google", "gps", "walk", "feet", "footage", "length", "distance", "street"],
    steps: [
      "On the Sheets tab, tap a yellow run to open it.",
      "Tap Measure on map or walk it.",
      "Map: search the street or tap Me, then tap along the street where the cable runs. Tap Use to save the feet.",
      "Walk it: stand at the start, tap Start, and walk the route with the screen open. Tap Use when you reach the end.",
      "The feet are saved on the run.",
    ],
  },
  {
    id: "box",
    title: "Move the WORK PERFORMED box",
    keywords: ["box", "work performed", "move", "blue", "place"],
    steps: [
      "On the Sheets tab, tap Box.",
      "Tap an empty part of the sheet. That is where the top left corner of the WORK PERFORMED box goes.",
    ],
  },
  {
    id: "allocation",
    title: "Check the numbers (Allocation)",
    keywords: ["allocation", "numbers", "split", "over", "master", "flag", "flags", "lock", "remaining", "check"],
    steps: [
      "Tap the Allocation tab.",
      "Each code shows Master, Placed and Remaining. The app never places more than master.",
      "Yellow notes at the top are flags, like a code on the print that is not in the master list.",
      "To set a sheet's number by hand, type it and tap Lock. The app splits the rest across the other sheets.",
    ],
  },
  {
    id: "daily",
    title: "Enter the daily report",
    keywords: ["daily", "today", "report", "day", "row", "production", "billing", "entry"],
    steps: [
      "Tap the Daily tab.",
      "Tap Add row. Pick the unit code, check the task code, and type the quantity done today.",
      "Add as many rows as you need.",
      "To print or send it, go to the Export tab and tap Daily report PDF.",
    ],
  },
  {
    id: "export",
    title: "Export sheets and reports",
    keywords: ["export", "print", "pdf", "send", "report", "download", "share", "email", "sheets", "csv"],
    steps: [
      "Tap the Export tab.",
      "Tap Combined PDF to get all the sheets with code callouts, the WORK PERFORMED box and the units block filled in.",
      "Tap Job report PDF or Daily report PDF for the BARDEN reports with photos.",
      "Use the share button to email or text the file.",
    ],
  },
  {
    id: "photos",
    title: "Take photos",
    keywords: ["photo", "picture", "camera", "pic", "snap", "image"],
    steps: [
      "On the Sheets tab, scroll down to Photos.",
      "Tap Take photo to use the camera, or Choose photo to pick one you already took.",
      "Tap a photo to see it big, change its type, or delete it.",
    ],
  },
  {
    id: "voice",
    title: "Use your voice",
    keywords: ["voice", "speak", "talk", "say", "microphone", "mic", "dictate"],
    steps: [
      "Tap any button with a microphone on it.",
      "Say the codes and numbers, like S10B 50, S16A 50.",
      "Tap again to stop. If the button does not work, use the microphone key on the keyboard.",
    ],
  },
  {
    id: "crew",
    title: "Add your crew (invite by text or email)",
    keywords: ["crew", "invite", "member", "share", "team", "text", "add", "people", "worker", "foreman"],
    steps: [
      "Open the project and tap Crew at the top.",
      "The first time, pick New crew, type a crew name, then tap Share project.",
      "Under Invite, type the person's cell number and tap Send by text, or type their email and tap Send by email.",
      "They tap the link, sign in with their email, and tap Join.",
    ],
  },
  {
    id: "signin",
    title: "Sign in, password and sign out",
    keywords: ["sign", "login", "log", "in", "out", "password", "code", "email", "account", "name"],
    steps: [
      "Tap Account on the home screen.",
      "To sign in, type your email and tap Send me a code. Type the 6 digit code from the email.",
      "Once signed in, you can save your name and set a password so you don't need the email next time.",
      "You only need to sign out if someone else will use this device.",
    ],
  },
  {
    id: "offline",
    title: "No signal (offline)",
    keywords: ["offline", "signal", "service", "internet", "sync", "upload", "synced", "saved", "wifi", "lost"],
    steps: [
      "Everything you do saves on this device right away, even with no signal.",
      "When you get signal again, shared projects upload by themselves.",
      "The chip at the top says Synced when everything is uploaded.",
      "The map needs signal. Walk it with GPS works without signal.",
    ],
  },
  {
    id: "install",
    title: "Put the app on the home screen",
    keywords: ["install", "home", "screen", "icon", "app", "add", "update"],
    steps: [
      "On iPhone or iPad, open the app in Safari.",
      "Tap the share button, then Add to Home Screen, then Add.",
      "Open LineOS from the new icon. It updates by itself.",
    ],
  },
];

const STOP = new Set(["how", "do", "i", "the", "a", "an", "to", "on", "in", "of", "my", "is", "it", "can", "what", "where", "you", "me", "and", "for", "with", "this", "that"]);

/** Best matching help topics for a typed or spoken question (best first, at most `limit`). */
export function findHelp(question: string, limit = 3): HelpTopic[] {
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
  if (!words.length) return [];
  const scored = HELP.map((t, order) => {
    const title = t.title.toLowerCase();
    let score = 0;
    for (const w of words) {
      const stem = w.length > 4 ? w.replace(/(ing|es|s|ed)$/, "") : w;
      if (t.keywords.some((k) => k === w || k === stem || (stem.length > 3 && k.startsWith(stem)))) score += 2;
      else if (stem.length > 2 && title.includes(stem)) score += 1;
    }
    return { t, score, order };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.t);
}

/** What the read-aloud voice says for a topic. */
export function speechFor(t: HelpTopic): string {
  return [t.title + ".", ...t.steps.map((s, i) => `Step ${i + 1}. ${s}`)].join(" ");
}
