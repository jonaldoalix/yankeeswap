import type {
  ClientRole,
  GameSnapshot,
  Mods,
  PublicConfig,
  RpsPick,
  SessionInfo,
} from "../../shared/types";

const TOKEN_KEY = "yankeeswap.session";
const BAG_KEY = "yankeeswap.seats";

export interface StoredSession {
  token: string;
  role: ClientRole;
  playerId?: string;
}

export interface SessionResponse {
  session: SessionInfo;
  state: GameSnapshot;
}

type SeatBag = Partial<Record<ClientRole, StoredSession>>;

let activeToken: string | undefined;

export function setActiveToken(token: string | undefined): void {
  activeToken = token;
}

function isSeat(value: unknown): value is StoredSession {
  if (!value || typeof value !== "object") return false;
  const seat = value as StoredSession;
  return Boolean(seat.token && seat.role);
}

function readBag(): SeatBag {
  try {
    const raw = localStorage.getItem(BAG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SeatBag;
      return parsed && typeof parsed === "object" ? parsed : {};
    }
    const legacy = localStorage.getItem(TOKEN_KEY);
    if (!legacy) return {};
    const parsed = JSON.parse(legacy) as StoredSession;
    if (!isSeat(parsed)) return {};
    const bag: SeatBag = { [parsed.role]: parsed };
    localStorage.setItem(BAG_KEY, JSON.stringify(bag));
    return bag;
  } catch {
    return {};
  }
}

function writeBag(bag: SeatBag): void {
  localStorage.setItem(BAG_KEY, JSON.stringify(bag));
  const last = bag.host ?? bag.player ?? bag.spectator;
  if (last) localStorage.setItem(TOKEN_KEY, JSON.stringify(last));
  else localStorage.removeItem(TOKEN_KEY);
}

export function seatFor(role: ClientRole): StoredSession | null {
  const seat = readBag()[role];
  return isSeat(seat) ? seat : null;
}

export function seatForPath(pathname: string): StoredSession | null {
  if (pathname.startsWith("/host")) return seatFor("host");
  if (pathname.startsWith("/play")) return seatFor("player");
  if (pathname.startsWith("/watch")) return seatFor("host") ?? seatFor("spectator");
  return seatFor("host") ?? seatFor("player") ?? seatFor("spectator");
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = activeToken ?? readSession()?.token;
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`/api${path}`, { ...init, headers });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export function readSession(): StoredSession | null {
  if (activeToken) {
    const bag = readBag();
    for (const seat of Object.values(bag)) {
      if (seat?.token === activeToken) return seat;
    }
  }
  if (typeof window === "undefined") return null;
  return seatForPath(window.location.pathname);
}

export function writeSession(session: StoredSession): void {
  const bag = readBag();
  bag[session.role] = session;
  writeBag(bag);
  activeToken = session.token;
}

export function clearSeat(role: ClientRole): void {
  const bag = readBag();
  const dropped = bag[role];
  delete bag[role];
  writeBag(bag);
  if (dropped && activeToken === dropped.token) activeToken = undefined;
}

export function clearSession(): void {
  localStorage.removeItem(BAG_KEY);
  localStorage.removeItem(TOKEN_KEY);
  activeToken = undefined;
}

export function getConfig(): Promise<PublicConfig> {
  return api<PublicConfig>("/config");
}

export function getState(): Promise<GameSnapshot> {
  return api<GameSnapshot>("/state");
}

export function claimHost(pin?: string): Promise<SessionResponse> {
  return api<SessionResponse>("/session/host", {
    method: "POST",
    body: JSON.stringify({ pin: pin || undefined }),
  });
}

export function joinPlayer(input: {
  joinCode: string;
  name: string;
  gift: string;
}): Promise<SessionResponse> {
  return api<SessionResponse>("/session/join", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function spectate(joinCode: string): Promise<SessionResponse> {
  return api<SessionResponse>("/session/spectate", {
    method: "POST",
    body: JSON.stringify({ joinCode }),
  });
}

export function addPlayer(input: { name: string; gift: string }): Promise<GameSnapshot> {
  return api<GameSnapshot>("/players", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function removePlayer(id: string): Promise<GameSnapshot> {
  return api<GameSnapshot>(`/players/${id}`, { method: "DELETE" });
}

export function shuffleOrder(): Promise<GameSnapshot> {
  return api<GameSnapshot>("/order/shuffle", { method: "POST" });
}

export function assignOrder(playerIds: string[]): Promise<GameSnapshot> {
  return api<GameSnapshot>("/order/assign", {
    method: "POST",
    body: JSON.stringify({ playerIds }),
  });
}

export function startGame(): Promise<GameSnapshot> {
  return api<GameSnapshot>("/game/start", { method: "POST" });
}

export function recordForActing(input: {
  kind: "unwrap" | "steal" | "pass" | "rotate";
  targetId?: string;
  giftId?: string;
  direction?: "left" | "right";
}): Promise<GameSnapshot> {
  return api<GameSnapshot>("/play/for", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function unwrapGift(giftId?: string): Promise<GameSnapshot> {
  return api<GameSnapshot>("/play/unwrap", {
    method: "POST",
    body: JSON.stringify({ giftId }),
  });
}

export function stealGift(targetId: string): Promise<GameSnapshot> {
  return api<GameSnapshot>("/play/steal", {
    method: "POST",
    body: JSON.stringify({ targetId }),
  });
}

export function passClosing(): Promise<GameSnapshot> {
  return api<GameSnapshot>("/play/pass", { method: "POST" });
}

export function armShield(): Promise<GameSnapshot> {
  return api<GameSnapshot>("/play/shield", { method: "POST" });
}

export function duelPick(pick: RpsPick): Promise<GameSnapshot> {
  return api<GameSnapshot>("/play/duel", {
    method: "POST",
    body: JSON.stringify({ pick }),
  });
}

export function rotateGifts(direction: "left" | "right"): Promise<GameSnapshot> {
  return api<GameSnapshot>("/play/rotate", {
    method: "POST",
    body: JSON.stringify({ direction }),
  });
}

export function resolvePending(decision: "allow" | "veto"): Promise<GameSnapshot> {
  return api<GameSnapshot>("/pending", {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

export function setClerk(open: boolean): Promise<GameSnapshot> {
  return api<GameSnapshot>("/clerk", {
    method: "POST",
    body: JSON.stringify({ open }),
  });
}

export function addSpare(label: string): Promise<GameSnapshot> {
  return api<GameSnapshot>("/spare", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export function controlTimer(action: "start" | "pause" | "reset"): Promise<GameSnapshot> {
  return api<GameSnapshot>("/timer", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function addNote(message: string): Promise<GameSnapshot> {
  return api<GameSnapshot>("/notes", {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export function patchConfig(input: {
  eventLabel: string;
  timerSeconds: number;
  mods: Mods;
}): Promise<GameSnapshot> {
  return api<GameSnapshot>("/config", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function resetTable(): Promise<GameSnapshot> {
  return api<GameSnapshot>("/reset", { method: "POST" });
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
