import type { GameSnapshot, PublicPlayer } from "../../shared/types";
import { activeHouseRules } from "../../shared/mods";
import { WatchLog } from "./EventLog";
import { PingPong } from "./PingPong";
import { RoundCue, pileColumns, whoseGift } from "./RoundCue";
import * as api from "./api";

type Props = {
  state: GameSnapshot;
  onOpenSetup: () => void;
};

function orderedSeats(state: GameSnapshot): PublicPlayer[] {
  return [...state.players].sort((left, right) => {
    if (left.turn == null && right.turn == null) return 0;
    if (left.turn == null) return 1;
    if (right.turn == null) return -1;
    return left.turn - right.turn;
  });
}

function primer(state: GameSnapshot): string {
  if (state.phase === "lobby") {
    return "Everyone brings a wrapped gift. The host shuffles the order — nobody picks their place in line.";
  }
  if (state.phase === "closing") {
    return "The pile is empty. First player may trade for one opened gift — they swap, nobody goes empty-handed — or keep what they have.";
  }
  if (state.phase === "done") {
    return "The pile is closed. That is what everyone went home with.";
  }
  if (state.mods.gentle) {
    return "Gentle night: take a wrapped gift from the middle. No stealing.";
  }
  return "On a turn: open a wrapped gift from the middle, or steal one that is already open. If yours is taken, you go again.";
}

function heldCopy(player: PublicPlayer): string {
  if (player.giftLabel === "—") return "Empty hands";
  return player.giftLabel;
}

export function SpectatorBoard({ state, onOpenSetup }: Props) {
  const seats = orderedSeats(state);
  const cols = pileColumns(seats.length);
  const rules = activeHouseRules(state.mods);
  const clockOn = state.mods.turnClock && state.phase !== "lobby" && state.phase !== "done";

  const emptyPile = state.wrappedPile.length === 0;
  return (
    <div className={emptyPile ? "watch-frame pile-gone" : "watch-frame"}>
      <header className="watch-chrome">
        <div className="watch-round">
          <p className="kicker">{state.eventLabel}</p>
          <h1>{state.phaseTitle}</h1>
          <RoundCue state={state} />
          {state.phase === "done" ? null : <p className="watch-primer">{primer(state)}</p>}
        </div>
        <div className="watch-chrome-metrics">
          {clockOn ? (
            <p className={state.timer.running ? "timer-face watch-timer is-live" : "timer-face watch-timer"}>
              {api.formatClock(state.timer.remainingSeconds)}
            </p>
          ) : null}
          <p className="join-ticket">
            Join <strong>{state.joinCode}</strong>
          </p>
        </div>
        <div className="watch-chrome-side">
          <button type="button" className="chip chip-action" onClick={onOpenSetup}>
            Playbook
          </button>
        </div>
        {rules.length > 0 ? (
          <ul className="watch-rules" aria-label="House rules tonight">
            {rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
            {state.fate ? <li>Fate · {state.fate.replace("-", " ")}</li> : null}
            {state.coin ? <li>Coin · {state.coin}</li> : null}
          </ul>
        ) : (
          <p className="watch-rules-empty">Straight swap — no extra house rules.</p>
        )}
      </header>

      <div className="watch-stage">
        <section className="watch-middle" aria-label="The middle of the table">
        <header className="watch-pane-head">
          <p className="kicker">In the middle</p>
          <h2>
            {state.wrappedPile.length === 0
              ? "Pile is empty"
              : `${state.wrappedPile.length} still wrapped`}
          </h2>
        </header>
        {state.wrappedPile.length === 0 ? (
          <p className="watch-middle-empty">
            {state.phase === "lobby"
              ? "Gifts land here once the night starts."
              : state.phase === "done"
                ? "Everyone has what they are going home with."
                : state.phase === "closing"
                  ? "Nothing left to open. First player may trade for one opened gift, or keep it."
                  : "Nothing left to open. Steal an opened gift, or the next person unwraps."}
          </p>
        ) : (
          <ul
            className="watch-middle-pile"
            style={{ gridTemplateColumns: `repeat(${pileColumns(state.wrappedPile.length)}, minmax(0, 1fr))` }}
          >
            {state.wrappedPile.map((gift) => (
              <li key={gift.id}>
                <span className="parcel-number">Wrapped</span>
                <strong>{whoseGift(gift.broughtByName)}</strong>
                <span>Contents stay secret until someone opens it.</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="watch-seats" aria-label="Seats">
        <header className="watch-pane-head">
          <p className="kicker">The room</p>
          <h2>
            {seats.length} seated
            {state.phase !== "done" && state.actingName ? ` · ${state.actingName} is up` : ""}
          </h2>
        </header>
        <ul
          className="watch-pile"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {seats.length === 0 ? (
            <li className="watch-empty">Waiting for people to sit.</li>
          ) : (
            seats.map((player) => (
              <li
                key={player.id}
                className={[
                  "parcel",
                  player.isActing ? "is-actor" : "",
                  player.giftLabel === "—" ? "is-empty" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="parcel-number">
                  {player.turn ? `#${player.turn}` : "—"}
                  {player.isActing ? " · up" : ""}
                </span>
                <strong>{player.name}</strong>
                <span className="parcel-gift">{heldCopy(player)}</span>
                {player.frozen || player.shieldArmed ? (
                  <span className="parcel-flags">
                    {player.frozen ? "Frozen" : ""}
                    {player.frozen && player.shieldArmed ? " · " : ""}
                    {player.shieldArmed ? "Shield" : ""}
                  </span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
      </div>

      <aside className="watch-rail">
        <section className="watch-order" aria-label="Turn order">
          <header className="watch-pane-head">
            <p className="kicker">Line</p>
            <h2>Turn order</h2>
          </header>
          {seats.every((player) => player.turn == null) ? (
            <p className="empty">Not dealt yet. Host will shuffle, then start.</p>
          ) : (
            <PingPong
              measureKey={seats
                .map((player) => `${player.id}:${player.turn}:${player.giftLabel}:${player.isActing}`)
                .join("|")}
            >
              <ol>
                {seats.map((player) => (
                  <li key={player.id} className={player.isActing ? "is-actor" : undefined}>
                    <span>{player.turn ?? "—"}</span>
                    <strong>{player.name}</strong>
                    <em>{state.phase !== "done" && player.isActing ? "up" : heldCopy(player)}</em>
                  </li>
                ))}
              </ol>
            </PingPong>
          )}
        </section>
        <WatchLog events={state.events} />
      </aside>
    </div>
  );
}
