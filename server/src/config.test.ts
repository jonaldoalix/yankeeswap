import fs from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findRoot, loadConfig } from "./config.js";

const ORIGINAL = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL);
});

describe("findRoot", () => {
  it("returns start when no package.json exists up the tree", () => {
    const start = mkdtempSync(join(tmpdir(), "app-no-package-root-"));
    const spy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    try {
      expect(findRoot(start)).toBe(start);
    } finally {
      spy.mockRestore();
      rmSync(start, { recursive: true, force: true });
    }
  });

  it("finds this repository root", () => {
    expect(findRoot(process.cwd())).toMatch(/yankeeswap$/);
  });
});

describe("loadConfig", () => {
  it("uses holiday defaults", () => {
    delete process.env.PORT;
    delete process.env.MUSEUM_MODE;
    delete process.env.SEED_MUSEUM_DEMO;
    delete process.env.EVENT_LABEL;
    delete process.env.TIMER_SECONDS;
    delete process.env.JOIN_CODE;
    delete process.env.HOST_PIN;
    delete process.env.QUESTIONS_JSON;
    const config = loadConfig();
    expect(config.port).toBe(1224);
    expect(config.museumMode).toBe(false);
    expect(config.eventLabel).toBe("Crazy Yankee Swap");
    expect(config.timerSeconds).toBe(180);
    expect(config.hostPin).toBe("");
    expect(config.joinCode.length).toBeGreaterThanOrEqual(3);
    expect(config.questions.length).toBe(10);
  });

  it("parses museum, pin, questions, and timer bounds", () => {
    process.env.MUSEUM_MODE = "1";
    process.env.PORT = "0";
    process.env.EVENT_LABEL = "  ";
    process.env.TIMER_SECONDS = "4";
    process.env.JOIN_CODE = "swap";
    process.env.HOST_PIN = "1224";
    process.env.QUESTIONS_JSON = JSON.stringify(["Q1", " ", "Q2"]);
    const config = loadConfig();
    expect(config.museumMode).toBe(true);
    expect(config.seedMuseumDemo).toBe(true);
    expect(config.port).toBe(1224);
    expect(config.eventLabel).toBe("Crazy Yankee Swap");
    expect(config.timerSeconds).toBe(10);
    expect(config.joinCode).toBe("SWAP");
    expect(config.hostPin).toBe("1224");
    expect(config.questions).toEqual(["Q1", "Q2"]);

    process.env.MUSEUM_MODE = "no";
    process.env.SEED_MUSEUM_DEMO = "yes";
    process.env.PORT = "3001";
    process.env.EVENT_LABEL = "White Elephant";
    process.env.TIMER_SECONDS = "9000";
    process.env.JOIN_CODE = "??";
    process.env.QUESTIONS_JSON = "[]";
    const next = loadConfig();
    expect(next.museumMode).toBe(false);
    expect(next.seedMuseumDemo).toBe(true);
    expect(next.port).toBe(3001);
    expect(next.eventLabel).toBe("White Elephant");
    expect(next.timerSeconds).toBe(3600);
    expect(next.joinCode).toHaveLength(4);
    expect(next.questions.length).toBe(10);

    process.env.TIMER_SECONDS = "nope";
    process.env.QUESTIONS_JSON = "{not-json";
    process.env.JOIN_CODE = "YANK";
    const fallback = loadConfig();
    expect(fallback.timerSeconds).toBe(180);
    expect(fallback.questions.length).toBe(10);
    expect(fallback.joinCode).toBe("YANK");

    process.env.QUESTIONS_JSON = JSON.stringify(["", ""]);
    expect(loadConfig().questions.length).toBe(10);

    process.env.MUSEUM_MODE = "true";
    process.env.JOIN_CODE = "??";
    expect(loadConfig().joinCode).toBe("YANK");

    process.env.MUSEUM_MODE = "";
    process.env.SEED_MUSEUM_DEMO = "on";
    process.env.TIMER_SECONDS = "45";
    process.env.JOIN_CODE = "PARTY99";
    const extra = loadConfig();
    expect(extra.museumMode).toBe(false);
    expect(extra.seedMuseumDemo).toBe(true);
    expect(extra.timerSeconds).toBe(45);
    expect(extra.joinCode).toBe("PARTY99");
  });
});
