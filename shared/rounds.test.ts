import { describe, expect, it } from "vitest";
import { DEFAULT_QUESTIONS, PHASES, phaseDef } from "./rounds.js";

describe("phases", () => {
  it("describes signup through picture time", () => {
    expect(Object.keys(PHASES)).toEqual(["lobby", "play", "closing", "done"]);
    expect(phaseDef("lobby").title).toBe("Sign up");
    expect(phaseDef("play").title).toBe("Take or steal");
    expect(phaseDef("closing").title).toBe("Last steal");
    expect(phaseDef("done").title).toBe("Picture time");
    for (const phase of Object.values(PHASES)) {
      expect(phase.why.length).toBeGreaterThan(12);
      expect(phase.prompt.length).toBeGreaterThan(8);
    }
  });

  it("keeps a default question catalog for env fallbacks", () => {
    expect(DEFAULT_QUESTIONS).toHaveLength(10);
    expect(DEFAULT_QUESTIONS[0]).toMatch(/elf/i);
  });
});
