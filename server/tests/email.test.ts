import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { encryptEnvelopeSecret, decryptEnvelopeSecret } from "../utils/envelope";
import { buildTransportOptions, mapNodemailerError, type MaterializedSmtpSettings } from "../features/email/smtp-settings.service";
import { computeBackoff, computeQuietHoursWindow, parseTimeToMinutes } from "../jobs/notification-email";
import { renderImmediateEmail, renderDigestEmail } from "../features/email/templates";
import type { NotificationOutboxEntry } from "@shared/schemas";

const ORIGINAL_PRIMARY = process.env.APP_KMS_ROOT_KEY;
const ORIGINAL_FALLBACKS = process.env.APP_KMS_ROOT_KEY_FALLBACKS;

const primaryKey = Buffer.from("0123456789primary0123456789primary").toString("base64");
const oldKey = Buffer.from("abcdefghijfallbackabcdefghijfallback").toString("base64");
const newKey = Buffer.from("newnewnewnewnewnewnewnewnewnewnewnew").toString("base64");

beforeEach(() => {
  process.env.APP_KMS_ROOT_KEY = primaryKey;
  delete process.env.APP_KMS_ROOT_KEY_FALLBACKS;
});

afterEach(() => {
  if (ORIGINAL_PRIMARY === undefined) {
    delete process.env.APP_KMS_ROOT_KEY;
  } else {
    process.env.APP_KMS_ROOT_KEY = ORIGINAL_PRIMARY;
  }
  if (ORIGINAL_FALLBACKS === undefined) {
    delete process.env.APP_KMS_ROOT_KEY_FALLBACKS;
  } else {
    process.env.APP_KMS_ROOT_KEY_FALLBACKS = ORIGINAL_FALLBACKS;
  }
});

test("encryptEnvelopeSecret and decryptEnvelopeSecret roundtrip", () => {
  const secret = "s3cr3t-value";
  const encrypted = encryptEnvelopeSecret(secret);
  const decrypted = decryptEnvelopeSecret(encrypted.payload);
  assert.equal(decrypted, secret);
  assert.equal(encrypted.version, "v1");
  assert.ok(encrypted.payload.ciphertext.length > 0);
});

test("decryptEnvelopeSecret accepts rotated root keys", () => {
  process.env.APP_KMS_ROOT_KEY = oldKey;
  const encrypted = encryptEnvelopeSecret("rotate-me");

  process.env.APP_KMS_ROOT_KEY = newKey;
  process.env.APP_KMS_ROOT_KEY_FALLBACKS = oldKey;

  const decrypted = decryptEnvelopeSecret(encrypted.payload);
  assert.equal(decrypted, "rotate-me");
});

describe("SMTP transport builders", () => {
  const baseSettings: MaterializedSmtpSettings = {
    enabled: true,
    hostname: "smtp.example.com",
    port: 587,
    security: "starttls",
    authType: "login",
    username: "user@example.com",
    password: "pass",
    fromName: "OnBoardPro",
    fromEmail: "no-reply@example.com",
    allowHeaderSpoofing: false,
    passwordConfigured: true,
    passwordSetAt: new Date(),
    encryptionVersion: "v1",
    updatedAt: new Date(),
  };

  test("buildTransportOptions configures LOGIN auth method", () => {
    const options = buildTransportOptions(baseSettings);
    const asAny = options as any;
    assert.equal(asAny.authMethod, "LOGIN");
    assert.equal(asAny.auth.user, "user@example.com");
    assert.equal(asAny.auth.pass, "pass");
    assert.equal(options.requireTLS, true);
  });

  test("buildTransportOptions throws when SMTP disabled", () => {
    assert.throws(() => buildTransportOptions({ ...baseSettings, enabled: false }), /disabled/);
  });

  test("mapNodemailerError maps STARTTLS failures", () => {
    const mapped = mapNodemailerError({ code: "EHLOSTARTTLS", message: "STARTTLS not offered" });
    assert.equal(mapped.code, "starttls_unavailable");
  });
});

describe("notification email helpers", () => {
  const baseEntry: NotificationOutboxEntry = {
    id: "outbox-1",
    notificationId: "notif-1",
    userId: "user-1",
    status: "pending",
    retryCount: 0,
    nextAttemptAt: new Date(),
    createdAt: new Date(),
    digestCandidate: false,
    lastError: null,
    deliveredAt: null,
  };

  test("computeBackoff grows exponentially with jitter", () => {
    const now = Date.now();
    const first = computeBackoff(baseEntry);
    const firstDelay = first.getTime() - now;
    assert.ok(firstDelay >= 2 * 60 * 1000);
    assert.ok(firstDelay <= 2 * 60 * 1000 + 30 * 1000);

    const later = computeBackoff({ ...baseEntry, retryCount: 5 });
    const laterDelay = later.getTime() - now;
    assert.ok(laterDelay >= 60 * 60 * 1000);
    assert.ok(laterDelay <= 60 * 60 * 1000 + 30 * 1000);
  });

  test("computeQuietHoursWindow handles overnight quiet hours", () => {
    const start = parseTimeToMinutes("22:00");
    const end = parseTimeToMinutes("06:00");
    const sample = new Date();
    sample.setHours(23, 30, 0, 0);
    const quiet = computeQuietHoursWindow(start, end, sample);
    assert.equal(quiet.inQuiet, true);
    assert.ok(quiet.nextEnd instanceof Date);

    const activeSample = new Date();
    activeSample.setHours(15, 0, 0, 0);
    const active = computeQuietHoursWindow(start, end, activeSample);
    assert.equal(active.inQuiet, false);
  });
});

describe("email templates", () => {
  test("renderImmediateEmail builds comment subject", () => {
    const notification = {
      id: "notif-1",
      type: "comment.created",
      payload: {
        candidate: { name: "Jane Candidate" },
        comment: { preview: "Great update!" },
        actor: { name: "Alex" },
      },
      createdAt: new Date(),
    };
    const email = renderImmediateEmail(notification);
    assert.equal(email.subject, "[OnBoardPro] New comment on Jane Candidate");
    assert.ok(email.text.includes("Great update"));
  });

  test("renderDigestEmail lists weekly notifications", () => {
    const digest = renderDigestEmail("weekly", [
      {
        id: "notif-1",
        type: "task.overdue",
        payload: { task: { title: "Submit report" } },
        createdAt: new Date(),
      },
    ]);
    assert.equal(digest.subject, "[OnBoardPro] Your Weekly notifications");
    assert.ok(digest.text.includes("Submit report"));
  });
});
