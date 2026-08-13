import type { AppConfig } from "./config.js";

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 1224,
    museumMode: false,
    seedMuseumDemo: false,
    eventLabel: "Crazy Yankee Swap",
    timerSeconds: 180,
    joinCode: "YANK",
    hostPin: "",
    questions: ["Has the elf on the shelf ever come to your house?"],
    rootDir: process.cwd(),
    clientDist: "/tmp/yankeeswap-missing-client-dist",
    ...overrides,
  };
}
