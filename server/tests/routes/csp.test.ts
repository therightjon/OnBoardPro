import { describe, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import helmet from "helmet";
import supertest from "supertest";
import { buildCspDirectives } from "../../config/security-headers";

function createApp(isDevelopment: boolean) {
  const app = express();
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: buildCspDirectives(isDevelopment)
      }
    })
  );

  app.get("/probe", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}

describe("Content Security Policy", () => {
  test("non-development CSP script-src excludes unsafe-inline", async () => {
    const app = createApp(false);
    const response = await supertest(app).get("/probe").expect(200);
    const cspHeader = response.headers["content-security-policy"];
    const scriptDirective = cspHeader
      ?.split(";")
      .map((part: string) => part.trim())
      .find((part: string) => part.startsWith("script-src"));

    assert.ok(cspHeader, "Content-Security-Policy header should be set");
    assert.ok(scriptDirective, "script-src directive should be present");
    assert.match(scriptDirective!, /^script-src 'self'$/);
    assert.equal(scriptDirective!.includes("'unsafe-inline'"), false);
  });

  test("development CSP allows inline/eval scripts for local tooling", async () => {
    const app = createApp(true);
    const response = await supertest(app).get("/probe").expect(200);
    const cspHeader = response.headers["content-security-policy"];

    assert.ok(cspHeader, "Content-Security-Policy header should be set");
    assert.match(cspHeader, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
  });
});
