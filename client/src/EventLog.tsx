import { useLayoutEffect, useRef } from "react";
import type { GameSnapshot } from "../../shared/types";

function chronological(events: GameSnapshot["events"]): GameSnapshot["events"] {
  return [...events].reverse();
}

export function EventLog({
  events,
  compact = false,
}: {
  events: GameSnapshot["events"];
  compact?: boolean;
}) {
  if (events.length === 0) {
    return <p className="empty">Quiet so far.</p>;
  }
  return (
    <ol className={compact ? "log log-compact" : "log"}>
      {events.map((event) => (
        <li key={event.id}>{event.message}</li>
      ))}
    </ol>
  );
}

export function StickHistory({
  events,
  empty,
}: {
  events: GameSnapshot["events"];
  empty: string;
}) {
  const scroller = useRef<HTMLOListElement>(null);
  const ordered = chronological(events);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events]);

  if (ordered.length === 0) {
    return <p className="empty">{empty}</p>;
  }

  return (
    <ol ref={scroller} className="log log-compact">
      {ordered.map((event) => (
        <li key={event.id}>{event.message}</li>
      ))}
    </ol>
  );
}

export function WatchLog({ events }: { events: GameSnapshot["events"] }) {
  return (
    <section className="watch-log" aria-label="History">
      <header className="watch-pane-head">
        <p className="kicker">History</p>
        <h2>{events.length === 0 ? "No moves yet" : `${events.length} so far`}</h2>
      </header>
      <StickHistory events={events} empty="Waiting for the first move." />
    </section>
  );
}
