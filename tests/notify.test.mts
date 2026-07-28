import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { notifyGuestbookEntry, notifyPhotoSubmission, notificationsConfigured } from "../src/lib/notify.ts";

/**
 * The load-bearing property: notifications never throw.
 *
 * They run after the submission is already saved, so an exception escaping here
 * would turn a successful tribute into an error the visitor sees. Every case
 * below asserts "does not reject", not "sends".
 */

const realFetch = globalThis.fetch;
const saved: Record<string, string | undefined> = {};

before(() => {
  for (const k of ["RESEND_API_KEY", "RESEND_FROM", "ADMIN_NOTIFY_TO", "APP_BASE_URL"]) {
    saved[k] = process.env[k];
  }
});
after(() => {
  globalThis.fetch = realFetch;
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
beforeEach(() => {
  globalThis.fetch = realFetch;
  process.env.RESEND_API_KEY = "test-key";
  process.env.RESEND_FROM = "notifications@example.com";
  process.env.ADMIN_NOTIFY_TO = "admin@example.com";
});

const entry = { name: "Margaret", message: "A memory.", email: null };
const photos = { count: 2, submitter: "David", email: null, captions: ["On the boat"] };

describe("notifications never throw", () => {
  test("when Resend returns an error status", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("nope", { status: 422 }))) as typeof fetch;
    await assert.doesNotReject(() => notifyGuestbookEntry(entry));
    await assert.doesNotReject(() => notifyPhotoSubmission(photos));
  });

  test("when the network fails", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("ECONNREFUSED"))) as typeof fetch;
    await assert.doesNotReject(() => notifyGuestbookEntry(entry));
    await assert.doesNotReject(() => notifyPhotoSubmission(photos));
  });

  test("when nothing is configured", async () => {
    delete process.env.RESEND_API_KEY;
    globalThis.fetch = (() => {
      throw new Error("fetch should not be called when unconfigured");
    }) as typeof fetch;
    assert.equal(notificationsConfigured(), false);
    await assert.doesNotReject(() => notifyGuestbookEntry(entry));
  });
});

describe("configuration", () => {
  test("needs all three of key, from and recipient", () => {
    assert.equal(notificationsConfigured(), true);
    for (const k of ["RESEND_API_KEY", "RESEND_FROM", "ADMIN_NOTIFY_TO"]) {
      const keep = process.env[k];
      delete process.env[k];
      assert.equal(notificationsConfigured(), false, `should be false without ${k}`);
      process.env[k] = keep;
    }
  });
});

describe("content", () => {
  test("the guestbook message is included in full, so it can be judged from the inbox", async () => {
    let body: Record<string, string> = {};
    globalThis.fetch = ((_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return Promise.resolve(Response.json({ id: "x" }));
    }) as unknown as typeof fetch;

    await notifyGuestbookEntry({ name: "Margaret", message: "A specific memory.", email: "m@example.com" });
    assert.match(body.subject, /Margaret/);
    assert.match(body.text, /A specific memory\./);
    assert.match(body.text, /m@example\.com/);
    assert.match(body.text, /already live/);
  });

  test("a long message is truncated rather than sent whole", async () => {
    let body: Record<string, string> = {};
    globalThis.fetch = ((_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return Promise.resolve(Response.json({ id: "x" }));
    }) as unknown as typeof fetch;

    await notifyGuestbookEntry({ name: "X", message: "a".repeat(5000), email: null });
    assert.ok(body.text.length < 3000, "should not carry a 5000-character message");
    assert.match(body.text, /\[…\]/);
  });

  test("photos send one email for the batch, and say they are not public", async () => {
    let body: Record<string, string> = {};
    globalThis.fetch = ((_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return Promise.resolve(Response.json({ id: "x" }));
    }) as unknown as typeof fetch;

    await notifyPhotoSubmission({ count: 12, submitter: "David", email: null, captions: ["On the boat"] });
    assert.match(body.subject, /12 from David/);
    assert.match(body.text, /NOT public/);
    assert.match(body.text, /On the boat/);
  });
});
