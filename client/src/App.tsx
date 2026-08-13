import { FormEvent, useEffect, useState } from "react";
import type { GameSnapshot, PublicConfig } from "../../shared/types";
import { HostDesk } from "./HostDesk";
import { PlayerSeat } from "./PlayerSeat";
import { SpectatorBoard } from "./SpectatorBoard";
import { SetupDialog, type SetupTab } from "./SetupDialog";
import * as api from "./api";

type Gate = "home" | "host" | "play" | "watch";

function gateFromPath(pathname: string): Gate {
  if (pathname.startsWith("/host")) return "host";
  if (pathname.startsWith("/play")) return "play";
  if (pathname.startsWith("/watch")) return "watch";
  return "home";
}

function go(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function seatMatchesGate(session: api.StoredSession, gate: Gate): boolean {
  if (gate === "host") return session.role === "host";
  if (gate === "play") return session.role === "player";
  if (gate === "watch") return session.role === "spectator" || session.role === "host";
  return false;
}

export function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [state, setState] = useState<GameSnapshot | null>(null);
  const [gate, setGate] = useState<Gate>(() =>
    typeof window === "undefined" ? "home" : gateFromPath(window.location.pathname),
  );
  const [session, setSession] = useState<api.StoredSession | null>(() =>
    typeof window === "undefined" ? null : api.seatForPath(window.location.pathname),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupTab, setSetupTab] = useState<SetupTab>("host");
  const [pin, setPin] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerGift, setPlayerGift] = useState("");

  function openSetup(tab: SetupTab) {
    setSetupTab(tab);
    setSetupOpen(true);
  }

  const seated = Boolean(session && state && seatMatchesGate(session, gate));

  useEffect(() => {
    const onPop = () => {
      const nextGate = gateFromPath(window.location.pathname);
      setGate(nextGate);
      if (nextGate !== "home") {
        setSession(api.seatForPath(window.location.pathname));
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    api.setActiveToken(session?.token);
  }, [session]);

  useEffect(() => {
    document.body.classList.toggle("locked", seated);
    return () => document.body.classList.remove("locked");
  }, [seated]);

  useEffect(() => {
    void api
      .getConfig()
      .then((cfg) => {
        setConfig(cfg);
        setJoinCode((current) => current || cfg.joinCode);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not load config");
      });
  }, []);

  useEffect(() => {
    if (!session) {
      setState(null);
      return;
    }
    let cancelled = false;
    void api
      .getState()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) {
          if (session.role) api.clearSeat(session.role);
          setSession(null);
        }
      });
    const stream = new EventSource(`/api/stream?access_token=${encodeURIComponent(session.token)}`);
    stream.addEventListener("state", () => {
      void api.getState().then((next) => {
        if (!cancelled) setState(next);
      });
    });
    stream.onerror = () => {
      stream.close();
    };
    return () => {
      cancelled = true;
      stream.close();
    };
  }, [session]);

  function remember(next: api.SessionResponse, path: string) {
    const stored = {
      token: next.session.token,
      role: next.session.role,
      playerId: next.session.playerId,
    };
    api.writeSession(stored);
    setSession(stored);
    setState(next.state);
    setError(null);
    go(path);
  }

  function leave() {
    if (session) api.clearSeat(session.role);
    api.setActiveToken(undefined);
    setSession(null);
    setState(null);
    go("/");
  }

  function resume(seat: api.StoredSession, path: string) {
    api.setActiveToken(seat.token);
    setSession(seat);
    setError(null);
    go(path);
  }

  async function onHost(event: FormEvent) {
    event.preventDefault();
    const existing = api.seatFor("host");
    if (existing) {
      resume(existing, "/host");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      remember(await api.claimHost(pin), "/host");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim host");
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      remember(
        await api.joinPlayer({
          joinCode,
          name: playerName,
          gift: playerGift,
        }),
        "/play",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
    } finally {
      setBusy(false);
    }
  }

  async function onWatch(event: FormEvent) {
    event.preventDefault();
    const existing = api.seatFor("host") ?? api.seatFor("spectator");
    if (existing) {
      resume(existing, "/watch");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      remember(await api.spectate(joinCode), "/watch");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not spectate");
    } finally {
      setBusy(false);
    }
  }

  const museum = Boolean(config?.museumMode || state?.museumMode);

  return (
    <div className={seated ? `app-live app-live-${session?.role}` : "app-gate"}>
      {museum ? (
        <div className={seated ? "museum-banner museum-compact" : "museum-banner"}>
          <strong>Museum demo</strong>
          {seated ? null : (
            <p className="museum-banner-note">
              Public sandbox — stubbed, noindex, reset anytime. Not a live family party.
            </p>
          )}
          <button type="button" className="museum-banner-action" onClick={() => openSetup("run")}>
            How to run this
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="status error live-error" role="alert">
          {error}
        </p>
      ) : null}

      {seated && gate === "host" && session?.role === "host" && state ? (
        <HostDesk
          state={state}
          busy={busy}
          onState={setState}
          onError={(message) => setError(message || null)}
          onBusy={setBusy}
          onLeave={leave}
          onOpenSetup={() => openSetup("host")}
        />
      ) : null}

      {seated && gate === "play" && session?.role === "player" && state ? (
        <PlayerSeat
          state={state}
          busy={busy}
          onState={setState}
          onError={(message) => setError(message || null)}
          onBusy={setBusy}
          onLeave={leave}
          onOpenSetup={() => openSetup("game")}
        />
      ) : null}

      {seated && gate === "watch" && state ? (
        <SpectatorBoard state={state} onOpenSetup={() => openSetup("game")} />
      ) : null}

      {!seated ? (
        <div className="shell">
          <header className="hero">
            <p className="kicker">White elephant · party auction</p>
            <h1 className="brand">{config?.eventLabel || "Yankee Swap"}</h1>
            <p className="lede">
              Digital Yankee Swap: bring a wrapped gift, get dealt a place in
              line, then take from the pile or steal an opened one. The host can
              veto; otherwise it goes through. Thirteen optional mods. Host desk,
              TV pile, a seat in every pocket.
            </p>
            <div className="meta">
              <span className="chip">Code {config?.joinCode || "—"}</span>
              <span className="chip">{config?.playerCount ?? 0} seated</span>
              <button type="button" className="chip chip-action" onClick={() => openSetup("host")}>
                Playbook
              </button>
            </div>
          </header>

          <section className="panel doors">
            <h2>Pick a door</h2>
            <p className="panel-intro">
              Host runs the clerk. Players join with a private contribution.
              Spectators get the TV board — kitchen, hallway, or the big screen.
            </p>
            <div className="door-grid">
              <form className="door" onSubmit={onHost}>
                <p className="door-kicker">Host desk</p>
                <h3>Run the night</h3>
                <p>Shuffle order, start the night, and veto only if you must.</p>
                {config?.hostPinRequired ? (
                  <label>
                    Host PIN
                    <input
                      type="password"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      autoComplete="off"
                    />
                  </label>
                ) : (
                  <p className="hint">Open host on this instance.</p>
                )}
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Open host desk
                </button>
              </form>

              <form className="door" onSubmit={onJoin}>
                <p className="door-kicker">Player seat</p>
                <h3>Join the pile</h3>
                <p>Your gift stays on this phone until you unwrap or someone steals it open.</p>
                <label>
                  Join code
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    required
                  />
                </label>
                <label>
                  Name
                  <input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    required
                  />
                </label>
                <label>
                  What you brought
                  <input
                    type="password"
                    autoComplete="off"
                    value={playerGift}
                    onChange={(e) => setPlayerGift(e.target.value)}
                    required
                  />
                </label>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  Take a seat
                </button>
              </form>

              <form className="door" onSubmit={onWatch}>
                <p className="door-kicker">Spectator</p>
                <h3>Watch the pile</h3>
                <p>TV mode. No secrets, no controls — just the auction floor.</p>
                <label>
                  Join code
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    required
                  />
                </label>
                <button type="submit" className="btn btn-secondary" disabled={busy}>
                  Open the board
                </button>
              </form>
            </div>
          </section>
        </div>
      ) : null}

      <SetupDialog
        open={setupOpen}
        tab={setupTab}
        config={config}
        onTabChange={setSetupTab}
        onClose={() => setSetupOpen(false)}
      />
    </div>
  );
}
