import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { AddressInfo } from "node:net";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { GameStore } from "./store.js";
import { testConfig } from "./testConfig.js";
import { DEFAULT_MODS } from "../../shared/mods.js";

const bundles: Array<{ store: GameStore; server?: http.Server }> = [];

afterEach(async () => {
  for (const bundle of bundles.splice(0)) {
    bundle.store.close();
    if (bundle.server) {
      await new Promise<void>((resolve, reject) => {
        bundle.server?.close((err) => (err ? reject(err) : resolve()));
      });
    }
  }
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function hostApp(overrides: Parameters<typeof testConfig>[0] = {}) {
  const bundle = createApp(testConfig(overrides));
  bundles.push(bundle);
  const created = await request(bundle.app).post("/api/session/host").send({});
  const token = created.body.session.token as string;
  return { ...bundle, token };
}

const mods = { ...DEFAULT_MODS, turnClock: false };

describe("API", () => {
  it("serves health, config, and security headers", async () => {
    const { app, store } = createApp(testConfig({ museumMode: true }));
    bundles.push({ store });
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-robots-tag"]).toBe("noindex, nofollow");
    const config = await request(app).get("/api/config");
    expect(config.body.joinCode).toBe("YANK");
    expect(config.body.museumMode).toBe(true);
    expect(config.body.phase).toBe("lobby");
  });

  it("gates host, player, and spectator sessions", async () => {
    const { app, store } = createApp(testConfig({ hostPin: "1224" }));
    bundles.push({ store });
    expect((await request(app).post("/api/session/host").send({ pin: 1 })).status).toBe(400);
    expect((await request(app).post("/api/session/host").send({ pin: "nope" })).status).toBe(403);
    const host = await request(app).post("/api/session/host").send({ pin: "1224" });
    expect(host.status).toBe(201);
    const hostToken = host.body.session.token as string;

    expect((await request(app).post("/api/session/join").send({})).status).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/session/join")
          .send({ joinCode: "NOPE", name: "Ada", gift: "socks" })
      ).status,
    ).toBe(400);

    const player = await request(app).post("/api/session/join").send({
      joinCode: "YANK",
      name: "Ada",
      gift: "socks",
    });
    expect(player.status).toBe(201);
    const playerToken = player.body.session.token as string;
    expect(player.body.state.you.gift).toBe("socks");
    expect(player.body.state.players[0].giftLabel).toBe("—");

    expect((await request(app).post("/api/session/spectate").send({})).status).toBe(400);
    expect(
      (await request(app).post("/api/session/spectate").send({ joinCode: "NOPE" })).status,
    ).toBe(400);
    const watch = await request(app).post("/api/session/spectate").send({ joinCode: "YANK" });
    expect(watch.status).toBe(201);
    const watchToken = watch.body.session.token as string;

    expect((await request(app).get("/api/state")).status).toBe(401);
    expect((await request(app).get("/api/stream")).status).toBe(401);
    expect((await request(app).get("/api/state").set({ Authorization: "Basic nope" })).status).toBe(
      401,
    );
    expect((await request(app).get("/api/state").set(auth(hostToken))).status).toBe(200);
    expect((await request(app).post("/api/game/start").set(auth(playerToken))).status).toBe(403);
    expect((await request(app).post("/api/play/for").set(auth(playerToken)).send({ kind: "unwrap" })).status).toBe(
      403,
    );
    expect((await request(app).post("/api/play/unwrap").set(auth(hostToken)).send({})).status).toBe(
      403,
    );
    expect((await request(app).post("/api/play/unwrap").set(auth(watchToken)).send({})).status).toBe(
      403,
    );
  });

  it("does not let a spectator token run the host desk after a later host claim", async () => {
    const { app, store } = createApp(testConfig());
    bundles.push({ store });
    const watch = await request(app).post("/api/session/spectate").send({ joinCode: "YANK" });
    const watchToken = watch.body.session.token as string;
    expect(
      (await request(app).post("/api/notes").set(auth(watchToken)).send({ message: "Nope." })).status,
    ).toBe(403);

    const host = await request(app).post("/api/session/host").set(auth(watchToken)).send({});
    expect(host.status).toBe(201);
    const hostToken = host.body.session.token as string;
    expect(hostToken).not.toBe(watchToken);
    expect(
      (await request(app).post("/api/notes").set(auth(hostToken)).send({ message: "Ada first." }))
        .status,
    ).toBe(200);
    expect(
      (await request(app).post("/api/notes").set(auth(watchToken)).send({ message: "Still nope." }))
        .status,
    ).toBe(403);
  });

  it("runs a digital swap: seat, shuffle, start, unwrap, steal, veto, clerk", async () => {
    const { app, token } = await hostApp();
    const header = auth(token);

    expect((await request(app).post("/api/players").set(header).send({})).status).toBe(400);
    expect(
      (await request(app).post("/api/players").set(header).send({ name: "Ada", gift: "socks" }))
        .status,
    ).toBe(201);
    expect(
      (await request(app).post("/api/players").set(header).send({ name: "Bea", gift: "mug" }))
        .status,
    ).toBe(201);
    expect(
      (await request(app).post("/api/players").set(header).send({ name: "Ada", gift: "socks" }))
        .status,
    ).toBe(400);
    const listed = await request(app).get("/api/state").set(header);
    const ada = listed.body.players.find((p: { name: string }) => p.name === "Ada").id as string;
    const bea = listed.body.players.find((p: { name: string }) => p.name === "Bea").id as string;

    expect((await request(app).delete(`/api/players/missing`).set(header)).status).toBe(400);
    expect(
      (await request(app).post("/api/players").set(header).send({ name: "Cal", gift: "tea" })).status,
    ).toBe(201);
    const withCal = await request(app).get("/api/state").set(header);
    const cal = withCal.body.players.find((p: { name: string }) => p.name === "Cal").id as string;
    expect((await request(app).delete(`/api/players/${cal}`).set(header)).status).toBe(200);
    expect((await request(app).post("/api/order/shuffle").set(header)).status).toBe(200);
    expect((await request(app).post("/api/order/assign").set(header).send({})).status).toBe(400);
    expect(
      (await request(app).post("/api/order/assign").set(header).send({ playerIds: [ada, bea] }))
        .status,
    ).toBe(200);
    expect((await request(app).post("/api/game/start").set(header)).status).toBe(200);
    expect((await request(app).post("/api/order/shuffle").set(header)).status).toBe(400);
    expect(
      (await request(app).post("/api/order/assign").set(header).send({ playerIds: [ada, bea] }))
        .status,
    ).toBe(400);
    expect((await request(app).post("/api/game/start").set(header)).status).toBe(400);

    const adaJoin = await request(app).post("/api/session/join").send({
      joinCode: "YANK",
      name: "Cal",
      gift: "tea",
    });
    expect(adaJoin.status).toBe(400);

    expect((await request(app).post("/api/timer").set(header).send({})).status).toBe(400);
    expect((await request(app).post("/api/timer").set(header).send({ action: "start" })).status).toBe(
      200,
    );
    expect((await request(app).post("/api/timer").set(header).send({ action: "pause" })).status).toBe(
      200,
    );
    expect((await request(app).post("/api/timer").set(header).send({ action: "reset" })).status).toBe(
      200,
    );

    expect((await request(app).post("/api/notes").set(header).send({})).status).toBe(400);
    expect(
      (await request(app).post("/api/notes").set(header).send({ message: "Shuffle done." })).status,
    ).toBe(200);

    expect((await request(app).patch("/api/config").set(header).send({})).status).toBe(400);
    const patched = await request(app).patch("/api/config").set(header).send({
      eventLabel: "White Elephant",
      timerSeconds: 90,
      mods,
    });
    expect(patched.status).toBe(400);

    expect((await request(app).post("/api/clerk").set(header).send({})).status).toBe(400);
    const clerk = await request(app).post("/api/clerk").set(header).send({ open: true });
    expect(clerk.status).toBe(200);
    expect(clerk.body.clerkOpen).toBe(true);

    expect((await request(app).post("/api/pending").set(header).send({})).status).toBe(400);
    expect(
      (await request(app).post("/api/pending").set(header).send({ decision: "allow" })).status,
    ).toBe(400);

    expect((await request(app).post("/api/reset").set(header)).status).toBe(200);
    expect(
      (await request(app).post("/api/players").set(header).send({ name: "Ada", gift: "socks" }))
        .status,
    ).toBe(201);
    expect(
      (await request(app).post("/api/players").set(header).send({ name: "Bea", gift: "mug" }))
        .status,
    ).toBe(201);
    const after = await request(app).get("/api/state").set(header);
    const ada2 = after.body.players.find((p: { name: string }) => p.name === "Ada").id as string;
    const bea2 = after.body.players.find((p: { name: string }) => p.name === "Bea").id as string;
    await request(app).post("/api/order/assign").set(header).send({ playerIds: [ada2, bea2] });
    await request(app).patch("/api/config").set(header).send({
      eventLabel: "White Elephant",
      timerSeconds: 90,
      mods,
    });
    expect((await request(app).post("/api/game/start").set(header)).status).toBe(200);

    const player = await request(app).post("/api/session/join").send({
      joinCode: "YANK",
      name: "Cal",
      gift: "tea",
    });
    expect(player.status).toBe(400);

    const adaSeat = await request(app)
      .post("/api/session/join")
      .send({ joinCode: "YANK", name: "Ada", gift: "socks" });
    expect(adaSeat.status).toBe(400);
  });

  it("lets seated players unwrap, steal, pass, shield, duel, and rotate", async () => {
    const store = new GameStore(testConfig({ timerSeconds: 30 }));
    const { app } = createApp(testConfig(), store);
    bundles.push({ store });
    const host = await request(app).post("/api/session/host").send({});
    const header = auth(host.body.session.token as string);

    const ada = await request(app).post("/api/session/join").send({
      joinCode: "YANK",
      name: "Ada",
      gift: "socks",
    });
    const bea = await request(app).post("/api/session/join").send({
      joinCode: "YANK",
      name: "Bea",
      gift: "mug",
    });
    const adaToken = ada.body.session.token as string;
    const beaToken = bea.body.session.token as string;
    const adaId = ada.body.state.you.id as string;
    const beaId = bea.body.state.you.id as string;

    await request(app).patch("/api/config").set(header).send({
      eventLabel: "Yankee Swap",
      timerSeconds: 30,
      mods: { ...DEFAULT_MODS, turnClock: false, shield: true, spareGift: true, rotate: true, duel: true, firstLast: true },
    });
    await request(app).post("/api/order/assign").set(header).send({ playerIds: [adaId, beaId] });
    expect((await request(app).post("/api/game/start").set(header)).status).toBe(200);

    expect((await request(app).post("/api/play/shield").set(auth(adaToken))).status).toBe(400);
    expect(
      (await request(app).post("/api/play/steal").set(auth(adaToken)).send({ targetId: beaId })).status,
    ).toBe(400);

    expect((await request(app).post("/api/play/unwrap").set(auth(beaToken)).send({})).status).toBe(
      400,
    );
    expect((await request(app).post("/api/play/steal").set(auth(adaToken)).send({})).status).toBe(
      400,
    );
    expect((await request(app).post("/api/play/unwrap").set(auth(adaToken)).send({})).status).toBe(
      200,
    );
    expect(
      (await request(app).post("/api/pending").set(header).send({ decision: "allow" })).status,
    ).toBe(200);

    expect((await request(app).post("/api/play/shield").set(auth(adaToken))).status).toBe(200);
    expect((await request(app).post("/api/spare").set(header).send({})).status).toBe(400);
    expect((await request(app).post("/api/spare").set(header).send({ label: "jam" })).status).toBe(
      200,
    );

    expect((await request(app).post("/api/play/steal").set(auth(beaToken)).send({ targetId: adaId })).status).toBe(
      200,
    );
    expect((await request(app).post("/api/play/duel").set(auth(beaToken)).send({})).status).toBe(400);
    expect(
      (await request(app).post("/api/play/duel").set(auth(beaToken)).send({ pick: "rock" })).status,
    ).toBe(200);
    expect(
      (await request(app).post("/api/play/duel").set(auth(adaToken)).send({ pick: "scissors" })).status,
    ).toBe(200);
    expect(
      (await request(app).post("/api/pending").set(header).send({ decision: "veto" })).status,
    ).toBe(200);

    expect((await request(app).post("/api/play/rotate").set(header).send({})).status).toBe(400);
    expect(
      (await request(app).post("/api/play/rotate").set(header).send({ direction: "left" })).status,
    ).toBe(400);

    const watch = await request(app).post("/api/session/spectate").send({ joinCode: "YANK" });
    expect(
      (
        await request(app)
          .post("/api/play/rotate")
          .set(auth(watch.body.session.token as string))
          .send({ direction: "left" })
      ).status,
    ).toBe(403);

    expect((await request(app).post("/api/play/pass").set(auth(adaToken))).status).toBe(400);
    expect((await request(app).post("/api/play/unwrap").set(auth(beaToken)).send({ giftId: "nope" })).status).toBe(
      400,
    );
    expect((await request(app).post("/api/play/unwrap").set(auth(adaToken)).send({ giftId: 1 })).status).toBe(
      400,
    );
    expect((await request(app).post("/api/play/duel").set(auth(adaToken)).send({ pick: "rock" })).status).toBe(
      400,
    );
    expect((await request(app).post("/api/spare").set(header).send({ label: "extra" })).status).toBe(200);
  });

  it("lets the host record unwrap and steal for the person who is up", async () => {
    const { app, token } = await hostApp();
    const header = auth(token);
    expect((await request(app).post("/api/play/for").set(header).send({})).status).toBe(400);
    expect((await request(app).post("/api/play/for").set(header).send({ kind: "unwrap" })).status).toBe(
      400,
    );
    await request(app).post("/api/players").set(header).send({ name: "Ada", gift: "socks" });
    await request(app).post("/api/players").set(header).send({ name: "Bea", gift: "mug" });
    await request(app).patch("/api/config").set(header).send({
      eventLabel: "Yankee Swap",
      timerSeconds: 30,
      mods: { ...DEFAULT_MODS, turnClock: false, firstLast: true },
    });
    const listed = await request(app).get("/api/state").set(header);
    const ada = listed.body.players.find((p: { name: string }) => p.name === "Ada").id as string;
    const bea = listed.body.players.find((p: { name: string }) => p.name === "Bea").id as string;
    await request(app).post("/api/order/assign").set(header).send({ playerIds: [ada, bea] });
    expect((await request(app).post("/api/game/start").set(header)).status).toBe(200);
    expect((await request(app).post("/api/play/for").set(header).send({ kind: "pass" })).status).toBe(
      400,
    );
    expect((await request(app).post("/api/play/for").set(header).send({ kind: "rotate" })).status).toBe(
      400,
    );
    const started = await request(app).get("/api/state").set(header);
    expect(started.body.actingMoves.name).toBe("Ada");
    expect(started.body.wrappedPile.map((gift: { broughtByName: string }) => gift.broughtByName)).toEqual(
      ["Ada", "Bea"],
    );
    const beaGift = started.body.actingMoves.unwrapTargets.find(
      (gift: { broughtByName: string }) => gift.broughtByName === "Bea",
    ).id as string;
    expect((await request(app).post("/api/play/for").set(header).send({ kind: "steal" })).status).toBe(
      400,
    );
    expect(
      (await request(app).post("/api/play/for").set(header).send({ kind: "unwrap", giftId: beaGift }))
        .status,
    ).toBe(200);
    const after = await request(app).get("/api/state").set(header);
    expect(after.body.actingMoves.name).toBe("Bea");
    expect(
      (await request(app).post("/api/play/for").set(header).send({ kind: "steal", targetId: ada })).status,
    ).toBe(200);
    expect((await request(app).post("/api/play/for").set(header).send({ kind: "unwrap" })).status).toBe(
      200,
    );
    expect((await request(app).post("/api/play/for").set(header).send({ kind: "pass" })).status).toBe(
      200,
    );
  });

  it("rotates, passes the last steal, and rejects spare when the mod is off", async () => {
    const store = new GameStore(testConfig({ timerSeconds: 30 }));
    const { app } = createApp(testConfig(), store);
    bundles.push({ store });
    const host = await request(app).post("/api/session/host").send({});
    const header = auth(host.body.session.token as string);
    const ada = await request(app).post("/api/session/join").send({
      joinCode: "YANK",
      name: "Ada",
      gift: "socks",
    });
    const bea = await request(app).post("/api/session/join").send({
      joinCode: "YANK",
      name: "Bea",
      gift: "mug",
    });
    const adaToken = ada.body.session.token as string;
    const beaToken = bea.body.session.token as string;
    const adaId = ada.body.state.you.id as string;
    const beaId = bea.body.state.you.id as string;

    expect((await request(app).post("/api/spare").set(header).send({ label: "jam" })).status).toBe(400);
    await request(app).patch("/api/config").set(header).send({
      eventLabel: "Yankee Swap",
      timerSeconds: 30,
      mods: { ...DEFAULT_MODS, turnClock: false, rotate: true, firstLast: true },
    });
    await request(app).post("/api/order/assign").set(header).send({ playerIds: [adaId, beaId] });
    await request(app).post("/api/game/start").set(header);

    await request(app).post("/api/play/unwrap").set(auth(adaToken)).send({});
    await request(app).post("/api/pending").set(header).send({ decision: "allow" });
    await request(app).post("/api/play/unwrap").set(auth(beaToken)).send({});
    await request(app).post("/api/pending").set(header).send({ decision: "allow" });

    expect(
      (await request(app).post("/api/play/rotate").set(header).send({ direction: "left" })).status,
    ).toBe(200);
    expect((await request(app).post("/api/play/pass").set(auth(adaToken))).status).toBe(200);
  });

  it("rejects a timer that cannot start and a start with an empty table", async () => {
    const store = new GameStore(testConfig({ timerSeconds: 10 }));
    const { app } = createApp(testConfig(), store);
    bundles.push({ store });
    const host = await request(app).post("/api/session/host").send({});
    const header = auth(host.body.session.token as string);
    store.state.timer.remainingSeconds = 0;
    store.state.timer.durationSeconds = 0;
    expect((await request(app).post("/api/timer").set(header).send({ action: "start" })).status).toBe(
      400,
    );
    expect((await request(app).post("/api/game/start").set(header)).status).toBe(400);
    expect((await request(app).post("/api/order/shuffle").set(header)).status).toBe(400);
    expect(
      (
        await request(app).patch("/api/config").set(header).send({
          eventLabel: "No",
          timerSeconds: 5,
          mods: DEFAULT_MODS,
        })
      ).status,
    ).toBe(400);
  });

  it("streams state over SSE and serves the built client", async () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), "yankee-dist-"));
    fs.writeFileSync(path.join(dist, "index.html"), "<html>yankee</html>");
    fs.writeFileSync(path.join(dist, "sw.js"), "/* sw */");
    fs.writeFileSync(path.join(dist, "workbox-abc.js"), "/* workbox */");
    const { app, store, token } = await hostApp({ clientDist: dist });
    expect((await request(app).get("/")).text).toMatch(/yankee/);
    const sw = await request(app).get("/sw.js");
    expect(sw.headers["cache-control"]).toBe("no-cache");
    expect((await request(app).get("/workbox-abc.js")).headers["cache-control"]).toBe("no-cache");
    expect((await request(app).get("/made-up")).text).toMatch(/yankee/);

    const server = app.listen(0);
    bundles[bundles.length - 1]!.server = server;
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/stream?access_token=${token}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/event-stream/);
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toMatch(/event: state/);
    await reader.cancel();
    store.close();
  });

  it("reads bearer tokens from the query string and rejects empty ones", async () => {
    const { app, token, store } = await hostApp();
    expect((await request(app).get(`/api/state?access_token=${token}`)).status).toBe(200);
    expect((await request(app).get("/api/state").set({ Authorization: "Bearer " })).status).toBe(
      401,
    );
    expect((await request(app).get("/api/state").set({ Authorization: "Bearer\t" })).status).toBe(
      401,
    );
    expect((await request(app).get("/api/state").set({ Authorization: "bearer " + token })).status).toBe(
      200,
    );
    expect((await request(app).get("/api/state?access_token=%20")).status).toBe(401);

    store.sessions.set("ghost", { token: "ghost", role: "player" });
    expect((await request(app).post("/api/play/unwrap").set(auth("ghost")).send({})).status).toBe(
      403,
    );

    for (const [method, path] of [
      ["post", "/api/players"],
      ["delete", "/api/players/x"],
      ["post", "/api/order/shuffle"],
      ["post", "/api/order/assign"],
      ["post", "/api/game/start"],
      ["post", "/api/play/for"],
      ["post", "/api/play/unwrap"],
      ["post", "/api/play/steal"],
      ["post", "/api/play/pass"],
      ["post", "/api/play/shield"],
      ["post", "/api/play/duel"],
      ["post", "/api/play/rotate"],
      ["post", "/api/pending"],
      ["post", "/api/clerk"],
      ["post", "/api/spare"],
      ["post", "/api/timer"],
      ["post", "/api/notes"],
      ["patch", "/api/config"],
      ["post", "/api/reset"],
    ] as const) {
      const req =
        method === "delete"
          ? request(app).delete(path)
          : method === "patch"
            ? request(app).patch(path)
            : request(app).post(path);
      expect((await req.send({})).status).toBe(401);
    }
  });
});
