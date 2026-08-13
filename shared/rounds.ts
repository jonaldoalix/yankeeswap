import type { Phase } from "./types.js";

export const DEFAULT_QUESTIONS: string[] = [
  "Has the elf on the shelf ever come to your house?",
  "Have you kissed someone under the mistletoe?",
  "Have you been caroling before?",
  "Have you ever wrote a letter to Santa?",
  "Have you gone to church or plan on it for Christmas or Christmas Eve?",
  "Do you know why Christmas is a holiday?",
  "Is there a tree up at your house?",
  "Do you like eggnog? ¿Coquito?",
  "Have you ever done a yankee swap before?",
  "Did you do secret santa this year?",
];

export interface PhaseDef {
  title: string;
  prompt: string;
  why: string;
}

export const PHASES: Record<Phase, PhaseDef> = {
  lobby: {
    title: "Sign up",
    prompt: "Join with your name and a wrapped gift. The host will shuffle turn order.",
    why: "You do not pick your place in line. Order is dealt when the night starts.",
  },
  play: {
    title: "Take or steal",
    prompt: "On your turn, take a wrapped gift from the pile, or steal one that is already open.",
    why: "First player can only take from the pile. Steal shows up after a gift is open.",
  },
  closing: {
    title: "Last steal",
    prompt: "Player 1 may trade for one opened gift, or keep what they have.",
    why: "Going first is a disadvantage. This evening-up is optional via First-last.",
  },
  done: {
    title: "Picture time",
    prompt: "The pile is closed. Photos with the loot.",
    why: "The night ends on purpose so nobody steals during dessert.",
  },
};

export function phaseDef(phase: Phase): PhaseDef {
  return PHASES[phase];
}
