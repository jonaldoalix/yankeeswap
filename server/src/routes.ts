import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { GameStore, StoredSession } from "./store.js";

const joinBody = z.object({
  joinCode: z.string().trim().min(3).max(8),
  name: z.string().trim().min(1).max(80),
  gift: z.string().trim().min(1).max(120),
});

const hostBody = z.object({
  pin: z.string().trim().max(64).optional(),
});

const spectateBody = z.object({
  joinCode: z.string().trim().min(3).max(8),
});

const addPlayerBody = z.object({
  name: z.string().trim().min(1).max(80),
  gift: z.string().trim().min(1).max(120),
});

const assignBody = z.object({
  playerIds: z.array(z.string().trim().min(1)).min(1).max(40),
});

const unwrapBody = z.object({
  giftId: z.string().trim().min(1).optional(),
});

const hostPlayBody = z.object({
  kind: z.enum(["unwrap", "steal", "pass", "rotate"]),
  targetId: z.string().trim().min(1).optional(),
  giftId: z.string().trim().min(1).optional(),
  direction: z.enum(["left", "right"]).optional(),
});

const stealBody = z.object({
  targetId: z.string().trim().min(1),
});

const pendingBody = z.object({
  decision: z.enum(["allow", "veto"]),
});

const clerkBody = z.object({
  open: z.boolean(),
});

const duelBody = z.object({
  pick: z.enum(["rock", "paper", "scissors"]),
});

const rotateBody = z.object({
  direction: z.enum(["left", "right"]),
});

const spareBody = z.object({
  label: z.string().trim().min(1).max(120),
});

const timerBody = z.object({
  action: z.enum(["start", "pause", "reset"]),
});

const noteBody = z.object({
  message: z.string().trim().min(1).max(240),
});

const modsBody = z.object({
  freezeAfter: z.union([z.literal(0), z.literal(2), z.literal(3)]),
  noRevenge: z.boolean(),
  firstLast: z.boolean(),
  turnClock: z.boolean(),
  chainCap: z.union([z.literal(0), z.literal(2), z.literal(3), z.literal(4)]),
  gentle: z.boolean(),
  fate: z.boolean(),
  duel: z.boolean(),
  shield: z.boolean(),
  spareGift: z.boolean(),
  mercy: z.boolean(),
  coin: z.boolean(),
  rotate: z.boolean(),
});

const settingsBody = z.object({
  eventLabel: z.string().trim().min(1).max(80),
  timerSeconds: z.number().int(),
  mods: modsBody,
});

function tokenFrom(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.toLowerCase().startsWith("bearer ")) {
    const value = header.slice(7).trim();
    if (value !== "") return value;
  }
  const query = req.query.access_token;
  if (typeof query === "string" && query.trim() !== "") return query.trim();
  return undefined;
}

function fail(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

function requireSession(store: GameStore, req: Request, res: Response): StoredSession | undefined {
  const session = store.getSession(tokenFrom(req));
  if (!session) {
    fail(res, 401, "Sign in as host, player, or spectator first.");
    return undefined;
  }
  return session;
}

function requireHost(store: GameStore, req: Request, res: Response): StoredSession | undefined {
  const session = requireSession(store, req, res);
  if (!session) return undefined;
  if (session.role !== "host") {
    fail(res, 403, "Only the host can do that.");
    return undefined;
  }
  return session;
}

function requirePlayer(store: GameStore, req: Request, res: Response): StoredSession | undefined {
  const session = requireSession(store, req, res);
  if (!session) return undefined;
  if (session.role !== "player" || !session.playerId) {
    fail(res, 403, "Only a seated player can do that.");
    return undefined;
  }
  return session;
}

export function createApiRouter(store: GameStore): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.get("/config", (_req, res) => {
    res.json(store.publicConfig());
  });

  router.post("/session/host", (req, res) => {
    const parsed = hostBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid host payload.");
      return;
    }
    const claimed = store.claimHost(parsed.data.pin);
    if (!claimed.ok) {
      fail(res, 403, claimed.error);
      return;
    }
    res.status(201).json({ session: claimed.session, state: store.snapshot(claimed.session) });
  });

  router.post("/session/join", (req, res) => {
    const parsed = joinBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid join payload.");
      return;
    }
    const joined = store.joinPlayer(parsed.data);
    if (!joined.ok) {
      fail(res, 400, joined.error);
      return;
    }
    res.status(201).json({ session: joined.session, state: store.snapshot(joined.session) });
  });

  router.post("/session/spectate", (req, res) => {
    const parsed = spectateBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid spectator payload.");
      return;
    }
    const watched = store.spectate(parsed.data.joinCode);
    if (!watched.ok) {
      fail(res, 400, watched.error);
      return;
    }
    res.status(201).json({ session: watched.session, state: store.snapshot(watched.session) });
  });

  router.get("/state", (req, res) => {
    const session = requireSession(store, req, res);
    if (!session) return;
    res.json(store.snapshot(session));
  });

  router.get("/stream", (req, res) => {
    const session = requireSession(store, req, res);
    if (!session) return;
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const unsubscribe = store.bus.subscribe(res);
    res.write(`event: state\ndata: ${JSON.stringify(store.snapshot(session))}\n\n`);
    req.on("close", () => {
      unsubscribe();
    });
  });

  router.post("/players", (req, res) => {
    const session = requireHost(store, req, res);
    if (!session) return;
    const parsed = addPlayerBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid player payload.");
      return;
    }
    const added = store.seatPlayer(parsed.data);
    if (!added.ok) {
      fail(res, 400, added.error);
      return;
    }
    res.status(201).json(store.snapshot(session));
  });

  router.delete("/players/:id", (req, res) => {
    const session = requireHost(store, req, res);
    if (!session) return;
    const removed = store.apply({ type: "removePlayer", id: String(req.params.id) });
    if (!removed.ok) {
      fail(res, 400, removed.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/order/shuffle", (req, res) => {
    const session = requireHost(store, req, res);
    if (!session) return;
    const next = store.apply({ type: "shuffleOrder", seed: Date.now() % 2_147_483_647 });
    if (!next.ok) {
      fail(res, 400, next.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/order/assign", (req, res) => {
    const session = requireHost(store, req, res);
    if (!session) return;
    const parsed = assignBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid order payload.");
      return;
    }
    const next = store.apply({ type: "assignOrder", playerIds: parsed.data.playerIds });
    if (!next.ok) {
      fail(res, 400, next.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/game/start", (req, res) => {
    const session = requireHost(store, req, res);
    if (!session) return;
    const now = Date.now();
    const next = store.apply({ type: "startGame", now, at: now });
    if (!next.ok) {
      fail(res, 400, next.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/play/for", (req, res) => {
    const session = requireHost(store, req, res);
    if (!session) return;
    const parsed = hostPlayBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid host move.");
      return;
    }
    const actorId = store.state.actingId;
    if (!actorId) {
      fail(res, 400, "Nobody is up.");
      return;
    }
    const now = Date.now();
    const { kind, targetId, giftId, direction } = parsed.data;
    let next;
    if (kind === "unwrap") {
      next = store.apply({ type: "unwrap", playerId: actorId, giftId, now, at: now, fromHost: true });
    } else if (kind === "steal") {
      if (!targetId) {
        fail(res, 400, "Pick someone to steal from.");
        return;
      }
      next = store.apply({
        type: "steal",
        playerId: actorId,
        targetId,
        now,
        at: now,
        fromHost: true,
      });
    } else if (kind === "pass") {
      next = store.apply({ type: "passClosing", playerId: actorId, at: now });
    } else {
      next = store.apply({ type: "rotate", direction: direction ?? "left" });
    }
    if (!next.ok) {
      fail(res, 400, next.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/play/unwrap", (req, res) => {
    const session = requirePlayer(store, req, res);
    if (!session) return;
    const parsed = unwrapBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid unwrap payload.");
      return;
    }
    const now = Date.now();
    const next = store.apply({
      type: "unwrap",
      playerId: session.playerId!,
      giftId: parsed.data.giftId,
      now,
      at: now,
    });
    if (!next.ok) {
      fail(res, 400, next.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/play/steal", (req, res) => {
    const session = requirePlayer(store, req, res);
    if (!session) return;
    const parsed = stealBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid steal payload.");
      return;
    }
    const now = Date.now();
    const next = store.apply({
      type: "steal",
      playerId: session.playerId!,
      targetId: parsed.data.targetId,
      now,
      at: now,
    });
    if (!next.ok) {
      fail(res, 400, next.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/play/pass", (req, res) => {
    const session = requirePlayer(store, req, res);
    if (!session) return;
    const next = store.apply({ type: "passClosing", playerId: session.playerId! });
    if (!next.ok) {
      fail(res, 400, next.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/play/shield", (req, res) => {
    const session = requirePlayer(store, req, res);
    if (!session) return;
    const next = store.apply({ type: "armShield", playerId: session.playerId! });
    if (!next.ok) {
      fail(res, 400, next.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/play/duel", (req, res) => {
    const session = requirePlayer(store, req, res);
    if (!session) return;
    const parsed = duelBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid rock-paper-scissors payload.");
      return;
    }
    const now = Date.now();
    const next = store.apply({
      type: "duelPick",
      playerId: session.playerId!,
      pick: parsed.data.pick,
      now,
      at: now,
    });
    if (!next.ok) {
      fail(res, 400, next.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/play/rotate", (req, res) => {
    const session = requireSession(store, req, res);
    if (!session) return;
    if (session.role !== "host" && session.role !== "player") {
      fail(res, 403, "Only the host or a seated player can do that.");
      return;
    }
    const parsed = rotateBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid rotate payload.");
      return;
    }
    const next = store.apply({ type: "rotate", direction: parsed.data.direction });
    if (!next.ok) {
      fail(res, 400, next.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/pending", (req, res) => {
    const session = requireHost(store, req, res);
    if (!session) return;
    const parsed = pendingBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid pending payload.");
      return;
    }
    const next = store.apply({ type: "resolvePending", decision: parsed.data.decision });
    if (!next.ok) {
      fail(res, 400, next.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/clerk", (req, res) => {
    const session = requireHost(store, req, res);
    if (!session) return;
    const parsed = clerkBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid clerk payload.");
      return;
    }
    res.json(store.setClerk(session, parsed.data.open));
  });

  router.post("/spare", (req, res) => {
    const session = requireHost(store, req, res);
    if (!session) return;
    const parsed = spareBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid spare payload.");
      return;
    }
    const next = store.apply({
      type: "addSpare",
      id: `spare-${Date.now()}`,
      label: parsed.data.label,
    });
    if (!next.ok) {
      fail(res, 400, next.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/timer", (req, res) => {
    const session = requireHost(store, req, res);
    if (!session) return;
    const parsed = timerBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid timer payload.");
      return;
    }
    const now = Date.now();
    const action =
      parsed.data.action === "start"
        ? ({ type: "startTimer", now } as const)
        : parsed.data.action === "pause"
          ? ({ type: "pauseTimer", now } as const)
          : ({ type: "resetTimer" } as const);
    const result = store.apply(action);
    if (!result.ok) {
      fail(res, 400, result.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/notes", (req, res) => {
    const session = requireHost(store, req, res);
    if (!session) return;
    const parsed = noteBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid note payload.");
      return;
    }
    store.apply({ type: "note", message: parsed.data.message });
    res.json(store.snapshot(session));
  });

  router.patch("/config", (req, res) => {
    const session = requireHost(store, req, res);
    if (!session) return;
    const parsed = settingsBody.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, "Invalid settings payload.");
      return;
    }
    const result = store.apply({ type: "patchSettings", patch: parsed.data });
    if (!result.ok) {
      fail(res, 400, result.error);
      return;
    }
    res.json(store.snapshot(session));
  });

  router.post("/reset", (req, res) => {
    const session = requireHost(store, req, res);
    if (!session) return;
    store.resetTable();
    res.json(store.snapshot(session));
  });

  return router;
}
