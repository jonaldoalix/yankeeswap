import { useEffect, useId, useRef, useState } from "react";
import type { PublicConfig } from "../../shared/types";

export type SetupTab = "host" | "join" | "game" | "run";

type Props = {
  open: boolean;
  tab: SetupTab;
  config: PublicConfig | null;
  onTabChange: (tab: SetupTab) => void;
  onClose: () => void;
};

export function SetupDialog({ open, tab, config, onTabChange, onClose }: Props) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const env = `PORT=1224
MUSEUM_MODE=false
SEED_MUSEUM_DEMO=false
EVENT_LABEL=${config?.eventLabel || "Yankee Swap"}
TIMER_SECONDS=${config?.timerSeconds || 180}
JOIN_CODE=${config?.joinCode || "YANK"}
HOST_PIN=choose-a-pin`;

  return (
    <div className="dialog-root" role="presentation">
      <button
        type="button"
        className="dialog-backdrop"
        aria-label="Close setup guide"
        onClick={onClose}
      />
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header">
          <div>
            <p className="dialog-kicker">Party playbook</p>
            <h2 id={titleId}>How to run the night</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="btn btn-ghost dialog-close"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div className="dialog-tabs" role="tablist" aria-label="Setup topics">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "host"}
            className={tab === "host" ? "dialog-tab active" : "dialog-tab"}
            onClick={() => onTabChange("host")}
          >
            Host
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "join"}
            className={tab === "join" ? "dialog-tab active" : "dialog-tab"}
            onClick={() => onTabChange("join")}
          >
            Join
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "game"}
            className={tab === "game" ? "dialog-tab active" : "dialog-tab"}
            onClick={() => onTabChange("game")}
          >
            The game
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "run"}
            className={tab === "run" ? "dialog-tab active" : "dialog-tab"}
            onClick={() => onTabChange("run")}
          >
            Run for real
          </button>
        </div>

        <div className="dialog-body" role="tabpanel">
          {tab === "host" ? (
            <ol className="setup-steps">
              <li>
                <strong>Open the host desk</strong> on your phone. Put{" "}
                <em>Watch the pile</em> on the TV so the room can follow.
              </li>
              <li>
                <strong>Players join from their phones</strong> with the join code
                {config ? ` (${config.joinCode})` : ""}. They type the gift they
                brought privately — the TV never shows it until unwrap. You do not
                pick places in line.
              </li>
              <li>
                <strong>Shuffle, then start.</strong> On a turn, name whose wrapped
                gift was opened — Ada's, Phillis's — then the room sees what it is.
                Later turns may steal an opened gift instead. You may veto; otherwise
                the move auto-allows in 8 seconds.
              </li>
              <li>
                <strong>Show clerk</strong> only when you need internals: mods, steal
                counts, order, spare gifts. Stay fogged if you are also playing.
              </li>
            </ol>
          ) : null}

          {tab === "join" ? (
            <ol className="setup-steps">
              <li>
                <strong>Player seat.</strong> Enter the join code, your name, and the
                gift you contributed. Only you see that gift until it is opened.
              </li>
              <li>
                <strong>On your turn</strong> pick whose wrapped gift you opened, or
                steal one that is already open. Confirm once. The host can veto;
                default is allow.
              </li>
              <li>
                <strong>Spectator / TV.</strong> Same join code, no gift. Perfect for
                the kitchen, a hallway, or the big screen.
              </li>
              <li>
                <strong>Host who also plays.</strong> Claim host, then join as a
                player from another door. Hide clerk so you do not see wrapped labels.
              </li>
            </ol>
          ) : null}

          {tab === "game" ? (
            <ol className="setup-steps">
              <li>
                <strong>Same game as the living room.</strong> Every screen keeps a
                Now line and a Next line — whose turn, take from the pile or steal,
                who follows.
                You should not need this playbook once people are seated.
              </li>
              <li>
                <strong>Thirteen mods</strong> on the host clerk: Freeze, No revenge,
                First-last, Turn clock, Chain cap, Gentle, Fate, Duel
                (rock-paper-scissors), Shield, Spare gift, Mercy, Coin, Rotate.
                Defaults are Freeze 3, No revenge, First-last, Turn clock.
              </li>
              <li>
                <strong>Make it yours in env.</strong> Event name, timer, join code,
                optional host PIN. Mods are toggled on the host desk before start.
              </li>
              <li>
                <strong>Make it yours in code.</strong> Edit <code>shared/mods.ts</code>{" "}
                and <code>shared/game.ts</code> to add a variation. The three seats
                (host, player, TV) stay.
              </li>
            </ol>
          ) : null}

          {tab === "run" ? (
            <div className="setup-send">
              <p className="setup-status" role="status">
                {config?.museumMode
                  ? "This museum demo is a public sandbox. Reset anytime. Nothing leaves the building."
                  : config?.hostPinRequired
                    ? "This instance requires a host PIN. Keep the party on your LAN or behind your own auth."
                    : "This instance has an open host desk. Anyone who can reach it can run the table."}
              </p>
              <p>
                Copy <code>example.env</code> to <code>.env</code>, set a join code
                and optional host PIN, then restart. The HTTP API is for a trusted
                host — see SECURITY.md.
              </p>
              <pre className="setup-env">{env}</pre>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={async () => {
                  await navigator.clipboard?.writeText(env);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy env recipe"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
