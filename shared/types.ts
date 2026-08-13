export type ClientRole = "host" | "player" | "spectator";

export type Phase = "lobby" | "play" | "closing" | "done";

export type RpsPick = "rock" | "paper" | "scissors";

export type CoinFace = "heads" | "tails";

export type PendingKind = "unwrap" | "steal";

export interface Mods {
  freezeAfter: 0 | 2 | 3;
  noRevenge: boolean;
  firstLast: boolean;
  turnClock: boolean;
  chainCap: 0 | 2 | 3 | 4;
  gentle: boolean;
  fate: boolean;
  duel: boolean;
  shield: boolean;
  spareGift: boolean;
  mercy: boolean;
  coin: boolean;
  rotate: boolean;
}

export interface PlayerRecord {
  id: string;
  name: string;
  shieldAvailable: boolean;
  shieldArmed: boolean;
}

export interface GiftRecord {
  id: string;
  label: string;
  broughtBy: string;
  holderId: string | null;
  opened: boolean;
  steals: number;
  frozen: boolean;
}

export interface GameEvent {
  id: string;
  at: number;
  message: string;
}

export interface PendingMove {
  kind: PendingKind;
  actorId: string;
  targetId?: string;
  giftId: string;
  at: number;
  autoAt: number;
}

export interface DuelState {
  actorId: string;
  targetId: string;
  giftId: string;
  actorPick: RpsPick | null;
  targetPick: RpsPick | null;
}

export interface TimerState {
  durationSeconds: number;
  remainingSeconds: number;
  running: boolean;
  endsAt: number | null;
}

export interface GameState {
  eventLabel: string;
  joinCode: string;
  phase: Phase;
  players: PlayerRecord[];
  gifts: GiftRecord[];
  turnOrder: string[];
  turnIndex: number;
  actingId: string | null;
  chainLength: number;
  lastStolenFromId: string | null;
  lastThiefId: string | null;
  mercyProtectedId: string | null;
  closingUsed: boolean;
  pending: PendingMove | null;
  duel: DuelState | null;
  fate: string | null;
  coin: CoinFace | null;
  mods: Mods;
  timer: TimerState;
  events: GameEvent[];
}

export interface PublicPlayer {
  id: string;
  name: string;
  turn: number | null;
  giftLabel: string;
  frozen: boolean;
  shieldArmed: boolean;
  isActing: boolean;
}

export interface PublicGift {
  id: string;
  holderId: string | null;
  opened: boolean;
  frozen: boolean;
  label: string;
}

export interface YouView {
  id: string;
  name: string;
  gift: string | null;
  giftPublic: boolean;
  holding: string | null;
  broughtHolder: string | null;
  shieldAvailable: boolean;
  shieldArmed: boolean;
  isActing: boolean;
  canUnwrap: boolean;
  canSteal: boolean;
}

export interface PublicPending {
  kind: PendingKind;
  actorName: string;
  targetName?: string;
  autoInSeconds: number;
}

export interface PublicConfig {
  museumMode: boolean;
  eventLabel: string;
  joinCode: string;
  timerSeconds: number;
  hostPinRequired: boolean;
  playerCount: number;
  phase: Phase;
  gameStarted: boolean;
  gameOver: boolean;
}

export interface EditableConfig {
  eventLabel: string;
  timerSeconds: number;
  mods: Mods;
}

export interface GameSnapshot {
  role: ClientRole;
  eventLabel: string;
  joinCode: string;
  museumMode: boolean;
  phase: Phase;
  phaseTitle: string;
  phaseNow: string;
  phaseNext: string;
  gameStarted: boolean;
  gameOver: boolean;
  giftsRevealed: boolean;
  players: PublicPlayer[];
  pileCount: number;
  wrappedPile: WrappedPick[];
  events: GameEvent[];
  timer: TimerState;
  mods: Mods;
  actingId: string | null;
  actingName: string | null;
  fate: string | null;
  coin: CoinFace | null;
  pending: PublicPending | null;
  duel: { actorName: string; targetName: string; youNeedPick: boolean } | null;
  you: YouView | null;
  actingMoves: ActingMoves | null;
  hostPinRequired: boolean;
  clerkOpen: boolean;
  clerk: ClerkView | null;
}

export interface WrappedPick {
  id: string;
  broughtByName: string;
}

export interface ActingMoves {
  playerId: string;
  name: string;
  canUnwrap: boolean;
  unwrapTargets: WrappedPick[];
  stealTargets: Array<{ id: string; name: string; giftLabel: string }>;
  canPass: boolean;
  rotate: "left" | "right" | null;
}

export interface ClerkView {
  gifts: Array<{ id: string; label: string; holderName: string | null; opened: boolean; steals: number }>;
  turnOrder: Array<{ id: string; name: string }>;
  chainLength: number;
}

export interface SessionInfo {
  token: string;
  role: ClientRole;
  playerId?: string;
}
