import { useState } from "react";
import type { GameSnapshot, RpsPick } from "../../shared/types";
import { StickHistory } from "./EventLog";
import { RoundCue, WrappedMid, pileColumns, whoseGift } from "./RoundCue";
import * as api from "./api";

type Props = {
  state: GameSnapshot;
  busy: boolean;
  onState: (state: GameSnapshot) => void;
  onError: (error: string) => void;
  onBusy: (busy: boolean) => void;
  onLeave: () => void;
  onOpenSetup: () => void;
};

export function PlayerSeat({
  state,
  busy,
  onState,
  onError,
  onBusy,
  onLeave,
  onOpenSetup,
}: Props) {
  const [targetId, setTargetId] = useState("");
  const [unwrapGiftId, setUnwrapGiftId] = useState("");
  const you = state.you;
  const stealTargets = state.players.filter(
    (p) => p.id !== you?.id && p.giftLabel !== "—" && p.giftLabel !== "Wrapped",
  );
  const unwrapTargets = state.wrappedPile;
  const pickedUnwrap =
    unwrapGiftId || (unwrapTargets.length === 1 ? unwrapTargets[0]!.id : "");
  const clockOn = state.mods.turnClock && state.phase !== "lobby" && state.phase !== "done";
  const cols = pileColumns(state.players.length);

  function act(work: () => Promise<GameSnapshot>) {
    onBusy(true);
    onError("");
    void work()
      .then(onState)
      .catch((err: unknown) => {
        onError(err instanceof Error ? err.message : "Request failed");
      })
      .finally(() => onBusy(false));
  }

  function onSteal() {
    const target = targetId || stealTargets[0]?.id;
    if (!target) {
      onError("Pick someone to steal from.");
      return;
    }
    const name = state.players.find((p) => p.id === target)?.name ?? "them";
    const trading = state.phase === "closing";
    if (
      !confirm(
        trading
          ? `Trade with ${name}? They keep what you have now.`
          : `Steal from ${name}?`,
      )
    )
      return;
    act(() => api.stealGift(target));
  }

  return (
    <div className="play-frame">
      <header className="desk-chrome">
        <div>
          <p className="kicker">Your seat</p>
          <strong>{you ? you.name : "Waiting"}</strong>
        </div>
        {clockOn ? (
          <p className={state.timer.running ? "timer-face play-timer is-live" : "timer-face play-timer"}>
            {api.formatClock(state.timer.remainingSeconds)}
          </p>
        ) : (
          <p className="play-phase-tag">{state.phaseTitle}</p>
        )}
        <div className="desk-chrome-actions">
          <button type="button" className="chip chip-action" onClick={onOpenSetup}>
            Rules
          </button>
          <button type="button" className="chip chip-action chip-guide" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <section className="play-cue">
        {clockOn ? <p className="kicker">{state.phaseTitle}</p> : null}
        <RoundCue state={state} />
        {you ? (
          <div className="gift-secret">
            <p>
              {you.gift
                ? you.giftPublic
                  ? you.broughtHolder && you.broughtHolder !== you.name
                    ? `You brought ${you.gift} — ${you.broughtHolder} has it.`
                    : `You brought ${you.gift}.`
                  : `You brought ${you.gift} — still wrapped to the room.`
                : "You have not seated a gift."}
            </p>
            <p>
              {you.holding
                ? you.holding === you.gift
                  ? "You are holding it."
                  : `You hold ${you.holding}.`
                : "Empty hands."}
            </p>
          </div>
        ) : null}
      </section>

      {state.duel?.youNeedPick ? (
        <div className="play-signal">
          <div className="play-signal-row">
            {(["rock", "paper", "scissors"] as RpsPick[]).map((pick) => (
              <button
                key={pick}
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => act(() => api.duelPick(pick))}
              >
                {pick}
              </button>
            ))}
          </div>
        </div>
      ) : you?.isActing && !state.pending ? (
        <div className="play-signal">
          <div className="play-signal-row">
            {you.canUnwrap ? (
              <>
                <label>
                  Open whose gift
                  <select
                    value={pickedUnwrap}
                    onChange={(e) => setUnwrapGiftId(e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {unwrapTargets.map((gift) => (
                      <option key={gift.id} value={gift.id}>
                        {whoseGift(gift.broughtByName)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !pickedUnwrap}
                  onClick={() => {
                    const gift = unwrapTargets.find((item) => item.id === pickedUnwrap);
                    if (!gift) {
                      onError("Pick whose gift was opened.");
                      return;
                    }
                    if (!confirm(`Open ${whoseGift(gift.broughtByName)}?`)) return;
                    act(() => api.unwrapGift(pickedUnwrap));
                  }}
                >
                  Open it
                </button>
              </>
            ) : null}
            {you.canSteal ? (
              <>
                <label>
                  {state.phase === "closing" ? "Trade with" : "Steal from"}
                  <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                    <option value="">Choose…</option>
                    {stealTargets.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.name} · {player.giftLabel}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={onSteal}>
                  {state.phase === "closing" ? "Trade" : "Steal"}
                </button>
              </>
            ) : null}
            {state.phase === "closing" ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => act(() => api.passClosing())}
              >
                Keep mine
              </button>
            ) : null}
            {state.fate === "pass-left" || state.fate === "pass-right" ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() =>
                  act(() => api.rotateGifts(state.fate === "pass-right" ? "right" : "left"))
                }
              >
                Pass {state.fate === "pass-right" ? "right" : "left"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {you?.shieldAvailable ? (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy || !you.holding}
          onClick={() => act(() => api.armShield())}
        >
          Arm shield
        </button>
      ) : null}

      <div className="play-board">
        {state.wrappedPile.length > 0 ? (
          <section className="play-mid" aria-label="Still wrapped in the middle">
            <p className="kicker">In the middle</p>
            <WrappedMid gifts={state.wrappedPile} />
          </section>
        ) : null}
        <ul
          className="play-pile"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {state.players.map((player) => (
            <li
              key={player.id}
              className={[player.id === you?.id ? "you" : "", player.isActing ? "is-actor" : ""]
                .filter(Boolean)
                .join(" ")}
            >
              <strong>
                {player.turn ? `#${player.turn} ` : ""}
                {player.name}
              </strong>
              <span>{player.giftLabel === "—" ? "Empty hands" : player.giftLabel}</span>
            </li>
          ))}
        </ul>
      </div>

      <section className="play-history" aria-label="History">
        <header className="watch-pane-head">
          <p className="kicker">History</p>
          <h2>{state.events.length === 0 ? "No moves yet" : `${state.events.length} so far`}</h2>
        </header>
        <StickHistory events={state.events} empty="Waiting for the first move." />
      </section>
    </div>
  );
}
