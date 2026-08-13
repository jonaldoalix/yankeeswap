import { afterEach, describe, expect, it, vi } from "vitest";
import { GameStore } from "./store.js";
import { testConfig } from "./testConfig.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("GameStore", () => {
  it("seeds a museum table and resets player sessions", () => {
    const store = new GameStore(
      testConfig({ museumMode: true, seedMuseumDemo: true, joinCode: "YANK" }),
    );
    expect(store.state.players).toHaveLength(6);
    const joined = store.joinPlayer({
      joinCode: "yank",
      name: "Guest",
      gift: "candy",
    });
    expect(joined.ok).toBe(true);
    expect(store.sessions.size).toBe(1);
    store.resetTable();
    expect(store.state.players).toHaveLength(6);
    expect(store.sessions.size).toBe(0);
    store.close();
  });

  it("claims host, seats players, and rejects bad pins/codes", () => {
    const store = new GameStore(testConfig({ hostPin: "1224" }));
    expect(store.claimHost("nope").ok).toBe(false);
    const host = store.claimHost("1224");
    expect(host.ok).toBe(true);
    if (!host.ok) return;
    expect(store.getSession(host.session.token)?.role).toBe("host");
    expect(store.getSession(undefined)).toBeUndefined();

    expect(store.getSession("")).toBeUndefined();
    expect(store.joinPlayer({ joinCode: "NOPE", name: "Ada", gift: "x" }).ok).toBe(false);
    expect(store.joinPlayer({ joinCode: "YANK", name: "Ada", gift: "socks" }).ok).toBe(true);
    expect(store.joinPlayer({ joinCode: "YANK", name: "Ada", gift: "socks" }).ok).toBe(false);
    expect(store.spectate("NOPE").ok).toBe(false);
    const watched = store.spectate("yank");
    expect(watched.ok).toBe(true);

    const seated = store.seatPlayer({ name: "Bea", gift: "mug" });
    expect(seated.ok).toBe(true);
    expect(store.publicConfig().playerCount).toBe(2);
    expect(store.publicConfig().phase).toBe("lobby");
    expect(store.snapshot(host.session).role).toBe("host");
    expect(store.snapshot(host.session).clerkOpen).toBe(false);
    const opened = store.setClerk(host.session, true);
    expect(opened.clerkOpen).toBe(true);
    store.close();
  });

  it("ticks a running timer on the clock", () => {
    vi.useFakeTimers();
    let now = 1_000;
    const store = new GameStore(
      testConfig({
        timerSeconds: 10,
      }),
      () => now,
    );
    store.seatPlayer({ name: "Ada", gift: "socks" });
    store.apply({ type: "startTimer", now });
    store.startClock();
    now = 20_000;
    vi.advanceTimersByTime(250);
    expect(store.state.timer.running).toBe(false);
    expect(store.state.timer.remainingSeconds).toBe(0);
    store.close();
  });

  it("resets a live table without museum seed", () => {
    const store = new GameStore(testConfig());
    store.seatPlayer({ name: "Ada", gift: "socks" });
    const player = store.joinPlayer({
      joinCode: "YANK",
      name: "Bea",
      gift: "mug",
    });
    expect(player.ok).toBe(true);
    store.resetTable();
    expect(store.state.players).toHaveLength(0);
    expect([...store.sessions.values()].every((s) => s.role !== "player")).toBe(true);
    store.close();
  });
});
