import type { GameSnapshot, WrappedPick } from "../../shared/types";

export function pileColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

export function whoseGift(name: string): string {
  return `${name}'s gift`;
}

export function WrappedMid({ gifts }: { gifts: WrappedPick[] }) {
  if (gifts.length === 0) return null;
  return (
    <ul className="wrapped-mid" aria-label="Still wrapped in the middle">
      {gifts.map((gift) => (
        <li key={gift.id}>{whoseGift(gift.broughtByName)}</li>
      ))}
    </ul>
  );
}

export function RoundCue({ state }: { state: GameSnapshot }) {
  return (
    <div className="live-cue" role="status">
      <p className="live-cue-now">{state.phaseNow}</p>
      <p className="live-cue-next">
        <strong>Next</strong>
        {state.phaseNext}
      </p>
    </div>
  );
}
