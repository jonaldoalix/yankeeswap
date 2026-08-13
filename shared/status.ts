import type { ClientRole, CoinFace, PendingKind, Phase } from "./types.js";

export interface LiveCue {
  title: string;
  now: string;
  next: string;
}

export interface LiveCueInput {
  role: ClientRole;
  phase: Phase;
  playerCount: number;
  actingName: string | null;
  nextName: string | null;
  youName: string | null;
  youActing: boolean;
  chainLength: number;
  firstLast: boolean;
  pending: {
    kind: PendingKind;
    actorName: string;
    targetName?: string;
    autoInSeconds: number;
  } | null;
  duel: { actorName: string; targetName: string; youNeedPick: boolean } | null;
  fate: string | null;
  coin: CoinFace | null;
  canUnwrap: boolean;
  canSteal: boolean;
}

function youOr(name: string, youName: string | null, youActing: boolean): string {
  if (youActing && youName) return "You";
  return name;
}

function afterThat(input: LiveCueInput): string {
  if (input.nextName) return `${input.nextName} is after that.`;
  if (input.firstLast) return "Then first player may steal once more.";
  return "Then the pile closes.";
}

function choiceLine(input: LiveCueInput, actor: string): string {
  const you = actor === "You";
  if (input.canSteal && input.canUnwrap) {
    return you
      ? "Take a wrapped gift from the pile, or steal one that's open."
      : `${actor} takes from the pile or steals.`;
  }
  if (input.canSteal) {
    return you ? "Steal an opened gift." : `${actor} steals.`;
  }
  if (input.canUnwrap) {
    return you ? "Take a wrapped gift from the pile." : `${actor} takes a wrapped gift from the pile.`;
  }
  return you ? "Wait." : `${actor} waits.`;
}

function moveLine(input: LiveCueInput, actor: string): string {
  const you = actor === "You";
  if (input.fate === "pass-left") {
    return you ? "Pass every gift one seat left." : `${actor} passes gifts left.`;
  }
  if (input.fate === "pass-right") {
    return you ? "Pass every gift one seat right." : `${actor} passes gifts right.`;
  }
  if (input.fate === "unwrap" || input.coin === "tails") {
    return you ? "Take a wrapped gift from the pile." : `${actor} takes a wrapped gift from the pile.`;
  }
  if ((input.fate === "steal" || input.fate === "swap-any") && input.canSteal) {
    return you ? "Steal an opened gift." : `${actor} steals.`;
  }
  const choice = choiceLine(input, actor);
  if (input.coin === "heads" && input.canSteal && input.canUnwrap) {
    return you ? `Heads — ${choice.charAt(0).toLowerCase()}${choice.slice(1)}` : `Heads — ${choice}`;
  }
  if (input.chainLength > 0) {
    return you ? `They took yours. ${choice}` : `${actor} was stolen from — ${choice.charAt(0).toLowerCase()}${choice.slice(1)}`;
  }
  return choice;
}

export function liveCue(input: LiveCueInput): LiveCue {
  if (input.phase === "lobby") {
    if (input.role === "host") {
      return {
        title: "Sign up",
        now:
          input.playerCount > 0
            ? `${input.playerCount} seated. Gifts stay wrapped.`
            : "Waiting for people to sit.",
        next: input.playerCount > 0 ? "Shuffle the order, then start." : "They join from their phones.",
      };
    }
    if (input.role === "player") {
      return {
        title: "Sign up",
        now: "You're in. Your gift stays wrapped.",
        next: "The host starts when everyone is seated.",
      };
    }
    return {
      title: "Sign up",
      now:
        input.playerCount > 0
          ? `${input.playerCount} seated. Gifts stay wrapped.`
          : "Join on a phone. Watch the pile here.",
      next: "The host starts when everyone is in.",
    };
  }

  if (input.phase === "done") {
    return {
      title: "Picture time",
      now: "The pile is closed.",
      next: input.role === "host" ? "Reset when you're ready." : "Hold up what you got.",
    };
  }

  if (input.duel) {
    const vs =
      input.duel.youNeedPick
        ? `Your throw vs ${input.duel.actorName === input.youName ? input.duel.targetName : input.duel.actorName}.`
        : `${input.duel.actorName} vs ${input.duel.targetName}.`;
    return {
      title: "Rock-paper-scissors",
      now: vs,
      next: "Winner keeps the gift.",
    };
  }

  if (input.pending) {
    const actor = youOr(input.pending.actorName, input.youName, input.pending.actorName === input.youName);
    const now =
      input.pending.kind === "steal"
        ? `${actor} ${actor === "You" ? "are" : "is"} taking ${input.pending.targetName ? `${input.pending.targetName}'s gift` : "a gift"}.`
        : `${actor} ${actor === "You" ? "are" : "is"} opening ${input.pending.targetName ? `${input.pending.targetName}'s gift` : "a wrapped gift from the pile"}.`;
    const seconds = Math.max(0, input.pending.autoInSeconds);
    return {
      title: input.actingName ? `${input.actingName}'s turn` : "Hold on",
      now,
      next:
        input.role === "host"
          ? `It counts in ${seconds}s unless you stop it.`
          : `It counts in ${seconds}s.`,
    };
  }

  if (input.phase === "closing") {
    const actor = input.actingName ? youOr(input.actingName, input.youName, input.youActing) : "First player";
    return {
      title: input.actingName ? `Last steal · ${input.actingName}` : "Last steal",
      now:
        actor === "You"
          ? "You went first. Trade for one opened gift, or keep what you have."
          : `${actor} went first and may trade for one opened gift, or keep it.`,
      next: "Then photos.",
    };
  }

  const actor = input.actingName ? youOr(input.actingName, input.youName, input.youActing) : null;
  const title = input.youActing ? "Your turn" : input.actingName ? `${input.actingName}'s turn` : "Take from the pile";
  return {
    title,
    now: actor ? moveLine(input, actor) : "Take a wrapped gift from the pile.",
    next: afterThat(input),
  };
}
