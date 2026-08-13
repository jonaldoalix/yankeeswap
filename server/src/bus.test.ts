import { describe, expect, it } from "vitest";
import { EventBus, type SseClient } from "./bus.js";

function fakeClient(write?: () => void): SseClient & { close?: () => void } {
  let onClose: (() => void) | undefined;
  return {
    write() {
      write?.();
      return true;
    },
    on(_event: "close", listener: () => void) {
      onClose = listener;
    },
    close() {
      onClose?.();
    },
  };
}

describe("EventBus", () => {
  it("fans out, unsubscribes, and drops failing clients", () => {
    const bus = new EventBus();
    const ok = fakeClient();
    const boom = fakeClient(() => {
      throw new Error("closed");
    });
    const unsub = bus.subscribe(ok);
    bus.subscribe(boom);
    expect(bus.size).toBe(2);
    bus.emit("state", { ok: true });
    expect(bus.size).toBe(1);
    unsub();
    expect(bus.size).toBe(0);

    const third = fakeClient();
    bus.subscribe(third);
    third.close?.();
    expect(bus.size).toBe(0);
  });
});
