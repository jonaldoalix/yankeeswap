import { describe, expect, it } from "vitest";
import {
  createGameState,
  liveTimer,
  museumDemoSeed,
  reduce,
  toSnapshot,
  VETO_MS,
  type GameAction,
  type ReduceResult,
} from "./game.js";
import { DEFAULT_MODS } from "./mods.js";
import type { GameState, Mods } from "./types.js";

function errorOf(result: ReduceResult): string {
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}

function ok(result: ReduceResult): GameState {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

const quiet: Mods = { ...DEFAULT_MODS, turnClock: false, firstLast: false };

function lobby(
  names: Array<[string, string, string]> = [
    ["a", "Ada", "socks"],
    ["b", "Bea", "mug"],
    ["c", "Cal", "tea"],
  ],
  mods: Mods = quiet,
): GameState {
  let state = createGameState({ joinCode: "YANK", mods });
  for (const [id, name, gift] of names) {
    state = ok(
      reduce(state, { type: "addPlayer", id, name, gift, giftId: `gift-${id}`, at: 1 }),
    );
  }
  return state;
}

const ROSTER: Record<string, [string, string, string]> = {
  a: ["a", "Ada", "socks"],
  b: ["b", "Bea", "mug"],
  c: ["c", "Cal", "tea"],
  d: ["d", "Dee", "jam"],
};

function started(order = ["a", "b", "c"], mods?: Mods): GameState {
  const names = order.map((id): [string, string, string] => ROSTER[id] ?? [id, id, `gift-${id}`]);
  const seated = lobby(names, mods ?? quiet);
  const assigned = ok(reduce(seated, { type: "assignOrder", playerIds: order, at: 2 }));
  return ok(reduce(assigned, { type: "startGame", now: 1_000, at: 3 }));
}

function allow(state: GameState, at: number): GameState {
  return ok(reduce(state, { type: "resolvePending", decision: "allow", at }));
}

function unwrap(state: GameState, playerId: string, now: number, giftId?: string): GameState {
  return allow(ok(reduce(state, { type: "unwrap", playerId, giftId, now, at: now })), now + 1);
}

function steal(state: GameState, playerId: string, targetId: string, now: number): GameState {
  return allow(ok(reduce(state, { type: "steal", playerId, targetId, now, at: now })), now + 1);
}

describe("createGameState + seed", () => {
  it("fills defaults and museum seats", () => {
    const blank = createGameState();
    expect(blank.phase).toBe("lobby");
    expect(blank.timer.durationSeconds).toBe(180);
    expect(blank.mods.freezeAfter).toBe(3);
    const seeded = museumDemoSeed("YANK", "Demo Swap", 120);
    expect(seeded.players).toHaveLength(6);
    expect(seeded.gifts).toHaveLength(6);
    expect(seeded.timer.durationSeconds).toBe(120);
    expect(seeded.events[0]?.message).toMatch(/Museum/);
  });
});

describe("signup and order", () => {
  it("validates player signup", () => {
    const base = createGameState();
    expect(errorOf(reduce(base, { type: "addPlayer", id: "a", name: "  ", gift: "x" }))).toMatch(
      /Name/,
    );
    expect(errorOf(reduce(base, { type: "addPlayer", id: "a", name: "Ada", gift: "" }))).toMatch(
      /Gift/,
    );
    const first = ok(reduce(base, { type: "addPlayer", id: "a", name: "Ada", gift: "socks" }));
    expect(
      errorOf(reduce(first, { type: "addPlayer", id: "b", name: "ada", gift: "mug" })),
    ).toMatch(/name/);
  });

  it("blocks adds after start and game over, and removes in lobby", () => {
    const play = started();
    expect(
      errorOf(reduce(play, { type: "addPlayer", id: "z", name: "Zed", gift: "jam" })),
    ).toMatch(/before the night/);
    const done = { ...play, phase: "done" as const };
    expect(
      errorOf(reduce(done, { type: "addPlayer", id: "z", name: "Zed", gift: "jam" })),
    ).toMatch(/over/);
    expect(errorOf(reduce(play, { type: "removePlayer", id: "a" }))).toMatch(/after the night/);

    const removed = ok(reduce(lobby(), { type: "removePlayer", id: "a", at: 4 }));
    expect(removed.players.map((p) => p.name)).toEqual(["Bea", "Cal"]);
    expect(removed.gifts.every((g) => g.broughtBy !== "a")).toBe(true);
    expect(errorOf(reduce(removed, { type: "removePlayer", id: "missing" }))).toMatch(/not found/);
  });

  it("shuffleOrder rejects an empty lobby", () => {
    expect(errorOf(reduce(createGameState(), { type: "shuffleOrder", seed: 1 }))).toMatch(/at least one/);
  });

  it("removePlayer filters that id out of an existing turn order", () => {
    const seated = lobby();
    const shuffled = ok(reduce(seated, { type: "shuffleOrder", seed: 7, at: 2 }));
    expect(shuffled.turnOrder).toContain("a");
    const removed = ok(reduce(shuffled, { type: "removePlayer", id: "a", at: 3 }));
    expect(removed.turnOrder).not.toContain("a");
  });

  it("shuffles, assigns, and starts", () => {
    expect(errorOf(reduce(createGameState(), { type: "shuffleOrder", seed: 1 }))).toMatch(
      /at least one/,
    );
    expect(errorOf(reduce(createGameState(), { type: "startGame", now: 1 }))).toMatch(
      /at least one/,
    );
    const seated = lobby();
    expect(
      errorOf(reduce(seated, { type: "assignOrder", playerIds: ["a", "b"] })),
    ).toMatch(/every seated/);
    expect(
      errorOf(reduce(seated, { type: "assignOrder", playerIds: ["a", "a", "b"] })),
    ).toMatch(/duplicate/);
    expect(
      errorOf(reduce(seated, { type: "assignOrder", playerIds: ["a", "b", "z"] })),
    ).toMatch(/unknown/);

    const shuffled = ok(reduce(seated, { type: "shuffleOrder", seed: 99, at: 2 }));
    expect(shuffled.turnOrder).toHaveLength(3);
    const auto = ok(reduce(lobby(), { type: "startGame", now: 50, at: 3 }));
    expect(auto.phase).toBe("play");
    expect(auto.actingId).toBe(auto.turnOrder[0]);
    expect(errorOf(reduce(auto, { type: "shuffleOrder", seed: 1 }))).toMatch(/locked/);
    expect(errorOf(reduce(auto, { type: "assignOrder", playerIds: auto.turnOrder }))).toMatch(
      /locked/,
    );
    expect(errorOf(reduce(auto, { type: "startGame", now: 9 }))).toMatch(/already started/);
  });
});

describe("unwrap, steal, veto", () => {
  it("queues unwrap, auto-allows, and vetoes", () => {
    const play = started();
    expect(errorOf(reduce(play, { type: "unwrap", playerId: "b", now: 10 }))).toMatch(
      /not your turn/,
    );
    expect(
      errorOf(reduce(play, { type: "unwrap", playerId: "a", giftId: "nope", now: 10 })),
    ).toMatch(/wrapped gift/);
    const queued = ok(reduce(play, { type: "unwrap", playerId: "a", now: 10, at: 10 }));
    expect(queued.pending?.kind).toBe("unwrap");
    expect(
      errorOf(reduce(queued, { type: "unwrap", playerId: "a", now: 11 })),
    ).toMatch(/waiting on the host/);
    const vetoed = ok(reduce(queued, { type: "resolvePending", decision: "veto", at: 12 }));
    expect(vetoed.pending).toBeNull();
    expect(vetoed.actingId).toBe("a");
    expect(errorOf(reduce(vetoed, { type: "resolvePending", decision: "allow" }))).toMatch(
      /waiting/,
    );

    const again = ok(reduce(vetoed, { type: "unwrap", playerId: "a", now: 13, at: 13 }));
    const opened = allow(again, 14);
    expect(opened.gifts.find((g) => g.holderId === "a")?.opened).toBe(true);
    expect(opened.actingId).toBe("b");
  });

  it("steals, chains, and freezes", () => {
    let state = unwrap(started(), "a", 10);
    state = unwrap(state, "b", 20);
    expect(errorOf(reduce(state, { type: "steal", playerId: "c", targetId: "c", now: 30 }))).toMatch(
      /cannot steal/,
    );
    state = steal(state, "c", "a", 30);
    expect(state.gifts.find((g) => g.label === "socks")?.holderId).toBe("c");
    expect(state.actingId).toBe("a");
    expect(state.chainLength).toBe(1);
    expect(errorOf(reduce(state, { type: "steal", playerId: "a", targetId: "c", now: 40 }))).toMatch(
      /cannot steal/,
    );
    state = unwrap(state, "a", 40, "gift-c");
    expect(state.phase).toBe("done");
  });

  it("respects freeze after two steals when set to 2", () => {
    const mods: Mods = { ...quiet, freezeAfter: 2, noRevenge: false };
    let state = unwrap(started(["a", "b", "c"], mods), "a", 10);
    state = steal(unwrap(state, "b", 20), "c", "a", 30);
    expect(state.gifts.find((g) => g.label === "socks")?.steals).toBe(1);
    state = steal(state, "a", "c", 40);
    expect(state.gifts.find((g) => g.label === "socks")?.frozen).toBe(true);
    expect(errorOf(reduce(state, { type: "steal", playerId: "c", targetId: "a", now: 50 }))).toMatch(
      /cannot steal/,
    );
  });
});

describe("mods", () => {
  it("gentle forbids stealing", () => {
    const state = unwrap(started(["a", "b"], { ...quiet, gentle: true }), "a", 10);
    expect(errorOf(reduce(state, { type: "steal", playerId: "b", targetId: "a", now: 20 }))).toMatch(
      /cannot steal/,
    );
  });

  it("chain cap stops a steal streak", () => {
    const mods: Mods = { ...quiet, chainCap: 2, noRevenge: false, firstLast: false };
    let state = unwrap(started(["a", "b", "c"], mods), "a", 10);
    state = unwrap(state, "b", 20);
    state = steal(state, "c", "a", 30);
    expect(state.chainLength).toBe(1);
    const nextSteal = reduce(state, { type: "steal", playerId: "a", targetId: "c", now: 40 });
    expect(nextSteal.ok).toBe(true);
    if (!nextSteal.ok) return;
    state = allow(nextSteal.state, 41);
    expect(state.chainLength).toBe(2);
    expect(
      errorOf(reduce(state, { type: "steal", playerId: "c", targetId: "a", now: 50 })),
    ).toMatch(/cannot steal/);
  });

  it("mercy protects the last victim", () => {
    const mods: Mods = { ...quiet, mercy: true, noRevenge: false };
    let state = unwrap(started(["a", "b", "c", "d"], mods), "a", 10);
    state = unwrap(state, "b", 20);
    state = steal(state, "c", "a", 30);
    expect(state.mercyProtectedId).toBe("a");
    state = unwrap(state, "a", 40);
    expect(state.actingId).toBe("d");
    expect(errorOf(reduce(state, { type: "steal", playerId: "d", targetId: "a", now: 50 }))).toMatch(
      /cannot steal/,
    );
  });

  it("first-last gives player one a closing steal or pass", () => {
    const mods: Mods = { ...quiet, firstLast: true };
    let state = unwrap(started(["a", "b"], mods), "a", 10);
    state = unwrap(state, "b", 20);
    expect(state.phase).toBe("closing");
    expect(state.actingId).toBe("a");
    expect(toSnapshot(state, "host", false, false, undefined, 21).actingMoves?.canPass).toBe(true);
    expect(errorOf(reduce(state, { type: "passClosing", playerId: "b" }))).toMatch(/not your turn/);
    const passed = ok(reduce(state, { type: "passClosing", playerId: "a", at: 30 }));
    expect(passed.phase).toBe("done");
    expect(errorOf(reduce(passed, { type: "passClosing", playerId: "a" }))).toMatch(/last steal/);

    state = unwrap(started(["a", "b"], mods), "a", 10);
    state = unwrap(state, "b", 20);
    state = steal(state, "a", "b", 30);
    expect(state.phase).toBe("done");
    expect(state.gifts.find((g) => g.label === "mug")?.holderId).toBe("a");
    expect(state.gifts.find((g) => g.label === "socks")?.holderId).toBe("b");
    expect(state.gifts.every((g) => g.holderId)).toBe(true);
    expect(state.events.some((event) => event.message.includes("traded the socks for Bea's mug"))).toBe(
      true,
    );
  });

  it("shield blocks a steal and is one-shot", () => {
    const mods: Mods = { ...quiet, shield: true };
    let state = unwrap(started(["a", "b"], mods), "a", 10);
    expect(errorOf(reduce(state, { type: "armShield", playerId: "missing" }))).toMatch(/not found/);
    expect(errorOf(reduce(state, { type: "armShield", playerId: "b" }))).toMatch(/need a gift/);
    state = ok(reduce(state, { type: "armShield", playerId: "a", at: 15 }));
    expect(errorOf(reduce(state, { type: "armShield", playerId: "a" }))).toMatch(/already used/);
    const off = started(["a", "b"], quiet);
    expect(errorOf(reduce(off, { type: "armShield", playerId: "a" }))).toMatch(/not on/);
    state = steal(state, "b", "a", 20);
    expect(state.gifts.find((g) => g.label === "socks")?.holderId).toBe("a");
    expect(state.players.find((p) => p.id === "a")?.shieldArmed).toBe(false);
  });

  it("spare gift and rotate", () => {
    expect(errorOf(reduce(started(), { type: "addSpare", id: "sp1", label: "jam" }))).toMatch(
      /not on/,
    );
    const mods: Mods = { ...quiet, spareGift: true, rotate: true };
    let state = started(["a", "b"], mods);
    expect(errorOf(reduce(state, { type: "addSpare", id: "sp1", label: "  " }))).toMatch(/label/);
    state = ok(reduce(state, { type: "addSpare", id: "sp1", label: "jam", at: 4 }));
    expect(state.gifts).toHaveLength(3);
    expect(
      toSnapshot(state, "spectator", false, false, undefined, 5).wrappedPile.some(
        (gift) => gift.broughtByName === "Spare",
      ),
    ).toBe(true);
    expect(
      unwrap(state, "a", 10, "sp1").events.some((event) => event.message.includes("spare gift — jam")),
    ).toBe(true);
    expect(errorOf(reduce({ ...state, phase: "done" }, { type: "addSpare", id: "sp2", label: "x" }))).toMatch(
      /closed/,
    );
    expect(errorOf(reduce(lobby(undefined, mods), { type: "rotate", direction: "left" }))).toMatch(
      /Nothing to rotate/,
    );
    state = unwrap(state, "a", 10);
    expect(errorOf(reduce(state, { type: "rotate", direction: "left" }))).toMatch(/two held/);
    state = unwrap(state, "b", 20);
    const left = ok(reduce(state, { type: "rotate", direction: "left", at: 30 }));
    expect(left.gifts.find((g) => g.label === "socks")?.holderId).toBe("b");
    const right = ok(reduce(left, { type: "rotate", direction: "right", at: 31 }));
    expect(right.gifts.find((g) => g.label === "socks")?.holderId).toBe("a");
    expect(reduce(right, { type: "rotate", direction: "left", at: 32 }).ok).toBe(true);
    const locked = started(["a", "b"], quiet);
    expect(errorOf(reduce(locked, { type: "rotate", direction: "left" }))).toMatch(/not on/);
  });

  it("coin tails forces unwrap; heads may steal", () => {
    const mods: Mods = { ...quiet, coin: true };
    let tails = started(["a", "b"], mods);
    tails = { ...tails, coin: "tails" };
    tails = unwrap(tails, "a", 10);
    tails = { ...tails, coin: "tails" };
    expect(errorOf(reduce(tails, { type: "steal", playerId: "b", targetId: "a", now: 20 }))).toMatch(
      /cannot steal/,
    );
    let heads = started(["a", "b"], mods);
    heads = unwrap({ ...heads, coin: "heads" }, "a", 10);
    heads = { ...heads, coin: "heads", actingId: "b" };
    expect(reduce(heads, { type: "steal", playerId: "b", targetId: "a", now: 20 }).ok).toBe(true);
  });

  it("fate unwrap, steal, swap-any, and pass", () => {
    const mods: Mods = { ...quiet, fate: true, rotate: true };
    let state = started(["a", "b"], mods);
    state = { ...state, fate: "unwrap" };
    expect(errorOf(reduce(state, { type: "steal", playerId: "a", targetId: "b", now: 10 }))).toMatch(
      /cannot steal/,
    );
    state = unwrap(state, "a", 10);
    state = { ...state, fate: "steal", actingId: "b" };
    expect(errorOf(reduce(state, { type: "unwrap", playerId: "b", now: 20 }))).toMatch(
      /cannot unwrap/,
    );
    state = steal(state, "b", "a", 20);
    expect(state.gifts.find((g) => g.label === "socks")?.holderId).toBe("b");

    let pass = unwrap({ ...started(["a", "b", "c"], mods), fate: "unwrap" }, "a", 10);
    pass = unwrap({ ...pass, fate: "unwrap" }, "b", 20);
    pass = { ...pass, fate: "pass-left", actingId: "c" };
    expect(errorOf(reduce(pass, { type: "unwrap", playerId: "c", now: 30 }))).toMatch(/cannot unwrap/);
    const rotated = ok(reduce(pass, { type: "rotate", direction: "left", at: 31 }));
    expect(rotated.phase === "play" || rotated.phase === "done" || rotated.actingId !== "b").toBe(
      true,
    );

    let swap = unwrap(
      { ...started(["a", "b"], { ...quiet, fate: true, freezeAfter: 2 }), fate: "unwrap" },
      "a",
      10,
    );
    swap = {
      ...swap,
      fate: "swap-any",
      actingId: "b",
      gifts: swap.gifts.map((g) => (g.holderId === "a" ? { ...g, frozen: true } : g)),
    };
    expect(reduce(swap, { type: "steal", playerId: "b", targetId: "a", now: 20 }).ok).toBe(true);
  });

  it("duel: waiting, tie, defender keep, actor steal, and gone gift", () => {
    const mods: Mods = { ...quiet, duel: true };
    let state = unwrap(started(["a", "b"], mods), "a", 10);
    const challenged = ok(reduce(state, { type: "steal", playerId: "b", targetId: "a", now: 20, at: 20 }));
    expect(challenged.duel?.actorId).toBe("b");
    expect(errorOf(reduce(challenged, { type: "duelPick", playerId: "c", pick: "rock", now: 21 }))).toMatch(
      /not in this duel/,
    );
    expect(errorOf(reduce(state, { type: "duelPick", playerId: "a", pick: "rock", now: 21 }))).toMatch(
      /No duel/,
    );
    const waiting = ok(
      reduce(challenged, { type: "duelPick", playerId: "b", pick: "rock", now: 21, at: 21 }),
    );
    expect(waiting.duel?.actorPick).toBe("rock");
    expect(
      errorOf(reduce(waiting, { type: "duelPick", playerId: "b", pick: "paper", now: 22 })),
    ).toMatch(/already picked/);
    const tied = ok(reduce(waiting, { type: "duelPick", playerId: "a", pick: "rock", now: 22, at: 22 }));
    expect(tied.duel?.actorPick).toBeNull();
    expect(tied.events.at(-1)?.message).toMatch(/Tie/);

    const again = ok(reduce(tied, { type: "duelPick", playerId: "b", pick: "rock", now: 23, at: 23 }));
    const defended = ok(
      reduce(again, { type: "duelPick", playerId: "a", pick: "paper", now: 24, at: 24 }),
    );
    expect(defended.duel).toBeNull();
    expect(defended.gifts.find((g) => g.label === "socks")?.holderId).toBe("a");

    const stealDuel = ok(
      reduce(tied, { type: "duelPick", playerId: "b", pick: "paper", now: 23, at: 23 }),
    );
    const won = ok(
      reduce(stealDuel, { type: "duelPick", playerId: "a", pick: "rock", now: 24, at: 24 }),
    );
    expect(won.pending?.kind).toBe("steal");

    const gone = {
      ...waiting,
      gifts: waiting.gifts.filter((g) => g.holderId !== "a"),
    };
    expect(
      errorOf(reduce(gone, { type: "duelPick", playerId: "a", pick: "scissors", now: 25 })),
    ).toMatch(/gone/);
  });
});

describe("timer, notes, settings, reset", () => {
  it("runs, pauses, resets, expires, and auto-allows a pending move", () => {
    const startedClock = ok(
      reduce(
        createGameState({
          timer: { durationSeconds: 10, remainingSeconds: 10, running: false, endsAt: null },
        }),
        { type: "startTimer", now: 1_000 },
      ),
    );
    expect(startedClock.timer.endsAt).toBe(11_000);
    const ticked = ok(reduce(startedClock, { type: "tickTimer", now: 6_000 }));
    expect(ticked.timer.remainingSeconds).toBe(5);
    const paused = ok(reduce(ticked, { type: "pauseTimer", now: 6_000 }));
    expect(paused.timer.running).toBe(false);
    const idle = ok(reduce(paused, { type: "tickTimer", now: 9_000 }));
    expect(idle.timer.running).toBe(false);
    const resumed = ok(reduce(paused, { type: "startTimer", now: 20_000 }));
    const expired = ok(reduce(resumed, { type: "tickTimer", now: 30_000 }));
    expect(expired.timer.remainingSeconds).toBe(0);
    expect(expired.events.at(-1)?.message).toMatch(/zero/);
    const fromZero = ok(reduce(expired, { type: "startTimer", now: 40_000 }));
    expect(fromZero.timer.remainingSeconds).toBe(10);
    const reset = ok(reduce(fromZero, { type: "resetTimer" }));
    expect(reset.timer.running).toBe(false);
    expect(
      errorOf(
        reduce(
          createGameState({
            timer: { durationSeconds: 0, remainingSeconds: 0, running: false, endsAt: null },
          }),
          { type: "startTimer", now: 1 },
        ),
      ),
    ).toMatch(/nothing left/);

    const play = started();
    const queued = ok(reduce(play, { type: "unwrap", playerId: "a", now: 100, at: 100 }));
    expect(queued.pending?.autoAt).toBe(100 + VETO_MS);
    const auto = ok(reduce(queued, { type: "tickTimer", now: 100 + VETO_MS }));
    expect(auto.gifts.find((g) => g.holderId === "a")?.opened).toBe(true);

    const timed = started(["a", "b"], { ...quiet, turnClock: true });
    expect(timed.timer.running).toBe(true);
    const skip = ok(reduce(timed, { type: "tickTimer", now: timed.timer.endsAt! + 1 }));
    expect(skip.actingId).toBe("b");
  });

  it("auto-unwraps when the turn clock hits zero", () => {
    let state = started(["a", "b"], { ...quiet, turnClock: true });
    state = {
      ...state,
      timer: { ...state.timer, running: true, remainingSeconds: 1, endsAt: 5_000 },
    };
    const fired = ok(reduce(state, { type: "tickTimer", now: 5_001 }));
    expect(fired.gifts.some((g) => g.opened)).toBe(true);
  });

  it("notes, patches settings, and trims the log", () => {
    expect(errorOf(reduce(createGameState(), { type: "note", message: "  " }))).toMatch(/Note/);
    const noted = ok(reduce(createGameState(), { type: "note", message: "Ellis out first.", at: 3 }));
    expect(noted.events.at(-1)?.message).toBe("Ellis out first.");

    expect(
      errorOf(
        reduce(createGameState(), {
          type: "patchSettings",
          patch: { eventLabel: " ", timerSeconds: 180, mods: quiet },
        }),
      ),
    ).toMatch(/label/);
    expect(
      errorOf(
        reduce(createGameState(), {
          type: "patchSettings",
          patch: { eventLabel: "Party", timerSeconds: 5, mods: quiet },
        }),
      ),
    ).toMatch(/Timer/);
    expect(
      errorOf(
        reduce(createGameState(), {
          type: "patchSettings",
          patch: {
            eventLabel: "Party",
            timerSeconds: 30,
            mods: { ...quiet, freezeAfter: 1 as Mods["freezeAfter"] },
          },
        }),
      ),
    ).toMatch(/Freeze/);
    expect(
      errorOf(
        reduce(createGameState(), {
          type: "patchSettings",
          patch: {
            eventLabel: "Party",
            timerSeconds: 30,
            mods: { ...quiet, chainCap: 5 as Mods["chainCap"] },
          },
        }),
      ),
    ).toMatch(/Chain cap/);

    const patched = ok(
      reduce(createGameState(), {
        type: "patchSettings",
        patch: { eventLabel: "White Elephant", timerSeconds: 90, mods: { ...quiet, shield: true } },
      }),
    );
    expect(patched.eventLabel).toBe("White Elephant");
    expect(patched.mods.shield).toBe(true);
    const seated = ok(reduce(patched, { type: "addPlayer", id: "a", name: "Ada", gift: "socks" }));
    expect(seated.players[0]?.shieldAvailable).toBe(true);
    const running = ok(reduce(seated, { type: "startTimer", now: 1_000 }));
    const whileRunning = ok(
      reduce(running, {
        type: "patchSettings",
        patch: { eventLabel: "Still going", timerSeconds: 120, mods: running.mods },
      }),
    );
    expect(whileRunning.timer.running).toBe(true);
    expect(whileRunning.timer.durationSeconds).toBe(120);

    const play = started();
    expect(
      errorOf(
        reduce(play, {
          type: "patchSettings",
          patch: { eventLabel: "Nope", timerSeconds: 30, mods: { ...quiet, gentle: true } },
        }),
      ),
    ).toMatch(/lock/);

    let logged = createGameState();
    for (let i = 0; i < 81; i += 1) {
      logged = ok(reduce(logged, { type: "note", message: `note ${i}`, at: i }));
    }
    expect(logged.events).toHaveLength(80);
    expect(logged.events[0]?.message).toBe("note 1");
  });

  it("resets the table and rejects unknown actions", () => {
    const state = lobby();
    const reset = ok(reduce(state, { type: "reset" }));
    expect(reset.players).toHaveLength(0);
    expect(reset.joinCode).toBe("YANK");
    const unknown = reduce(state, { type: "nope" } as unknown as GameAction);
    expect(unknown.ok).toBe(false);
  });
});

describe("snapshots + live timer", () => {
  it("hides wrapped labels, gates clerk, and shows the acting seat", () => {
    const state = lobby();
    const host = toSnapshot(state, "host", true, false, undefined, 10, false);
    expect(host.players[0]?.giftLabel).toBe("—");
    expect(host.wrappedPile.map((gift) => gift.broughtByName)).toEqual(["Ada", "Bea", "Cal"]);
    expect(host.clerk).toBeNull();
    expect(host.clerkOpen).toBe(false);

    const clerk = toSnapshot(state, "host", true, false, undefined, 10, true);
    expect(clerk.clerkOpen).toBe(true);
    expect(clerk.clerk?.gifts[0]?.label).toBe("Wrapped");

    const player = toSnapshot(state, "player", false, true, "a", 10);
    expect(player.you?.gift).toBe("socks");
    expect(player.you?.giftPublic).toBe(false);
    expect(player.you?.holding).toBeNull();

    const play = unwrap(started(), "a", 10);
    const ada = toSnapshot(play, "player", false, false, "a", 20);
    expect(ada.you?.gift).toBe("socks");
    expect(ada.you?.giftPublic).toBe(true);
    expect(ada.you?.holding).toBe("socks");
    expect(ada.you?.broughtHolder).toBe("Ada");
    const stolen = steal(play, "b", "a", 20);
    const robbed = toSnapshot(stolen, "player", false, false, "a", 30);
    expect(robbed.you?.gift).toBe("socks");
    expect(robbed.you?.holding).toBeNull();
    expect(robbed.you?.broughtHolder).toBe("Bea");
    expect(toSnapshot(stolen, "player", false, false, "b", 30).you?.holding).toBe("socks");
    const room = toSnapshot(play, "spectator", false, false, undefined, 20);
    expect(room.giftsRevealed).toBe(true);
    expect(room.players.find((p) => p.id === "a")?.giftLabel).toBe("socks");
    expect(room.actingName).toBe("Bea");

    const pending = ok(reduce(started(), { type: "unwrap", playerId: "a", now: 50, at: 50 }));
    const snap = toSnapshot(pending, "host", false, false, "a", 50, true);
    expect(snap.pending?.kind).toBe("unwrap");
    expect(snap.pending?.autoInSeconds).toBe(VETO_MS / 1000);
    expect(snap.you?.isActing).toBe(true);
    expect(snap.you?.canUnwrap).toBe(false);
  });

  it("freezes a running timer with a missing deadline", () => {
    const frozen = liveTimer({
      durationSeconds: 30,
      remainingSeconds: 12,
      running: true,
      endsAt: null,
    });
    expect(frozen.running).toBe(false);
    expect(frozen.endsAt).toBeNull();
  });
});

describe("edge coverage", () => {
  it("rejects a steal with no target on the pending record", () => {
    const play = started();
    const queued = ok(reduce(play, { type: "unwrap", playerId: "a", now: 10, at: 10 }));
    const broken = {
      ...queued,
      pending: { ...queued.pending!, kind: "steal" as const, targetId: undefined },
    };
    expect(errorOf(reduce(broken, { type: "resolvePending", decision: "allow", at: 11 }))).toMatch(
      /missing a target/,
    );
    const missingGift = {
      ...queued,
      pending: { ...queued.pending!, giftId: "gone" },
    };
    expect(errorOf(reduce(missingGift, { type: "resolvePending", decision: "allow", at: 11 }))).toMatch(
      /gone/,
    );
    expect(toSnapshot(missingGift, "host", false, false, undefined, 11).pending?.targetName).toBeUndefined();
    expect(toSnapshot(broken, "host", false, false, undefined, 11).pending?.targetName).toBeUndefined();
  });

  it("advances when the clock expires and nobody can unwrap", () => {
    let state = unwrap(started(["a", "b"], { ...quiet, turnClock: true }), "a", 10);
    state = {
      ...state,
      gifts: state.gifts.map((g) => ({ ...g, opened: true, holderId: g.holderId ?? "a" })),
      timer: { durationSeconds: 10, remainingSeconds: 0, running: true, endsAt: 1 },
    };
    const next = ok(reduce(state, { type: "tickTimer", now: 2 }));
    expect(next.phase === "done" || next.actingId !== state.actingId).toBe(true);
  });

  it("expires a pending move after the timer itself hits zero", () => {
    const play = started(["a", "b"], { ...quiet, turnClock: true });
    const queued = ok(reduce(play, { type: "unwrap", playerId: "a", now: 10, at: 10 }));
    const racing = {
      ...queued,
      timer: { durationSeconds: 10, remainingSeconds: 1, running: true, endsAt: 20 },
      pending: { ...queued.pending!, autoAt: 50 },
    };
    const fired = ok(reduce(racing, { type: "tickTimer", now: 20 }));
    expect(fired.gifts.some((g) => g.opened) || fired.pending === null).toBe(true);
  });

  it("blocks play while a duel is open", () => {
    const mods: Mods = { ...quiet, duel: true };
    const state = unwrap(started(["a", "b"], mods), "a", 10);
    const duel = ok(reduce(state, { type: "steal", playerId: "b", targetId: "a", now: 20, at: 20 }));
    expect(errorOf(reduce(duel, { type: "unwrap", playerId: "b", now: 21 }))).toMatch(
      /rock-paper-scissors/,
    );
  });

  it("lets the host record unwrap and steal for whoever is up", () => {
    const play = started(["a", "b"]);
    const queued = ok(reduce(play, { type: "unwrap", playerId: "a", now: 10, at: 10 }));
    expect(toSnapshot(queued, "host", false, false, undefined, 11).actingMoves).toBeNull();
    expect(toSnapshot(play, "host", false, false, undefined, 10).actingMoves?.name).toBe("Ada");
    expect(
      toSnapshot({ ...play, phase: "done" }, "host", false, false, undefined, 10).actingMoves,
    ).toBeNull();
    expect(toSnapshot(lobby(), "host", false, false, undefined, 10).actingMoves).toBeNull();
    const recorded = ok(
      reduce(play, {
        type: "unwrap",
        playerId: "a",
        giftId: "gift-b",
        now: 10,
        at: 10,
        fromHost: true,
      }),
    );
    expect(recorded.pending).toBeNull();
    expect(recorded.gifts.find((g) => g.id === "gift-b")?.holderId).toBe("a");
    expect(recorded.gifts.find((g) => g.id === "gift-b")?.opened).toBe(true);
    expect(recorded.events.some((event) => event.message.includes("Bea's gift — mug"))).toBe(true);
    expect(toSnapshot(play, "host", false, false, undefined, 10).actingMoves?.unwrapTargets).toEqual(
      [
        { id: "gift-a", broughtByName: "Ada" },
        { id: "gift-b", broughtByName: "Bea" },
      ],
    );
    const host = toSnapshot(recorded, "host", false, false, undefined, 20);
    expect(host.actingMoves?.name).toBe("Bea");
    expect(host.actingMoves?.stealTargets.some((target) => target.name === "Ada")).toBe(true);
    expect(toSnapshot(recorded, "spectator", false, false, undefined, 20).actingMoves).toBeNull();
    const fateLeft = { ...recorded, fate: "pass-left" as const, mods: { ...recorded.mods, fate: true } };
    expect(toSnapshot(fateLeft, "host", false, false, undefined, 21).actingMoves?.rotate).toBe("left");
    expect(
      toSnapshot(
        { ...recorded, fate: "pass-right", mods: { ...recorded.mods, fate: true } },
        "host",
        false,
        false,
        undefined,
        21,
      ).actingMoves?.rotate,
    ).toBe("right");
    const stolen = ok(
      reduce(recorded, {
        type: "steal",
        playerId: "b",
        targetId: "a",
        now: 20,
        at: 20,
        fromHost: true,
      }),
    );
    expect(stolen.gifts.find((g) => g.label === "mug")?.holderId).toBe("b");
    const dueling = started(["a", "b"], { ...quiet, duel: true });
    const opened = ok(
      reduce(dueling, { type: "unwrap", playerId: "a", now: 10, at: 10, fromHost: true }),
    );
    expect(opened.events.some((event) => event.message.includes("their own gift — socks"))).toBe(true);
    const skipped = ok(
      reduce(opened, {
        type: "steal",
        playerId: "b",
        targetId: "a",
        now: 20,
        at: 20,
        fromHost: true,
      }),
    );
    expect(skipped.duel).toBeNull();
    expect(skipped.gifts.find((g) => g.label === "socks")?.holderId).toBe("b");
  });

  it("rolls fate and coin when those mods are on", () => {
    const mods: Mods = { ...quiet, fate: true, coin: true, turnClock: true };
    const state = started(["a", "b"], mods);
    expect(state.fate).toBeTruthy();
    expect(state.coin === "heads" || state.coin === "tails").toBe(true);
    expect(state.timer.running).toBe(true);
  });

  it("covers leftover branches: lobby unwrap, steal fallthrough, duel scissors, clerk, names", () => {
    expect(errorOf(reduce(lobby(), { type: "unwrap", playerId: "a", now: 1 }))).toMatch(/not in play/);
    expect(errorOf(reduce(started(), { type: "steal", playerId: "b", targetId: "a", now: 1 }))).toMatch(
      /not your turn/,
    );

    const faces = new Set<string>();
    for (let seed = 1; seed < 40; seed += 1) {
      const seated = lobby(
        [
          ["a", "Ada", "socks"],
          ["b", "Bea", "mug"],
        ],
        { ...quiet, coin: true },
      );
      const begun = ok(reduce(seated, { type: "startGame", now: seed, at: seed }));
      if (begun.coin) faces.add(begun.coin);
    }
    expect(faces.has("heads")).toBe(true);
    expect(faces.has("tails")).toBe(true);

    let frozen = unwrap(started(["a", "b"], { ...quiet, firstLast: false }), "a", 10);
    frozen = {
      ...frozen,
      gifts: frozen.gifts.map((g) =>
        g.broughtBy === "b" ? { ...g, opened: true, holderId: "b", frozen: true } : g,
      ),
    };
    const lastSteal = steal(frozen, "b", "a", 20);
    expect(lastSteal.actingId).not.toBe("b");
    expect(lastSteal.gifts.find((g) => g.label === "socks")?.holderId).toBe("b");
    expect(lastSteal.gifts.find((g) => g.label === "mug")?.holderId).toBe("a");

    let stranded = unwrap(started(["a", "b"], { ...quiet, firstLast: false }), "a", 10);
    stranded = {
      ...stranded,
      gifts: stranded.gifts.map((g) =>
        g.broughtBy === "b" ? { ...g, opened: true, holderId: null } : g,
      ),
    };
    const noChain = steal(stranded, "b", "a", 20);
    expect(noChain.actingId).not.toBe("b");
    expect(noChain.gifts.find((g) => g.label === "socks")?.holderId).toBe("b");

    const mods: Mods = { ...quiet, duel: true, firstLast: true };
    let duelState = unwrap(started(["a", "b"], mods), "a", 10);
    duelState = unwrap(duelState, "b", 20);
    expect(duelState.phase).toBe("closing");
    const challenged = ok(
      reduce(duelState, { type: "steal", playerId: "a", targetId: "b", now: 30, at: 30 }),
    );
    const targetFirst = ok(
      reduce(challenged, { type: "duelPick", playerId: "b", pick: "paper", now: 31, at: 31 }),
    );
    expect(
      errorOf(reduce(targetFirst, { type: "duelPick", playerId: "b", pick: "rock", now: 32 })),
    ).toMatch(/already picked/);
    const scissors = ok(
      reduce(challenged, { type: "duelPick", playerId: "a", pick: "scissors", now: 31, at: 31 }),
    );
    const defended = ok(
      reduce(scissors, { type: "duelPick", playerId: "b", pick: "rock", now: 32, at: 32 }),
    );
    expect(defended.phase).toBe("done");

    const play = started();
    const sameMods = ok(
      reduce(play, {
        type: "patchSettings",
        patch: { eventLabel: "Still Yankee", timerSeconds: 30, mods: play.mods },
      }),
    );
    expect(sameMods.eventLabel).toBe("Still Yankee");

    const acting = toSnapshot(play, "player", false, false, "a", 10);
    expect(acting.you?.canUnwrap).toBe(true);
    const after = unwrap(play, "a", 10);
    const thief = toSnapshot(after, "player", false, false, "b", 20);
    expect(thief.you?.canSteal).toBe(true);

    const ghost = toSnapshot({ ...play, actingId: "ghost" }, "spectator", false, false, undefined, 10);
    expect(ghost.actingName).toBe("Someone");
    const stranger = toSnapshot(
      { ...play, players: [...play.players, { id: "z", name: "Zed", shieldAvailable: false, shieldArmed: false }] },
      "host",
      false,
      false,
      undefined,
      10,
      true,
    );
    expect(stranger.players.find((p) => p.id === "z")?.turn).toBeNull();

    const wrappedHeld = toSnapshot(
      {
        ...play,
        gifts: play.gifts.map((g) => (g.broughtBy === "a" ? { ...g, holderId: "a", opened: false } : g)),
      },
      "spectator",
      false,
      false,
      undefined,
      10,
    );
    expect(wrappedHeld.players.find((p) => p.id === "a")?.giftLabel).toBe("Wrapped");

    const openedClerk = toSnapshot(after, "host", false, false, undefined, 20, true);
    expect(openedClerk.clerk?.gifts.some((g) => g.label === "socks")).toBe(true);
    expect(openedClerk.clerk?.gifts.some((g) => g.holderName === "Ada")).toBe(true);

    const orphan = toSnapshot(play, "player", false, false, "a", 10);
    expect(orphan.you?.gift).toBe("socks");
    const noGift = toSnapshot(
      { ...play, gifts: [] },
      "player",
      false,
      false,
      "a",
      10,
    );
    expect(noGift.you?.gift).toBeNull();

    const duelSnap = toSnapshot(challenged, "player", false, false, "a", 30);
    expect(duelSnap.duel?.youNeedPick).toBe(true);
    const duelTarget = toSnapshot(challenged, "player", false, false, "b", 30);
    expect(duelTarget.duel?.youNeedPick).toBe(true);
    const duelWatch = toSnapshot(challenged, "spectator", false, false, undefined, 30);
    expect(duelWatch.duel?.youNeedPick).toBe(false);
    expect(toSnapshot(challenged, "host", false, false, undefined, 30).actingMoves).toBeNull();
    expect(duelSnap.you?.canUnwrap).toBe(false);
    expect(duelSnap.you?.canSteal).toBe(false);

    const missingGift = {
      ...started(),
      gifts: [],
      actingId: "a",
      phase: "play" as const,
    };
    expect(errorOf(reduce(missingGift, { type: "steal", playerId: "a", targetId: "b", now: 1 }))).toMatch(
      /cannot steal/,
    );
  });
});
