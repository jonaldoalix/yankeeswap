import type { Mods } from "./types.js";

export const DEFAULT_MODS: Mods = {
  freezeAfter: 3,
  noRevenge: true,
  firstLast: true,
  turnClock: true,
  chainCap: 0,
  gentle: false,
  fate: false,
  duel: false,
  shield: false,
  spareGift: false,
  mercy: false,
  coin: false,
  rotate: false,
};

export const FATE_ACTIONS = ["unwrap", "steal", "swap-any", "pass-left", "pass-right"] as const;

export type FateAction = (typeof FATE_ACTIONS)[number];

export const MOD_KNOBS = [
  {
    key: "freezeAfter",
    label: "Freeze after",
    blurb: "A gift cannot be stolen after this many steals. Off means it never freezes.",
  },
  {
    key: "chainCap",
    label: "Chain cap",
    blurb: "Stop a steal streak after this many hops. Off means the chain can run the table.",
  },
] as const;

export const MOD_TOGGLES = [
  {
    key: "noRevenge",
    label: "No revenge",
    blurb: "The person you just stole from cannot take it straight back.",
  },
  {
    key: "firstLast",
    label: "First-last",
    blurb: "Player 1 may trade for one last steal after the pile is empty. Nobody goes empty-handed.",
  },
  {
    key: "turnClock",
    label: "Turn clock",
    blurb: "Each turn has a countdown. At zero the table unwraps or moves on.",
  },
  {
    key: "gentle",
    label: "Gentle",
    blurb: "No stealing. Take from the pile only.",
  },
  {
    key: "fate",
    label: "Fate",
    blurb: "Each turn draws unwrap, steal, swap any, pass left, or pass right.",
  },
  {
    key: "duel",
    label: "Duel",
    blurb: "A steal is settled with rock-paper-scissors.",
  },
  {
    key: "shield",
    label: "Shield",
    blurb: "Each player may arm one shield that blocks a single steal.",
  },
  {
    key: "spareGift",
    label: "Spare gift",
    blurb: "The host can add an extra wrapped gift to the pile.",
  },
  {
    key: "mercy",
    label: "Mercy",
    blurb: "Someone just stolen from cannot be stolen from on the next steal.",
  },
  {
    key: "coin",
    label: "Coin",
    blurb: "Heads may steal. Tails takes from the pile.",
  },
  {
    key: "rotate",
    label: "Rotate",
    blurb: "The host can pass every held gift one seat left or right.",
  },
] as const;

export function activeHouseRules(mods: Mods): string[] {
  const rules: string[] = [];
  if (mods.freezeAfter > 0) rules.push(`Freeze after ${mods.freezeAfter}`);
  if (mods.chainCap > 0) rules.push(`Chain cap ${mods.chainCap}`);
  for (const toggle of MOD_TOGGLES) {
    if (mods[toggle.key]) rules.push(toggle.label);
  }
  return rules;
}
