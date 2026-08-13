import { createId } from "./ids.js";
import { FATE_ACTIONS, DEFAULT_MODS } from "./mods.js";
import { liveCue } from "./status.js";
import type {
  ActingMoves,
  ClerkView,
  ClientRole,
  CoinFace,
  DuelState,
  EditableConfig,
  GameEvent,
  GameSnapshot,
  GameState,
  GiftRecord,
  Mods,
  PendingKind,
  PendingMove,
  PlayerRecord,
  PublicPlayer,
  RpsPick,
  TimerState,
  WrappedPick,
  YouView,
} from "./types.js";

export interface ReduceOk {
  ok: true;
  state: GameState;
  startClock?: boolean;
  stopClock?: boolean;
}

export interface ReduceErr {
  ok: false;
  error: string;
}

export type ReduceResult = ReduceOk | ReduceErr;

export type GameAction =
  | { type: "addPlayer"; id: string; name: string; gift: string; giftId?: string; at?: number }
  | { type: "removePlayer"; id: string; at?: number }
  | { type: "shuffleOrder"; seed: number; at?: number }
  | { type: "assignOrder"; playerIds: string[]; at?: number }
  | { type: "startGame"; now: number; at?: number }
  | { type: "unwrap"; playerId: string; giftId?: string; now: number; at?: number; fromHost?: boolean }
  | { type: "steal"; playerId: string; targetId: string; now: number; at?: number; fromHost?: boolean }
  | { type: "passClosing"; playerId: string; at?: number }
  | { type: "resolvePending"; decision: "allow" | "veto" | "auto"; at?: number }
  | { type: "armShield"; playerId: string; at?: number }
  | { type: "addSpare"; id: string; label: string; at?: number }
  | { type: "rotate"; direction: "left" | "right"; at?: number }
  | { type: "duelPick"; playerId: string; pick: RpsPick; now: number; at?: number }
  | { type: "startTimer"; now: number }
  | { type: "pauseTimer"; now: number }
  | { type: "resetTimer" }
  | { type: "tickTimer"; now: number }
  | { type: "note"; message: string; at?: number }
  | { type: "patchSettings"; patch: EditableConfig }
  | { type: "reset" };

const MAX_EVENTS = 80;
const MAX_NAME = 80;
const MAX_GIFT = 120;
const MAX_LABEL = 80;
const MAX_NOTE = 240;
const MIN_TIMER = 10;
const MAX_TIMER = 3600;
export const VETO_MS = 8000;

function nowOr(at: number | undefined, fallback = Date.now()): number {
  return typeof at === "number" ? at : fallback;
}

function pushEvent(state: GameState, message: string, at: number): GameState {
  const event: GameEvent = { id: createId("evt"), at, message };
  const events = [...state.events, event];
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  return { ...state, events };
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function remainingFromEnds(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function liveTimer(timer: TimerState, now = Date.now()): TimerState {
  if (!timer.running || timer.endsAt === null) {
    return { ...timer, running: false, endsAt: null };
  }
  const remainingSeconds = remainingFromEnds(timer.endsAt, now);
  if (remainingSeconds <= 0) {
    return { ...timer, remainingSeconds: 0, running: false, endsAt: null };
  }
  return { ...timer, remainingSeconds };
}

function findPlayer(state: GameState, id: string): PlayerRecord | undefined {
  return state.players.find((p) => p.id === id);
}

function findGift(state: GameState, id: string): GiftRecord | undefined {
  return state.gifts.find((g) => g.id === id);
}

function heldGift(state: GameState, playerId: string): GiftRecord | undefined {
  return state.gifts.find((g) => g.holderId === playerId);
}

function wrappedGifts(state: GameState): GiftRecord[] {
  return state.gifts.filter((g) => !g.opened && g.holderId === null);
}

function nameOf(state: GameState, id: string): string {
  return findPlayer(state, id)?.name ?? "Someone";
}

function broughtByName(state: GameState, gift: GiftRecord): string {
  if (gift.broughtBy === "spare") return "Spare";
  return nameOf(state, gift.broughtBy);
}

function toWrappedPile(state: GameState): WrappedPick[] {
  return wrappedGifts(state).map((gift) => ({
    id: gift.id,
    broughtByName: broughtByName(state, gift),
  }));
}

function openedLine(state: GameState, actorId: string, gift: GiftRecord): string {
  const opener = nameOf(state, actorId);
  const bringer = broughtByName(state, gift);
  if (gift.broughtBy === actorId) return `${opener} opened their own gift — ${gift.label}.`;
  if (gift.broughtBy === "spare") return `${opener} opened the spare gift — ${gift.label}.`;
  return `${opener} opened ${bringer}'s gift — ${gift.label}.`;
}

function pendingGiftFrom(state: GameState, pending: PendingMove): string | undefined {
  if (pending.kind === "steal") {
    return pending.targetId ? nameOf(state, pending.targetId) : undefined;
  }
  const gift = findGift(state, pending.giftId);
  return gift ? broughtByName(state, gift) : undefined;
}

export function createGameState(overrides: Partial<GameState> = {}): GameState {
  const duration = overrides.timer?.durationSeconds ?? 180;
  return {
    eventLabel: overrides.eventLabel ?? "Yankee Swap",
    joinCode: overrides.joinCode ?? "YANK",
    phase: overrides.phase ?? "lobby",
    players: overrides.players ? [...overrides.players] : [],
    gifts: overrides.gifts ? [...overrides.gifts] : [],
    turnOrder: overrides.turnOrder ?? [],
    turnIndex: overrides.turnIndex ?? 0,
    actingId: overrides.actingId ?? null,
    chainLength: overrides.chainLength ?? 0,
    lastStolenFromId: overrides.lastStolenFromId ?? null,
    lastThiefId: overrides.lastThiefId ?? null,
    mercyProtectedId: overrides.mercyProtectedId ?? null,
    closingUsed: overrides.closingUsed ?? false,
    pending: overrides.pending ?? null,
    duel: overrides.duel ?? null,
    fate: overrides.fate ?? null,
    coin: overrides.coin ?? null,
    mods: overrides.mods ?? { ...DEFAULT_MODS },
    timer: overrides.timer ?? {
      durationSeconds: duration,
      remainingSeconds: duration,
      running: false,
      endsAt: null,
    },
    events: overrides.events ?? [],
  };
}

export function museumDemoSeed(joinCode: string, eventLabel: string, timerSeconds: number): GameState {
  const roster = [
    ["demo-1", "Mara", "a singing mug"],
    ["demo-2", "Theo", "cozy lodge socks"],
    ["demo-3", "Priya", "a brass bottle opener"],
    ["demo-4", "Ellis", "hot cocoa bombs"],
    ["demo-5", "Noor", "a ridiculous scarf"],
    ["demo-6", "Sam", "fancy olive oil"],
  ] as const;
  const players: PlayerRecord[] = roster.map(([id, name]) => ({
    id,
    name,
    shieldAvailable: false,
    shieldArmed: false,
  }));
  const gifts: GiftRecord[] = roster.map(([id, , label]) => ({
    id: `gift-${id}`,
    label,
    broughtBy: id,
    holderId: null,
    opened: false,
    steals: 0,
    frozen: false,
  }));
  return createGameState({
    eventLabel,
    joinCode,
    players,
    gifts,
    timer: {
      durationSeconds: timerSeconds,
      remainingSeconds: timerSeconds,
      running: false,
      endsAt: null,
    },
    events: [
      {
        id: "demo-evt-1",
        at: Date.now(),
        message: "Museum demo party is seated. Shuffle order, then start.",
      },
    ],
  });
}

function sanitizeMods(input: Mods): Mods | string {
  const freezeAfter = input.freezeAfter;
  if (freezeAfter !== 0 && freezeAfter !== 2 && freezeAfter !== 3) {
    return "Freeze must be off, 2, or 3.";
  }
  const chainCap = input.chainCap;
  if (chainCap !== 0 && chainCap !== 2 && chainCap !== 3 && chainCap !== 4) {
    return "Chain cap must be off, 2, 3, or 4.";
  }
  return {
    freezeAfter,
    noRevenge: Boolean(input.noRevenge),
    firstLast: Boolean(input.firstLast),
    turnClock: Boolean(input.turnClock),
    chainCap,
    gentle: Boolean(input.gentle),
    fate: Boolean(input.fate),
    duel: Boolean(input.duel),
    shield: Boolean(input.shield),
    spareGift: Boolean(input.spareGift),
    mercy: Boolean(input.mercy),
    coin: Boolean(input.coin),
    rotate: Boolean(input.rotate),
  };
}

function addPlayer(state: GameState, action: Extract<GameAction, { type: "addPlayer" }>): ReduceResult {
  if (state.phase === "done") {
    return { ok: false, error: "The game is over. Reset to add players." };
  }
  if (state.phase !== "lobby") {
    return { ok: false, error: "Players can only join before the night starts." };
  }
  const name = action.name.trim();
  const gift = action.gift.trim();
  if (!name || name.length > MAX_NAME) {
    return { ok: false, error: "Name is required (max 80 characters)." };
  }
  if (!gift || gift.length > MAX_GIFT) {
    return { ok: false, error: "Gift contribution is required (max 120 characters)." };
  }
  if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: "That name is already in the pile." };
  }
  const player: PlayerRecord = {
    id: action.id,
    name,
    shieldAvailable: state.mods.shield,
    shieldArmed: false,
  };
  const wrapped: GiftRecord = {
    id: action.giftId ?? createId("gf"),
    label: gift,
    broughtBy: action.id,
    holderId: null,
    opened: false,
    steals: 0,
    frozen: false,
  };
  const next = pushEvent(
    { ...state, players: [...state.players, player], gifts: [...state.gifts, wrapped] },
    `${name} joined the pile.`,
    nowOr(action.at),
  );
  return { ok: true, state: next };
}

function removePlayer(state: GameState, id: string, at: number): ReduceResult {
  if (state.phase !== "lobby") {
    return { ok: false, error: "Cannot remove players after the night starts." };
  }
  const player = findPlayer(state, id);
  if (!player) return { ok: false, error: "Player not found." };
  const next = pushEvent(
    {
      ...state,
      players: state.players.filter((p) => p.id !== id),
      gifts: state.gifts.filter((g) => g.broughtBy !== id),
      turnOrder: state.turnOrder.filter((pid) => pid !== id),
    },
    `${player.name} left the pile.`,
    at,
  );
  return { ok: true, state: next };
}

function shuffleOrder(state: GameState, seed: number, at: number): ReduceResult {
  if (state.phase !== "lobby") return { ok: false, error: "Order is locked after start." };
  if (state.players.length < 1) return { ok: false, error: "Need at least one player." };
  const ids = state.players.map((p) => p.id);
  const rand = mulberry32(seed);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const current = ids[i]!;
    ids[i] = ids[j]!;
    ids[j] = current;
  }
  const next = pushEvent({ ...state, turnOrder: ids }, "Turn order was shuffled.", at);
  return { ok: true, state: next };
}

function assignOrder(state: GameState, playerIds: string[], at: number): ReduceResult {
  if (state.phase !== "lobby") return { ok: false, error: "Order is locked after start." };
  if (playerIds.length !== state.players.length) {
    return { ok: false, error: "Assign every seated player a place in line." };
  }
  const unique = new Set(playerIds);
  if (unique.size !== playerIds.length) return { ok: false, error: "Turn order has a duplicate." };
  for (const id of playerIds) {
    if (!findPlayer(state, id)) return { ok: false, error: "Turn order includes an unknown player." };
  }
  const next = pushEvent({ ...state, turnOrder: [...playerIds] }, "Turn order was assigned.", at);
  return { ok: true, state: next };
}

function rollTurn(state: GameState, seed: number): GameState {
  const rand = mulberry32(seed);
  let fate: string | null = null;
  let coin: CoinFace | null = null;
  if (state.mods.fate) {
    fate = FATE_ACTIONS[Math.floor(rand() * FATE_ACTIONS.length)] as string;
  }
  if (state.mods.coin) {
    coin = rand() < 0.5 ? "heads" : "tails";
  }
  return { ...state, fate, coin };
}

function beginActing(state: GameState, actorId: string, now: number): GameState {
  let next: GameState = { ...rollTurn(state, now), actingId: actorId };
  if (state.mods.turnClock) {
    const seconds = next.timer.durationSeconds;
    next = {
      ...next,
      timer: {
        durationSeconds: seconds,
        remainingSeconds: seconds,
        running: true,
        endsAt: now + seconds * 1000,
      },
    };
  }
  return next;
}

function stealableTargets(state: GameState, actorId: string): PlayerRecord[] {
  if (state.mods.gentle) return [];
  if (state.mods.coin && state.coin === "tails") return [];
  if (state.mods.fate && (state.fate === "unwrap" || state.fate === "pass-left" || state.fate === "pass-right")) {
    return [];
  }
  if (state.mods.chainCap > 0 && state.chainLength >= state.mods.chainCap) return [];
  const swapAny = Boolean(state.mods.fate && state.fate === "swap-any");
  return state.players.filter((p) => {
    if (p.id === actorId) return false;
    const gift = heldGift(state, p.id);
    if (!gift || !gift.opened) return false;
    if (!swapAny && gift.frozen) return false;
    if (!swapAny && state.mods.noRevenge && state.lastThiefId === p.id && state.lastStolenFromId === actorId) {
      return false;
    }
    if (!swapAny && state.mods.mercy && state.mercyProtectedId === p.id) return false;
    return true;
  });
}

function heldCount(state: GameState): number {
  return state.turnOrder.filter((id) => heldGift(state, id)).length;
}

function canUnwrap(state: GameState, actorId: string): boolean {
  if (wrappedGifts(state).length === 0) return false;
  if (
    state.mods.fate &&
    (state.fate === "steal" || state.fate === "swap-any") &&
    stealableTargets(state, actorId).length > 0
  ) {
    return false;
  }
  if (state.mods.fate && (state.fate === "pass-left" || state.fate === "pass-right") && heldCount(state) >= 2) {
    return false;
  }
  return true;
}

function startGame(state: GameState, now: number, at: number): ReduceResult {
  if (state.phase !== "lobby") return { ok: false, error: "The night has already started." };
  if (state.players.length < 1) return { ok: false, error: "Need at least one player before starting." };
  let order = state.turnOrder;
  if (order.length !== state.players.length) {
    const shuffled = shuffleOrder(state, now % 2_147_483_647, at) as ReduceOk;
    state = shuffled.state;
    order = shuffled.state.turnOrder;
  }
  const first = order[0]!;
  let next: GameState = {
    ...state,
    phase: "play",
    turnOrder: order,
    turnIndex: 0,
    chainLength: 0,
    players: state.players.map((p) => ({
      ...p,
      shieldAvailable: state.mods.shield,
      shieldArmed: false,
    })),
  };
  next = beginActing(next, first, now);
  next = pushEvent(next, `The swap is on. ${nameOf(next, first)} goes first.`, at);
  return { ok: true, state: next, startClock: next.mods.turnClock };
}

function allOpened(state: GameState): boolean {
  return state.gifts.length > 0 && state.gifts.every((g) => g.opened);
}

function advanceAfterResolve(state: GameState, now: number, at: number): GameState {
  if (state.phase === "closing") {
    return pushEvent(
      { ...state, phase: "done", actingId: null, pending: null, duel: null, fate: null, coin: null },
      "The pile is closed. Picture time.",
      at,
    );
  }
  if (allOpened(state) && state.turnIndex >= state.turnOrder.length - 1) {
    if (state.mods.firstLast && !state.closingUsed && stealableTargets(state, state.turnOrder[0]!).length > 0) {
      let next: GameState = {
        ...state,
        phase: "closing",
        closingUsed: true,
        chainLength: 0,
        pending: null,
        duel: null,
      };
      next = beginActing(next, state.turnOrder[0]!, now);
      return pushEvent(next, `${nameOf(next, next.actingId!)} may trade for the last steal.`, at);
    }
    return pushEvent(
      { ...state, phase: "done", actingId: null, pending: null, duel: null, fate: null, coin: null },
      "The pile is closed. Picture time.",
      at,
    );
  }
  const nextIndex = Math.min(state.turnIndex + 1, state.turnOrder.length - 1);
  const actor = state.turnOrder[nextIndex]!;
  let next: GameState = {
    ...state,
    turnIndex: nextIndex,
    chainLength: 0,
    pending: null,
    duel: null,
  };
  next = beginActing(next, actor, now);
  return pushEvent(next, `${nameOf(next, actor)}'s turn.`, at);
}

function continueChain(state: GameState, victimId: string, now: number, at: number): GameState {
  let next: GameState = {
    ...state,
    chainLength: state.chainLength + 1,
    pending: null,
    duel: null,
  };
  next = beginActing(next, victimId, now);
  return pushEvent(next, `${nameOf(next, victimId)} was stolen from and picks next.`, at);
}

function applyUnwrap(state: GameState, actorId: string, gift: GiftRecord, now: number, at: number): GameState {
  const gifts = state.gifts.map((g) =>
    g.id === gift.id ? { ...g, holderId: actorId, opened: true } : g,
  );
  let next: GameState = { ...state, gifts, lastStolenFromId: null, lastThiefId: null };
  next = pushEvent(next, openedLine(next, actorId, gift), at);
  return advanceAfterResolve(next, now, at);
}

function applySteal(
  state: GameState,
  actorId: string,
  targetId: string,
  gift: GiftRecord,
  now: number,
  at: number,
): GameState {
  const target = findPlayer(state, targetId);
  if (target?.shieldArmed) {
    const players = state.players.map((p) =>
      p.id === targetId ? { ...p, shieldArmed: false } : p,
    );
    let next: GameState = pushEvent(
      { ...state, players, pending: null, duel: null },
      `${target.name}'s shield blocked the steal.`,
      at,
    );
    return advanceAfterResolve(next, now, at);
  }
  const freezeAfter = state.mods.freezeAfter;
  const steals = gift.steals + 1;
  const frozen = freezeAfter > 0 && steals >= freezeAfter;
  const offered = state.gifts.find((g) => g.holderId === actorId && g.id !== gift.id && g.opened);
  const gifts = state.gifts.map((g) => {
    if (g.id === gift.id) return { ...g, holderId: actorId, steals, frozen };
    if (offered && g.id === offered.id) return { ...g, holderId: targetId };
    return g;
  });
  let next: GameState = {
    ...state,
    gifts,
    lastStolenFromId: targetId,
    lastThiefId: actorId,
    mercyProtectedId: state.mods.mercy ? targetId : null,
    pending: null,
    duel: null,
  };
  const thief = nameOf(next, actorId);
  const victim = nameOf(next, targetId);
  next = pushEvent(
    next,
    offered
      ? `${thief} traded the ${offered.label} for ${victim}'s ${gift.label}.`
      : `${thief} stole the ${gift.label} from ${victim}.`,
    at,
  );
  if (offered) {
    return advanceAfterResolve(next, now, at);
  }
  if (wrappedGifts(next).length > 0 || stealableTargets(next, targetId).length > 0) {
    return continueChain(next, targetId, now, at);
  }
  return advanceAfterResolve(next, now, at);
}

function queuePending(
  state: GameState,
  kind: PendingKind,
  actorId: string,
  giftId: string,
  now: number,
  at: number,
  targetId?: string,
): GameState {
  const pending: PendingMove = {
    kind,
    actorId,
    giftId,
    at,
    autoAt: now + VETO_MS,
    ...(targetId ? { targetId } : {}),
  };
  return pushEvent(
    { ...state, pending, duel: null },
    kind === "steal"
      ? `${nameOf(state, actorId)} wants to steal from ${nameOf(state, targetId!)}.`
      : `${nameOf(state, actorId)} wants ${broughtByName(state, findGift(state, giftId)!)}'s gift from the pile.`,
    at,
  );
}

function actorMustAct(state: GameState, playerId: string): string | undefined {
  if (state.phase !== "play" && state.phase !== "closing") return "The swap is not in play.";
  if (state.pending) return "A move is waiting on the host.";
  if (state.duel) return "A rock-paper-scissors duel is in progress.";
  if (state.actingId !== playerId) return "It is not your turn.";
  return undefined;
}

function unwrap(
  state: GameState,
  playerId: string,
  giftId: string | undefined,
  now: number,
  at: number,
  fromHost = false,
): ReduceResult {
  const blocked = actorMustAct(state, playerId);
  if (blocked) return { ok: false, error: blocked };
  if (!canUnwrap(state, playerId)) return { ok: false, error: "You cannot unwrap right now." };
  const pile = wrappedGifts(state);
  const gift = giftId ? findGift(state, giftId) : pile[0];
  if (!gift || gift.opened || gift.holderId) {
    return { ok: false, error: "Pick a wrapped gift from the pile." };
  }
  if (fromHost) {
    return { ok: true, state: applyUnwrap(state, playerId, gift, now, at) };
  }
  return { ok: true, startClock: true, state: queuePending(state, "unwrap", playerId, gift.id, now, at) };
}

function steal(
  state: GameState,
  playerId: string,
  targetId: string,
  now: number,
  at: number,
  fromHost = false,
): ReduceResult {
  const blocked = actorMustAct(state, playerId);
  if (blocked) return { ok: false, error: blocked };
  const targets = stealableTargets(state, playerId);
  if (!targets.some((p) => p.id === targetId)) {
    return { ok: false, error: "You cannot steal that gift." };
  }
  const gift = heldGift(state, targetId)!;
  if (fromHost) {
    return { ok: true, state: applySteal(state, playerId, targetId, gift, now, at) };
  }
  if (state.mods.duel) {
    const duel: DuelState = {
      actorId: playerId,
      targetId,
      giftId: gift.id,
      actorPick: null,
      targetPick: null,
    };
    const next = pushEvent(
      { ...state, duel, pending: null },
      `${nameOf(state, playerId)} challenged ${nameOf(state, targetId)} to rock-paper-scissors.`,
      at,
    );
    return { ok: true, state: next };
  }
  return {
    ok: true,
    startClock: true,
    state: queuePending(state, "steal", playerId, gift.id, now, at, targetId),
  };
}

function passClosing(state: GameState, playerId: string, at: number): ReduceResult {
  if (state.phase !== "closing") return { ok: false, error: "No last steal to pass on." };
  if (state.actingId !== playerId) return { ok: false, error: "It is not your turn." };
  const next = pushEvent(
    { ...state, phase: "done", actingId: null, pending: null, duel: null },
    `${nameOf(state, playerId)} kept their gift. Picture time.`,
    at,
  );
  return { ok: true, stopClock: true, state: next };
}

function resolvePending(
  state: GameState,
  decision: "allow" | "veto" | "auto",
  at: number,
): ReduceResult {
  const pending = state.pending;
  if (!pending) return { ok: false, error: "Nothing is waiting on the host." };
  if (decision === "veto") {
    const next = pushEvent({ ...state, pending: null }, "The host vetoed that move.", at);
    return { ok: true, state: next };
  }
  const gift = findGift(state, pending.giftId);
  if (!gift) return { ok: false, error: "That gift is gone." };
  const now = at;
  if (pending.kind === "unwrap") {
    return { ok: true, state: applyUnwrap(state, pending.actorId, gift, now, at) };
  }
  if (!pending.targetId) return { ok: false, error: "Steal is missing a target." };
  return { ok: true, state: applySteal(state, pending.actorId, pending.targetId, gift, now, at) };
}

function armShield(state: GameState, playerId: string, at: number): ReduceResult {
  if (!state.mods.shield) return { ok: false, error: "Shield is not on." };
  const player = findPlayer(state, playerId);
  if (!player) return { ok: false, error: "Player not found." };
  if (!player.shieldAvailable) return { ok: false, error: "You already used your shield." };
  if (!heldGift(state, playerId)) return { ok: false, error: "You need a gift to shield." };
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, shieldAvailable: false, shieldArmed: true } : p,
  );
  const next = pushEvent({ ...state, players }, `${player.name} armed a shield.`, at);
  return { ok: true, state: next };
}

function addSpare(state: GameState, id: string, label: string, at: number): ReduceResult {
  if (!state.mods.spareGift) return { ok: false, error: "Spare gift is not on." };
  if (state.phase === "done") return { ok: false, error: "The pile is closed." };
  const text = label.trim();
  if (!text || text.length > MAX_GIFT) return { ok: false, error: "Spare gift needs a label (max 120)." };
  const gift: GiftRecord = {
    id,
    label: text,
    broughtBy: "spare",
    holderId: null,
    opened: false,
    steals: 0,
    frozen: false,
  };
  const next = pushEvent({ ...state, gifts: [...state.gifts, gift] }, "A spare wrapped gift hit the pile.", at);
  return { ok: true, state: next };
}

function rotate(state: GameState, direction: "left" | "right", at: number): ReduceResult {
  if (!state.mods.rotate && state.fate !== "pass-left" && state.fate !== "pass-right") {
    return { ok: false, error: "Rotate is not on." };
  }
  if (state.phase !== "play" && state.phase !== "closing") {
    return { ok: false, error: "Nothing to rotate yet." };
  }
  const holders = state.turnOrder.filter((id) => heldGift(state, id));
  if (holders.length < 2) return { ok: false, error: "Need at least two held gifts to rotate." };
  const shifted = direction === "left" ? [...holders.slice(1), holders[0]!] : [holders[holders.length - 1]!, ...holders.slice(0, -1)];
  const map = new Map<string, string>();
  holders.forEach((id, i) => map.set(id, shifted[i]!));
  const gifts = state.gifts.map((g) => {
    if (!g.holderId || !map.has(g.holderId)) return g;
    return { ...g, holderId: map.get(g.holderId)! };
  });
  const next = pushEvent({ ...state, gifts }, `Gifts rotated ${direction}.`, at);
  if (state.fate === "pass-left" || state.fate === "pass-right") {
    return { ok: true, state: advanceAfterResolve(next, at, at) };
  }
  return { ok: true, state: next };
}

function beats(a: RpsPick, b: RpsPick): boolean {
  return (
    (a === "rock" && b === "scissors") ||
    (a === "scissors" && b === "paper") ||
    (a === "paper" && b === "rock")
  );
}

function duelPick(
  state: GameState,
  playerId: string,
  pick: RpsPick,
  now: number,
  at: number,
): ReduceResult {
  const duel = state.duel;
  if (!duel) return { ok: false, error: "No duel is in progress." };
  if (playerId !== duel.actorId && playerId !== duel.targetId) {
    return { ok: false, error: "You are not in this duel." };
  }
  let actorPick = duel.actorPick;
  let targetPick = duel.targetPick;
  if (playerId === duel.actorId) {
    if (actorPick) return { ok: false, error: "You already picked." };
    actorPick = pick;
  } else {
    if (targetPick) return { ok: false, error: "You already picked." };
    targetPick = pick;
  }
  if (!actorPick || !targetPick) {
    return { ok: true, state: { ...state, duel: { ...duel, actorPick, targetPick } } };
  }
  if (actorPick === targetPick) {
    const next = pushEvent(
      { ...state, duel: { ...duel, actorPick: null, targetPick: null } },
      "Tie — pick again.",
      at,
    );
    return { ok: true, state: next };
  }
  const actorWins = beats(actorPick, targetPick);
  const gift = findGift(state, duel.giftId);
  if (!gift) return { ok: false, error: "That gift is gone." };
  if (!actorWins) {
    let next = pushEvent(
      { ...state, duel: null },
      `${nameOf(state, duel.targetId)} won rock-paper-scissors and kept the gift.`,
      at,
    );
    if (!canUnwrap(next, duel.actorId)) {
      next = advanceAfterResolve(next, now, at);
    }
    return { ok: true, state: next };
  }
  const queued = queuePending(
    { ...state, duel: null },
    "steal",
    duel.actorId,
    gift.id,
    now,
    at,
    duel.targetId,
  );
  return { ok: true, startClock: true, state: queued };
}

function startTimer(state: GameState, now: number): ReduceResult {
  const remaining =
    state.timer.remainingSeconds > 0 ? state.timer.remainingSeconds : state.timer.durationSeconds;
  if (remaining <= 0) return { ok: false, error: "Timer has nothing left on the clock." };
  return {
    ok: true,
    startClock: true,
    state: {
      ...state,
      timer: {
        ...state.timer,
        remainingSeconds: remaining,
        running: true,
        endsAt: now + remaining * 1000,
      },
    },
  };
}

function pauseTimer(state: GameState, now: number): ReduceResult {
  const live = liveTimer(state.timer, now);
  return {
    ok: true,
    stopClock: true,
    state: { ...state, timer: { ...live, running: false, endsAt: null } },
  };
}

function resetTimer(state: GameState): ReduceResult {
  return {
    ok: true,
    stopClock: true,
    state: {
      ...state,
      timer: {
        durationSeconds: state.timer.durationSeconds,
        remainingSeconds: state.timer.durationSeconds,
        running: false,
        endsAt: null,
      },
    },
  };
}

function tickTimer(state: GameState, now: number): ReduceResult {
  if (state.pending && now >= state.pending.autoAt) {
    return resolvePending(state, "auto", now);
  }
  if (!state.timer.running) return { ok: true, state };
  const live = liveTimer(state.timer, now);
  if (live.running) return { ok: true, state: { ...state, timer: live } };
  let next: GameState = pushEvent({ ...state, timer: live }, "Timer hit zero.", now);
  if (next.pending) return resolvePending(next, "auto", now);
  if (next.actingId && canUnwrap(next, next.actingId) && wrappedGifts(next).length > 0) {
    const gift = wrappedGifts(next)[0]!;
    return { ok: true, stopClock: true, state: applyUnwrap(next, next.actingId, gift, now, now) };
  }
  if (next.actingId) {
    next = advanceAfterResolve(next, now, now);
  }
  return { ok: true, stopClock: !next.timer.running, state: next };
}

function note(state: GameState, message: string, at: number): ReduceResult {
  const text = message.trim();
  if (!text || text.length > MAX_NOTE) return { ok: false, error: "Note is required (max 240 characters)." };
  return { ok: true, state: pushEvent(state, text, at) };
}

function patchSettings(state: GameState, patch: EditableConfig): ReduceResult {
  const eventLabel = patch.eventLabel.trim();
  if (!eventLabel || eventLabel.length > MAX_LABEL) {
    return { ok: false, error: "Event label is required (max 80 characters)." };
  }
  if (
    !Number.isInteger(patch.timerSeconds) ||
    patch.timerSeconds < MIN_TIMER ||
    patch.timerSeconds > MAX_TIMER
  ) {
    return { ok: false, error: "Timer must be a whole number of seconds from 10 to 3600." };
  }
  const mods = sanitizeMods(patch.mods);
  if (typeof mods === "string") return { ok: false, error: mods };
  if (state.phase !== "lobby" && JSON.stringify(mods) !== JSON.stringify(state.mods)) {
    return { ok: false, error: "Mods lock when the night starts." };
  }
  const timerRunning = state.timer.running;
  const timer: TimerState = timerRunning
    ? { ...state.timer, durationSeconds: patch.timerSeconds }
    : {
        durationSeconds: patch.timerSeconds,
        remainingSeconds: patch.timerSeconds,
        running: false,
        endsAt: null,
      };
  const players =
    state.phase === "lobby"
      ? state.players.map((p) => ({ ...p, shieldAvailable: mods.shield, shieldArmed: false }))
      : state.players;
  return { ok: true, state: { ...state, eventLabel, mods, timer, players } };
}

function resetState(state: GameState): ReduceResult {
  return {
    ok: true,
    stopClock: true,
    state: createGameState({
      eventLabel: state.eventLabel,
      joinCode: state.joinCode,
      mods: state.mods,
      timer: {
        durationSeconds: state.timer.durationSeconds,
        remainingSeconds: state.timer.durationSeconds,
        running: false,
        endsAt: null,
      },
    }),
  };
}

export function reduce(state: GameState, action: GameAction): ReduceResult {
  switch (action.type) {
    case "addPlayer":
      return addPlayer(state, action);
    case "removePlayer":
      return removePlayer(state, action.id, nowOr(action.at));
    case "shuffleOrder":
      return shuffleOrder(state, action.seed, nowOr(action.at));
    case "assignOrder":
      return assignOrder(state, action.playerIds, nowOr(action.at));
    case "startGame":
      return startGame(state, action.now, nowOr(action.at, action.now));
    case "unwrap":
      return unwrap(
        state,
        action.playerId,
        action.giftId,
        action.now,
        nowOr(action.at, action.now),
        Boolean(action.fromHost),
      );
    case "steal":
      return steal(
        state,
        action.playerId,
        action.targetId,
        action.now,
        nowOr(action.at, action.now),
        Boolean(action.fromHost),
      );
    case "passClosing":
      return passClosing(state, action.playerId, nowOr(action.at));
    case "resolvePending":
      return resolvePending(state, action.decision, nowOr(action.at));
    case "armShield":
      return armShield(state, action.playerId, nowOr(action.at));
    case "addSpare":
      return addSpare(state, action.id, action.label, nowOr(action.at));
    case "rotate":
      return rotate(state, action.direction, nowOr(action.at));
    case "duelPick":
      return duelPick(state, action.playerId, action.pick, action.now, nowOr(action.at, action.now));
    case "startTimer":
      return startTimer(state, action.now);
    case "pauseTimer":
      return pauseTimer(state, action.now);
    case "resetTimer":
      return resetTimer(state);
    case "tickTimer":
      return tickTimer(state, action.now);
    case "note":
      return note(state, action.message, nowOr(action.at));
    case "patchSettings":
      return patchSettings(state, action.patch);
    case "reset":
      return resetState(state);
    default: {
      const _never: never = action;
      return { ok: false, error: `Unknown action: ${String(_never)}` };
    }
  }
}

function turnNumber(state: GameState, playerId: string): number | null {
  if (state.phase === "lobby") return null;
  const index = state.turnOrder.indexOf(playerId);
  return index < 0 ? null : index + 1;
}

export function toPublicPlayer(state: GameState, player: PlayerRecord): PublicPlayer {
  const gift = heldGift(state, player.id);
  return {
    id: player.id,
    name: player.name,
    turn: turnNumber(state, player.id),
    giftLabel: gift?.opened ? gift.label : gift ? "Wrapped" : "—",
    frozen: Boolean(gift?.frozen),
    shieldArmed: player.shieldArmed,
    isActing: state.actingId === player.id,
  };
}

export function toYouView(state: GameState, player: PlayerRecord): YouView {
  const held = heldGift(state, player.id);
  const brought = state.gifts.find((g) => g.broughtBy === player.id);
  return {
    id: player.id,
    name: player.name,
    gift: brought?.label ?? null,
    giftPublic: Boolean(brought?.opened),
    holding: held?.opened ? held.label : null,
    broughtHolder:
      brought?.opened && brought.holderId ? nameOf(state, brought.holderId) : null,
    shieldAvailable: player.shieldAvailable,
    shieldArmed: player.shieldArmed,
    isActing: state.actingId === player.id,
    canUnwrap:
      state.actingId === player.id &&
      !state.pending &&
      !state.duel &&
      canUnwrap(state, player.id),
    canSteal:
      state.actingId === player.id &&
      !state.pending &&
      !state.duel &&
      stealableTargets(state, player.id).length > 0,
  };
}

function toActingMoves(state: GameState): ActingMoves | null {
  const id = state.actingId;
  if (!id || (state.phase !== "play" && state.phase !== "closing")) return null;
  if (state.pending || state.duel) return null;
  const rotate =
    state.fate === "pass-left" ? "left" : state.fate === "pass-right" ? "right" : null;
  return {
    playerId: id,
    name: nameOf(state, id),
    canUnwrap: canUnwrap(state, id),
    unwrapTargets: canUnwrap(state, id) ? toWrappedPile(state) : [],
    stealTargets: stealableTargets(state, id).map((player) => ({
      id: player.id,
      name: player.name,
      giftLabel: heldGift(state, player.id)!.label,
    })),
    canPass: state.phase === "closing",
    rotate,
  };
}

function clerkView(state: GameState): ClerkView {
  return {
    gifts: state.gifts.map((g) => ({
      id: g.id,
      label: g.opened ? g.label : "Wrapped",
      holderName: g.holderId ? nameOf(state, g.holderId) : null,
      opened: g.opened,
      steals: g.steals,
    })),
    turnOrder: state.turnOrder.map((id) => ({ id, name: nameOf(state, id) })),
    chainLength: state.chainLength,
  };
}

export function toSnapshot(
  state: GameState,
  role: ClientRole,
  museumMode: boolean,
  hostPinRequired: boolean,
  playerId: string | undefined,
  now = Date.now(),
  clerkOpen = false,
): GameSnapshot {
  const timer = liveTimer(state.timer, now);
  const youPlayer = playerId ? findPlayer(state, playerId) : undefined;
  const pending = state.pending;
  const duel = state.duel;
  const nextId = state.turnOrder[state.turnIndex + 1];
  const cue = liveCue({
    role,
    phase: state.phase,
    playerCount: state.players.length,
    actingName: state.actingId ? nameOf(state, state.actingId) : null,
    nextName: nextId ? nameOf(state, nextId) : null,
    youName: youPlayer?.name ?? null,
    youActing: Boolean(youPlayer && state.actingId === youPlayer.id),
    chainLength: state.chainLength,
    firstLast: state.mods.firstLast,
    pending: pending
      ? {
          kind: pending.kind,
          actorName: nameOf(state, pending.actorId),
          targetName: pendingGiftFrom(state, pending),
          autoInSeconds: Math.max(0, Math.ceil((pending.autoAt - now) / 1000)),
        }
      : null,
    duel: duel
      ? {
          actorName: nameOf(state, duel.actorId),
          targetName: nameOf(state, duel.targetId),
          youNeedPick:
            Boolean(youPlayer) &&
            ((youPlayer?.id === duel.actorId && !duel.actorPick) ||
              (youPlayer?.id === duel.targetId && !duel.targetPick)),
        }
      : null,
    fate: state.fate,
    coin: state.coin,
    canUnwrap: Boolean(state.actingId && !pending && !duel && canUnwrap(state, state.actingId)),
    canSteal: Boolean(
      state.actingId && !pending && !duel && stealableTargets(state, state.actingId).length > 0,
    ),
  });
  return {
    role,
    eventLabel: state.eventLabel,
    joinCode: state.joinCode,
    museumMode,
    phase: state.phase,
    phaseTitle: cue.title,
    phaseNow: cue.now,
    phaseNext: cue.next,
    gameStarted: state.phase !== "lobby",
    gameOver: state.phase === "done",
    giftsRevealed: state.gifts.some((g) => g.opened),
    players: state.players.map((p) => toPublicPlayer(state, p)),
    pileCount: wrappedGifts(state).length,
    wrappedPile: toWrappedPile(state),
    events: [...state.events].slice(-40).reverse(),
    timer,
    mods: state.mods,
    actingId: state.actingId,
    actingName: state.actingId ? nameOf(state, state.actingId) : null,
    fate: state.fate,
    coin: state.coin,
    pending: pending
      ? {
          kind: pending.kind,
          actorName: nameOf(state, pending.actorId),
          targetName: pendingGiftFrom(state, pending),
          autoInSeconds: Math.max(0, Math.ceil((pending.autoAt - now) / 1000)),
        }
      : null,
    duel: duel
      ? {
          actorName: nameOf(state, duel.actorId),
          targetName: nameOf(state, duel.targetId),
          youNeedPick:
            Boolean(youPlayer) &&
            ((youPlayer?.id === duel.actorId && !duel.actorPick) ||
              (youPlayer?.id === duel.targetId && !duel.targetPick)),
        }
      : null,
    you: youPlayer ? toYouView(state, youPlayer) : null,
    actingMoves: role === "host" ? toActingMoves(state) : null,
    hostPinRequired,
    clerkOpen: role === "host" && clerkOpen,
    clerk: role === "host" && clerkOpen ? clerkView(state) : null,
  };
}
