import { describe, expect, it } from "vitest";
import { findHelp, speechFor, HELP } from "@/lib/help";

describe("help desk", () => {
  it("finds the right topic for everyday questions", () => {
    expect(findHelp("how do I upload plans")[0].id).toBe("new-project");
    expect(findHelp("where is google maps")[0].id).toBe("measure");
    expect(findHelp("invite my crew by text")[0].id).toBe("crew");
    expect(findHelp("no signal")[0].id).toBe("offline");
    expect(findHelp("measuring footage")[0].id).toBe("measure");
    expect(findHelp("how do I")).toEqual([]);
  });

  it("reads steps out with numbers", () => {
    expect(speechFor(HELP[0])).toMatch(/^Start a new project.*Step 1\. On the home screen/);
  });
});
