import { describe, expect, it } from "vitest";
import { liveCue, type LiveCueInput } from "./status.js";

const base: LiveCueInput = {
  role: "spectator",
  phase: "play",
  playerCount: 6,
  actingName: "Mara",
  nextName: "Theo",
  youName: null,
  youActing: false,
  chainLength: 0,
  firstLast: true,
  pending: null,
  duel: null,
  fate: null,
  coin: null,
  canUnwrap: true,
  canSteal: false,
};

describe("liveCue", () => {
  it("tells each seat what lobby is waiting on", () => {
    const empty = { ...base, phase: "lobby" as const, playerCount: 0, actingName: null, nextName: null };
    expect(liveCue({ ...empty, role: "host" })).toMatchObject({
      title: "Sign up",
      now: "Waiting for people to sit.",
      next: "They join from their phones.",
    });
    expect(liveCue({ ...empty, role: "host", playerCount: 6 }).next).toMatch(/Shuffle/);
    expect(liveCue({ ...empty, role: "player" }).now).toMatch(/You're in/);
    expect(liveCue({ ...empty, role: "spectator", playerCount: 6 }).now).toMatch(/6 seated/);
  });

  it("names whose turn it is and who follows", () => {
    const room = liveCue(base);
    expect(room.title).toBe("Mara's turn");
    expect(room.now).toBe("Mara takes a wrapped gift from the pile.");
    expect(room.next).toBe("Theo is after that.");

    const yours = liveCue({ ...base, role: "player", youName: "Mara", youActing: true });
    expect(yours.title).toBe("Your turn");
    expect(yours.now).toBe("Take a wrapped gift from the pile.");

    expect(liveCue({ ...base, canSteal: true }).now).toBe("Mara takes from the pile or steals.");
    expect(liveCue({ ...base, canUnwrap: false, canSteal: true }).now).toBe("Mara steals.");
    expect(
      liveCue({
        ...base,
        role: "player",
        youName: "Mara",
        youActing: true,
        canSteal: true,
      }).now,
    ).toMatch(/or steal one that's open/);
    expect(
      liveCue({
        ...base,
        role: "player",
        youName: "Mara",
        youActing: true,
        canUnwrap: false,
        canSteal: true,
      }).now,
    ).toBe("Steal an opened gift.");
  });

  it("says when someone was just stolen from", () => {
    const cue = liveCue({ ...base, chainLength: 1, actingName: "Theo", youActing: false });
    expect(cue.now).toMatch(/stolen from/);
    const yours = liveCue({
      ...base,
      role: "player",
      youName: "Theo",
      actingName: "Theo",
      youActing: true,
      chainLength: 1,
    });
    expect(yours.now).toMatch(/They took yours/);
  });

  it("covers pending, duel, closing, and picture time", () => {
    expect(
      liveCue({
        ...base,
        role: "host",
        pending: { kind: "steal", actorName: "Mara", targetName: "Theo", autoInSeconds: 8 },
      }).next,
    ).toMatch(/unless you stop it/);
    expect(
      liveCue({
        ...base,
        role: "player",
        youName: "Mara",
        pending: { kind: "steal", actorName: "Mara", autoInSeconds: 3 },
      }).now,
    ).toMatch(/are taking a gift/);
    expect(
      liveCue({
        ...base,
        pending: { kind: "unwrap", actorName: "Mara", autoInSeconds: 5 },
        actingName: null,
      }).title,
    ).toBe("Hold on");
    expect(
      liveCue({
        ...base,
        role: "player",
        youName: "Mara",
        pending: { kind: "unwrap", actorName: "Mara", autoInSeconds: 5 },
      }).now,
    ).toMatch(/wrapped gift from the pile/);
    expect(
      liveCue({
        ...base,
        pending: { kind: "unwrap", actorName: "Mara", targetName: "Phillis", autoInSeconds: 5 },
      }).now,
    ).toMatch(/Phillis's gift/);
    expect(
      liveCue({
        ...base,
        duel: { actorName: "Mara", targetName: "Theo", youNeedPick: true },
        youName: "Mara",
      }).now,
    ).toMatch(/Your throw vs Theo/);
    expect(
      liveCue({
        ...base,
        duel: { actorName: "Mara", targetName: "Theo", youNeedPick: true },
        youName: "Theo",
      }).now,
    ).toMatch(/Your throw vs Mara/);
    expect(
      liveCue({
        ...base,
        duel: { actorName: "Mara", targetName: "Theo", youNeedPick: false },
      }).title,
    ).toBe("Rock-paper-scissors");
    expect(liveCue({ ...base, phase: "closing", nextName: null }).now).toMatch(/trade for one opened gift/);
    expect(
      liveCue({
        ...base,
        phase: "closing",
        role: "player",
        youName: "Mara",
        youActing: true,
      }).now,
    ).toMatch(/keep what you have/);
    expect(liveCue({ ...base, phase: "closing", actingName: null }).title).toBe("Last steal");
    expect(liveCue({ ...base, phase: "done", role: "host" }).next).toMatch(/Reset/);
    expect(liveCue({ ...base, phase: "done", role: "spectator" }).next).toMatch(/Hold up/);
  });

  it("uses fate and coin in plain language", () => {
    expect(liveCue({ ...base, fate: "pass-left" }).now).toMatch(/left/);
    expect(
      liveCue({ ...base, youActing: true, youName: "Mara", fate: "pass-left" }).now,
    ).toMatch(/seat left/);
    expect(liveCue({ ...base, fate: "pass-right" }).now).toMatch(/right/);
    expect(
      liveCue({ ...base, youActing: true, youName: "Mara", fate: "pass-right" }).now,
    ).toMatch(/seat right/);
    expect(liveCue({ ...base, coin: "tails" }).now).toMatch(/from the pile/);
    expect(
      liveCue({ ...base, youActing: true, youName: "Mara", fate: "unwrap" }).now,
    ).toMatch(/from the pile/);
    expect(liveCue({ ...base, fate: "swap-any", canSteal: true }).now).toMatch(/steals/);
    expect(
      liveCue({ ...base, youActing: true, youName: "Mara", fate: "steal", canSteal: true }).now,
    ).toMatch(/Steal/);
    expect(liveCue({ ...base, coin: "heads", canSteal: true }).now).toMatch(/Heads/);
    expect(
      liveCue({ ...base, youActing: true, youName: "Mara", coin: "heads", canSteal: true }).now,
    ).toMatch(/Heads/);
    expect(liveCue({ ...base, actingName: null, nextName: null }).title).toBe("Take from the pile");
    expect(liveCue({ ...base, canUnwrap: false, canSteal: false }).now).toBe("Mara waits.");
    expect(
      liveCue({
        ...base,
        youActing: true,
        youName: "Mara",
        canUnwrap: false,
        canSteal: false,
      }).now,
    ).toBe("Wait.");
    expect(liveCue({ ...base, fate: "steal" }).now).toMatch(/from the pile/);
    expect(liveCue({ ...base, nextName: null }).next).toMatch(/steal once more/);
    expect(liveCue({ ...base, nextName: null, firstLast: false }).next).toMatch(/pile closes/);
    expect(
      liveCue({
        ...base,
        phase: "lobby",
        role: "spectator",
        playerCount: 0,
        actingName: null,
        nextName: null,
      }).now,
    ).toMatch(/Join on a phone/);
  });
});
