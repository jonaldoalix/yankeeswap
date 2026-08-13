import { describe, expect, it } from "vitest";
import { activeHouseRules, DEFAULT_MODS, MOD_KNOBS, MOD_TOGGLES } from "./mods.js";

describe("mod catalog", () => {
  it("documents all thirteen knobs", () => {
    expect(MOD_KNOBS).toHaveLength(2);
    expect(MOD_TOGGLES).toHaveLength(11);
    for (const item of [...MOD_KNOBS, ...MOD_TOGGLES]) {
      expect(item.label.length).toBeGreaterThan(3);
      expect(item.blurb.length).toBeGreaterThan(20);
      expect(item.key in DEFAULT_MODS).toBe(true);
    }
  });

  it("lists the house rules that are actually on", () => {
    expect(activeHouseRules(DEFAULT_MODS)).toEqual([
      "Freeze after 3",
      "No revenge",
      "First-last",
      "Turn clock",
    ]);
    expect(activeHouseRules({ ...DEFAULT_MODS, freezeAfter: 0, chainCap: 2, gentle: true })).toEqual(
      ["Chain cap 2", "No revenge", "First-last", "Turn clock", "Gentle"],
    );
    const quiet = {
      ...DEFAULT_MODS,
      freezeAfter: 0 as const,
      noRevenge: false,
      firstLast: false,
      turnClock: false,
    };
    expect(activeHouseRules(quiet)).toEqual([]);
    expect(
      activeHouseRules({
        ...quiet,
        fate: true,
        duel: true,
        shield: true,
        spareGift: true,
        mercy: true,
        coin: true,
        rotate: true,
      }),
    ).toEqual(["Fate", "Duel", "Shield", "Spare gift", "Mercy", "Coin", "Rotate"]);
  });
});
