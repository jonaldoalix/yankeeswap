import { FormEvent, useEffect, useState } from "react";
import { MOD_KNOBS, MOD_TOGGLES } from "../../shared/mods";
import type { GameSnapshot, Mods } from "../../shared/types";
import { EventLog } from "./EventLog";
import { RoundCue, whoseGift } from "./RoundCue";
import * as api from "./api";

type Bench = "mods" | "seat" | "table";

type Props = {
  state: GameSnapshot;
  busy: boolean;
  onState: (state: GameSnapshot) => void;
  onError: (error: string) => void;
  onBusy: (busy: boolean) => void;
  onLeave: () => void;
  onOpenSetup: () => void;
};

async function run(
  work: () => Promise<GameSnapshot>,
  onState: (state: GameSnapshot) => void,
  onError: (error: string) => void,
  onBusy: (busy: boolean) => void,
): Promise<void> {
  onBusy(true);
  onError("");
  try {
    onState(await work());
  } catch (err) {
    onError(err instanceof Error ? err.message : "Request failed");
  } finally {
    onBusy(false);
  }
}

function stealNote(state: GameSnapshot, playerName: string): string {
  const gift = state.clerk?.gifts.find((item) => item.holderName === playerName);
  if (!gift || gift.steals < 1) return "";
  return ` · ${gift.steals} ${gift.steals === 1 ? "steal" : "steals"}`;
}

export function HostDesk({
  state,
  busy,
  onState,
  onError,
  onBusy,
  onLeave,
  onOpenSetup,
}: Props) {
  const [bench, setBench] = useState<Bench>("mods");
  const [name, setName] = useState("");
  const [gift, setGift] = useState("");
  const [spare, setSpare] = useState("");
  const [note, setNote] = useState("");
  const [eventLabel, setEventLabel] = useState(state.eventLabel);
  const [timerSeconds, setTimerSeconds] = useState(String(state.timer.durationSeconds));
  const [mods, setMods] = useState<Mods>(state.mods);
  const [stealTarget, setStealTarget] = useState("");
  const [unwrapGiftId, setUnwrapGiftId] = useState("");

  useEffect(() => {
    if (bench !== "table" && bench !== "mods") return;
    setEventLabel(state.eventLabel);
    setTimerSeconds(String(state.timer.durationSeconds));
    setMods(state.mods);
  }, [bench, state.eventLabel, state.timer.durationSeconds, state.mods]);

  useEffect(() => {
    setStealTarget("");
    setUnwrapGiftId("");
  }, [state.actingMoves?.playerId]);

  const players = state.players;
  const clerk = state.clerkOpen;
  const order = state.clerk?.turnOrder ?? [];
  const locked = state.phase !== "lobby";
  const unwrapTargets = state.actingMoves?.unwrapTargets ?? [];
  const pickedUnwrap =
    unwrapGiftId || (unwrapTargets.length === 1 ? unwrapTargets[0]!.id : "");

  function go(work: () => Promise<GameSnapshot>) {
    void run(work, onState, onError, onBusy);
  }

  function onAdd(event: FormEvent) {
    event.preventDefault();
    go(async () => {
      const next = await api.addPlayer({ name, gift });
      setName("");
      setGift("");
      return next;
    });
  }

  function onSettings(event: FormEvent) {
    event.preventDefault();
    go(() =>
      api.patchConfig({
        eventLabel,
        timerSeconds: Number(timerSeconds),
        mods,
      }),
    );
  }

  function toggleMod<K extends keyof Mods>(key: K, value: Mods[K]) {
    setMods((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className={clerk ? "host-frame clerk-open" : "host-frame host-fog"}>
      <header className="desk-chrome">
        <div>
          <p className="kicker">Host desk</p>
          <strong>{state.eventLabel}</strong>
        </div>
        <span className="join-ticket">
          Join <strong>{state.joinCode}</strong>
        </span>
        <div className="desk-chrome-actions">
          <button
            type="button"
            className={clerk ? "chip chip-action chip-on" : "chip chip-action"}
            disabled={busy}
            onClick={() => go(() => api.setClerk(!clerk))}
          >
            {clerk ? "Hide clerk" : "Show clerk"}
          </button>
          <button type="button" className="chip chip-action" onClick={onOpenSetup}>
            Playbook
          </button>
          <button type="button" className="chip chip-action chip-guide" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <div className="host-grid">
        <section className="desk-pane desk-now">
          <header className="pane-head">
            <div>
              <p className="kicker">Now</p>
              <h2>{state.phaseTitle}</h2>
            </div>
            <p className="timer-face desk-timer">{api.formatClock(state.timer.remainingSeconds)}</p>
          </header>
          <RoundCue state={state} />
          {state.actingMoves ? (
            <div className="host-record">
              <p className="host-record-label">Record for {state.actingMoves.name}</p>
              <div className="host-record-row">
                {state.actingMoves.canUnwrap ? (
                  <>
                    <label className="host-record-steal">
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
                      className="btn btn-primary btn-sm"
                      disabled={busy || !pickedUnwrap}
                      onClick={() =>
                        go(() => api.recordForActing({ kind: "unwrap", giftId: pickedUnwrap }))
                      }
                    >
                      Open it
                    </button>
                  </>
                ) : null}
                {state.actingMoves.stealTargets.length > 0 ? (
                  <>
                    <label className="host-record-steal">
                      {state.phase === "closing" ? "Trade with" : "Steal from"}
                      <select
                        value={stealTarget}
                        onChange={(e) => setStealTarget(e.target.value)}
                      >
                        <option value="">Choose…</option>
                        {state.actingMoves.stealTargets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.name} · {target.giftLabel}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy || !stealTarget}
                      onClick={() =>
                        go(() => api.recordForActing({ kind: "steal", targetId: stealTarget }))
                      }
                    >
                      {state.phase === "closing" ? "Trade" : "Steal"}
                    </button>
                  </>
                ) : null}
                {state.actingMoves.canPass ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => go(() => api.recordForActing({ kind: "pass" }))}
                  >
                    Keep mine
                  </button>
                ) : null}
                {state.actingMoves.rotate ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() =>
                      go(() =>
                        api.recordForActing({
                          kind: "rotate",
                          direction: state.actingMoves!.rotate!,
                        }),
                      )
                    }
                  >
                    Pass {state.actingMoves.rotate}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {state.pending && clerk ? (
            <div className="cue-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => go(() => api.resolvePending("allow"))}
              >
                Allow
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => go(() => api.resolvePending("veto"))}
              >
                Stop it
              </button>
            </div>
          ) : null}
          <div className="desk-now-tools">
            <div className="timer-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => go(() => api.controlTimer("start"))}
              >
                Start
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={() => go(() => api.controlTimer("pause"))}
              >
                Pause
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => go(() => api.controlTimer("reset"))}
              >
                Reset
              </button>
            </div>
            {state.phase === "lobby" ? (
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || players.length < 1}
                  onClick={() => go(() => api.shuffleOrder())}
                >
                  Shuffle order
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || players.length < 1}
                  onClick={() => go(() => api.startGame())}
                >
                  Start the swap
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="desk-pane desk-pile">
          <header className="pane-head">
            <h2>Pile</h2>
            <span>
              {players.length} seated · {state.pileCount} still wrapped in the middle
            </span>
          </header>
          {players.length === 0 ? (
            <p className="empty">Seat people, or wait for phones to join.</p>
          ) : (
            <ul className="list pile-list">
              {state.wrappedPile.length > 0 ? (
                <li className="wrapped-mid-row">
                  <div className="pile-pick">
                    <strong>Still wrapped</strong>
                    <span>
                      {state.wrappedPile.map((gift) => whoseGift(gift.broughtByName)).join(" · ")}
                    </span>
                  </div>
                </li>
              ) : null}
              {players.map((player) => (
                <li key={player.id} className={player.isActing ? "is-actor" : undefined}>
                  <div className="pile-pick">
                    <strong>
                      {player.turn ? `#${player.turn} ` : ""}
                      {player.name}
                    </strong>
                    <span>
                      {player.giftLabel}
                      {player.frozen ? " · frozen" : ""}
                      {player.shieldArmed ? " · shield" : ""}
                      {clerk ? stealNote(state, player.name) : ""}
                    </span>
                  </div>
                  {state.phase === "lobby" ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => go(() => api.removePlayer(player.id))}
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="desk-pane desk-feed">
          <header className="pane-head">
            <h2>Tonight</h2>
          </header>
          <form
            className="note-form"
            onSubmit={(event) => {
              event.preventDefault();
              go(async () => {
                const next = await api.addNote(note);
                setNote("");
                return next;
              });
            }}
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Log a note…"
              aria-label="Host note"
            />
            <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !note.trim()}>
              Log
            </button>
          </form>
          <EventLog events={state.events} compact />
        </section>

        {clerk ? (
          <section className="desk-pane desk-clerk">
            <div className="bench-tabs" role="tablist" aria-label="Clerk tools">
              <button
                type="button"
                role="tab"
                aria-selected={bench === "mods"}
                className={bench === "mods" ? "bench-tab active" : "bench-tab"}
                onClick={() => setBench("mods")}
              >
                Mods
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bench === "seat"}
                className={bench === "seat" ? "bench-tab active" : "bench-tab"}
                onClick={() => setBench("seat")}
              >
                Seat
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={bench === "table"}
                className={bench === "table" ? "bench-tab active" : "bench-tab"}
                onClick={() => setBench("table")}
              >
                Table
              </button>
            </div>

            {bench === "mods" ? (
              <form className="clerk-form" onSubmit={onSettings}>
                <p className="clerk-help">
                  {locked
                    ? "Mods are locked for this night. Reset the table to change them."
                    : "Choose the house rules before you start. Gift names stay hidden."}
                </p>
                <p className="clerk-order" role="status">
                  {order.length > 0
                    ? `Turn order: ${order.map((player, index) => `${index + 1}. ${player.name}`).join(" · ")}`
                    : "Turn order is not dealt yet. Shuffle, or start and the table will shuffle."}
                </p>
                <div className="mod-knobs">
                  {MOD_KNOBS.map((knob) => (
                    <label key={knob.key} className="mod-knob">
                      <span className="mod-knob-label">{knob.label}</span>
                      <select
                        value={mods[knob.key]}
                        disabled={locked}
                        onChange={(e) =>
                          toggleMod(
                            knob.key,
                            Number(e.target.value) as Mods[typeof knob.key],
                          )
                        }
                      >
                        {knob.key === "freezeAfter" ? (
                          <>
                            <option value={0}>Off</option>
                            <option value={2}>2 steals</option>
                            <option value={3}>3 steals</option>
                          </>
                        ) : (
                          <>
                            <option value={0}>Off</option>
                            <option value={2}>2 hops</option>
                            <option value={3}>3 hops</option>
                            <option value={4}>4 hops</option>
                          </>
                        )}
                      </select>
                      <span className="mod-blurb">{knob.blurb}</span>
                    </label>
                  ))}
                </div>
                <div className="mod-toggles">
                  {MOD_TOGGLES.map((item) => (
                    <label key={item.key} className="mod-item">
                      <input
                        type="checkbox"
                        checked={Boolean(mods[item.key])}
                        disabled={locked}
                        onChange={(e) => toggleMod(item.key, e.target.checked)}
                      />
                      <strong>{item.label}</strong>
                      <span className="mod-blurb">{item.blurb}</span>
                    </label>
                  ))}
                </div>
                <div className="clerk-actions">
                  <button type="submit" className="btn btn-primary" disabled={busy || locked}>
                    Save mods
                  </button>
                </div>
              </form>
            ) : null}

            {bench === "seat" ? (
              <form className="clerk-form clerk-seat" onSubmit={onAdd}>
                <p className="clerk-help">
                  Add a guest who is not joining from a phone. Their gift stays wrapped until it is
                  opened in play.
                </p>
                <div className="add-fields clerk-fields">
                  <label>
                    Name
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      disabled={locked}
                    />
                  </label>
                  <label>
                    Brought
                    <input
                      type="password"
                      autoComplete="off"
                      value={gift}
                      onChange={(e) => setGift(e.target.value)}
                      required
                      disabled={locked}
                    />
                  </label>
                  <button type="submit" className="btn btn-primary" disabled={busy || locked}>
                    Seat them
                  </button>
                </div>
                {state.mods.spareGift ? (
                  <div className="add-fields clerk-fields">
                    <label>
                      Spare wrapped gift
                      <input value={spare} onChange={(e) => setSpare(e.target.value)} />
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy || !spare.trim()}
                      onClick={() =>
                        go(async () => {
                          const next = await api.addSpare(spare);
                          setSpare("");
                          return next;
                        })
                      }
                    >
                      Add spare
                    </button>
                  </div>
                ) : null}
                {state.mods.rotate || state.fate === "pass-left" || state.fate === "pass-right" ? (
                  <div className="timer-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => go(() => api.rotateGifts("left"))}
                    >
                      Rotate left
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => go(() => api.rotateGifts("right"))}
                    >
                      Rotate right
                    </button>
                  </div>
                ) : null}
              </form>
            ) : null}

            {bench === "table" ? (
              <form className="clerk-form" onSubmit={onSettings}>
                <p className="clerk-help">
                  Event name and the length of the turn clock. To play yourself, open Join on this
                  phone after you claim host.
                </p>
                <div className="add-fields clerk-fields">
                  <label>
                    Label
                    <input value={eventLabel} onChange={(e) => setEventLabel(e.target.value)} />
                  </label>
                  <label>
                    Timer (sec)
                    <input
                      inputMode="numeric"
                      value={timerSeconds}
                      onChange={(e) => setTimerSeconds(e.target.value)}
                    />
                  </label>
                  <div className="actions">
                    <button type="submit" className="btn btn-primary" disabled={busy}>
                      Save table
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => {
                        if (confirm("Reset the table? Players will need to join again.")) {
                          go(() => api.resetTable());
                        }
                      }}
                    >
                      Reset table
                    </button>
                  </div>
                </div>
              </form>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
