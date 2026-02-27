import { describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import session from "express-session";
import supertest from "supertest";
import { csrfErrorHandler, csrfProtection } from "../../middleware/csrf";

function createAgent() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      secret: process.env.TEST_SESSION_SECRET || "csrf-test-secret",
      resave: false,
      saveUninitialized: false,
      store: new session.MemoryStore(),
      cookie: {
        httpOnly: true,
        sameSite: "strict",
      },
    }),
  );

  app.get("/csrf-token", csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
  });

  app.get("/csrf-secret-check", (req, res) => {
    res.json({ hasSecret: Boolean((req.session as any)?.csrfSecret) });
  });

  app.post("/protected", csrfProtection, (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use(csrfErrorHandler);

  return supertest.agent(app);
}

describe("CSRF middleware", () => {
  test("GET /csrf-token returns a token and stores a session secret", async () => {
    const agent = createAgent();

    const tokenResponse = await agent.get("/csrf-token").expect(200);
    assert.equal(typeof tokenResponse.body.csrfToken, "string");
    assert.ok(tokenResponse.body.csrfToken.length > 0);

    const secretResponse = await agent.get("/csrf-secret-check").expect(200);
    assert.equal(secretResponse.body.hasSecret, true);
  });

  test("POST /protected without token returns normalized 403", async () => {
    const agent = createAgent();
    await agent.get("/csrf-token").expect(200);

    const response = await agent.post("/protected").send({ hello: "world" }).expect(403);
    assert.deepEqual(response.body, { message: "Invalid CSRF token" });
  });

  test("POST /protected with valid X-CSRF-Token succeeds", async () => {
    const agent = createAgent();
    const tokenResponse = await agent.get("/csrf-token").expect(200);
    const token = tokenResponse.body.csrfToken as string;

    const response = await agent
      .post("/protected")
      .set("X-CSRF-Token", token)
      .send({ hello: "world" })
      .expect(200);

    assert.deepEqual(response.body, { ok: true });
  });

  test("POST /protected with tampered token returns 403", async () => {
    const agent = createAgent();
    const tokenResponse = await agent.get("/csrf-token").expect(200);
    const token = tokenResponse.body.csrfToken as string;
    const tamperedToken = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    const response = await agent
      .post("/protected")
      .set("X-CSRF-Token", tamperedToken)
      .send({ hello: "world" })
      .expect(403);

    assert.deepEqual(response.body, { message: "Invalid CSRF token" });
  });
});
