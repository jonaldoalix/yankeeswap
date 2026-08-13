import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { DEFAULT_QUESTIONS } from "../../shared/rounds.js";
import { createJoinCode } from "../../shared/ids.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export { findRoot };

const rootDir = findRoot(path.resolve(__dirname));

dotenv.config({ path: path.join(rootDir, ".env") });

function boolEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseQuestions(raw: string | undefined): string[] {
  if (!raw?.trim()) return [...DEFAULT_QUESTIONS];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_QUESTIONS];
    const questions = parsed
      .map((item) => String(item || "").trim())
      .filter((item) => item.length > 0)
      .slice(0, 30);
    return questions.length > 0 ? questions : [...DEFAULT_QUESTIONS];
  } catch {
    return [...DEFAULT_QUESTIONS];
  }
}

function parseJoinCode(raw: string | undefined, museumMode: boolean): string {
  const trimmed = raw?.trim().toUpperCase() ?? "";
  if (/^[A-Z0-9]{3,8}$/.test(trimmed)) return trimmed;
  return museumMode ? "YANK" : createJoinCode(4);
}

function parseTimer(raw: string | undefined): number {
  const value = Number(raw || 180);
  if (!Number.isFinite(value)) return 180;
  const seconds = Math.floor(value);
  if (seconds < 10) return 10;
  if (seconds > 3600) return 3600;
  return seconds;
}

export interface AppConfig {
  port: number;
  museumMode: boolean;
  seedMuseumDemo: boolean;
  eventLabel: string;
  timerSeconds: number;
  joinCode: string;
  hostPin: string;
  questions: string[];
  rootDir: string;
  clientDist: string;
}

export function loadConfig(): AppConfig {
  const museumMode = boolEnv(process.env.MUSEUM_MODE, false);
  const label = (process.env.EVENT_LABEL || "Crazy Yankee Swap").trim().slice(0, 80);
  return {
    port: Number(process.env.PORT || 1224) || 1224,
    museumMode,
    seedMuseumDemo: boolEnv(process.env.SEED_MUSEUM_DEMO, museumMode),
    eventLabel: label || "Crazy Yankee Swap",
    timerSeconds: parseTimer(process.env.TIMER_SECONDS),
    joinCode: parseJoinCode(process.env.JOIN_CODE, museumMode),
    hostPin: (process.env.HOST_PIN || "").trim(),
    questions: parseQuestions(process.env.QUESTIONS_JSON),
    rootDir,
    clientDist: path.join(rootDir, "dist/client"),
  };
}
