import { afterEach, describe, expect, it, vi } from "vitest";
import { createId, createJoinCode, createToken } from "./ids.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ids", () => {
  it("creates prefixed UUIDs and join codes", () => {
    expect(createId("pl")).toMatch(/^pl-/);
    expect(createJoinCode(4)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    expect(createJoinCode(0)).toHaveLength(1);
    expect(createJoinCode(99)).toHaveLength(8);
    expect(createToken()).toHaveLength(48);
  });

  it("falls back when WebCrypto is missing", () => {
    vi.stubGlobal("crypto", undefined);
    expect(createId("x")).toMatch(/^x-/);
    expect(createJoinCode(4)).toHaveLength(4);
    expect(createToken().length).toBeGreaterThan(10);
  });

  it("uses getRandomValues without randomUUID", () => {
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(3);
        return bytes;
      },
    });
    expect(createId("z")).toMatch(/^z-/);
    expect(createJoinCode(4)).toHaveLength(4);
  });
});
