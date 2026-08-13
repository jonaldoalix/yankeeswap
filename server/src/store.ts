import { createId, createToken } from "../../shared/ids.js";
import {
  createGameState,
  museumDemoSeed,
  reduce,
  toSnapshot,
  type ReduceResult,
} from "../../shared/game.js";
import { DEFAULT_MODS } from "../../shared/mods.js";
import type { GameAction } from "../../shared/game.js";
import type {
  ClientRole,
  GameSnapshot,
  GameState,
  PublicConfig,
  SessionInfo,
} from "../../shared/types.js";
import type { AppConfig } from "./config.js";
import { EventBus } from "./bus.js";

export interface StoredSession {
  token: string;
  role: ClientRole;
  playerId?: string;
  clerkOpen?: boolean;
}

export class GameStore {
  state: GameState;
  readonly bus = new EventBus();
  readonly sessions = new Map<string, StoredSession>();
  private clock: ReturnType<typeof setInterval> | null = null;
  private readonly nowFn: () => number;

  constructor(
    private readonly config: AppConfig,
    nowFn: () => number = () => Date.now(),
  ) {
    this.nowFn = nowFn;
    this.state = config.seedMuseumDemo
      ? museumDemoSeed(config.joinCode, config.eventLabel, config.timerSeconds)
      : createGameState({
          eventLabel: config.eventLabel,
          joinCode: config.joinCode,
          mods: { ...DEFAULT_MODS },
          timer: {
            durationSeconds: config.timerSeconds,
            remainingSeconds: config.timerSeconds,
            running: false,
            endsAt: null,
          },
        });
  }

  publicConfig(): PublicConfig {
    return {
      museumMode: this.config.museumMode,
      eventLabel: this.state.eventLabel,
      joinCode: this.state.joinCode,
      timerSeconds: this.state.timer.durationSeconds,
      hostPinRequired: this.config.hostPin.length > 0,
      playerCount: this.state.players.length,
      phase: this.state.phase,
      gameStarted: this.state.phase !== "lobby",
      gameOver: this.state.phase === "done",
    };
  }

  snapshot(session: StoredSession, now = this.nowFn()): GameSnapshot {
    return toSnapshot(
      this.state,
      session.role,
      this.config.museumMode,
      this.config.hostPin.length > 0,
      session.playerId,
      now,
      Boolean(session.clerkOpen),
    );
  }

  apply(action: GameAction): ReduceResult {
    const result = reduce(this.state, action);
    if (!result.ok) return result;
    this.state = result.state;
    if (result.startClock) this.startClock();
    if (result.stopClock) this.stopClock();
    this.publish();
    return result;
  }

  publish(): void {
    this.bus.emit("state", { at: this.nowFn() });
  }

  startClock(): void {
    if (this.clock) return;
    this.clock = setInterval(() => {
      this.apply({ type: "tickTimer", now: this.nowFn() });
    }, 250);
  }

  stopClock(): void {
    if (!this.clock) return;
    clearInterval(this.clock);
    this.clock = null;
  }

  close(): void {
    this.stopClock();
  }

  claimHost(pin: string | undefined): { ok: true; session: SessionInfo } | { ok: false; error: string } {
    if (this.config.hostPin && pin !== this.config.hostPin) {
      return { ok: false, error: "Host PIN does not match." };
    }
    return { ok: true, session: this.createSession("host") };
  }

  setClerk(session: StoredSession, open: boolean): GameSnapshot {
    session.clerkOpen = open;
    this.sessions.set(session.token, session);
    this.publish();
    return this.snapshot(session);
  }

  seatPlayer(input: { name: string; gift: string }): ReduceResult {
    return this.apply({
      type: "addPlayer",
      id: createId("pl"),
      name: input.name,
      gift: input.gift,
    });
  }

  joinPlayer(input: {
    joinCode: string;
    name: string;
    gift: string;
  }): { ok: true; session: SessionInfo } | { ok: false; error: string } {
    if (input.joinCode.trim().toUpperCase() !== this.state.joinCode) {
      return { ok: false, error: "Join code does not match." };
    }
    const id = createId("pl");
    const added = this.apply({
      type: "addPlayer",
      id,
      name: input.name,
      gift: input.gift,
      giftId: `gift-${id}`,
    });
    if (!added.ok) return added;
    return { ok: true, session: this.createSession("player", id) };
  }

  spectate(
    joinCode: string,
  ): { ok: true; session: SessionInfo } | { ok: false; error: string } {
    if (joinCode.trim().toUpperCase() !== this.state.joinCode) {
      return { ok: false, error: "Join code does not match." };
    }
    return { ok: true, session: this.createSession("spectator") };
  }

  getSession(token: string | undefined): StoredSession | undefined {
    if (!token) return undefined;
    return this.sessions.get(token);
  }

  resetTable(): ReduceResult {
    this.apply({ type: "reset" });
    for (const [token, session] of this.sessions) {
      if (session.role === "player") this.sessions.delete(token);
    }
    if (this.config.seedMuseumDemo) {
      this.state = museumDemoSeed(
        this.config.joinCode,
        this.state.eventLabel,
        this.state.timer.durationSeconds,
      );
      this.publish();
    }
    return { ok: true, state: this.state, stopClock: true };
  }

  private createSession(role: ClientRole, playerId?: string): SessionInfo {
    const token = createToken();
    const session: StoredSession = { token, role, playerId, clerkOpen: false };
    this.sessions.set(token, session);
    return { token, role, playerId };
  }
}
