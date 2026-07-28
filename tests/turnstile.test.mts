import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstile } from "../src/lib/turnstile.ts";

/**
 * The outage policy lets a form accept submissions when Cloudflare is
 * unreachable. That is a deliberate hole, and these tests pin its edges —
 * particularly that it never widens to cover a *rejected* token.
 *
 *   npm test
 */

const realFetch = globalThis.fetch;
let savedSecret: string | undefined;
let savedEnv: string | undefined;

/** Replace fetch for one case. Each test sets its own siteverify behaviour. */
function stubFetch(impl: () => Promise<Response>) {
  globalThis.fetch = impl as typeof fetch;
}

before(() => {
  savedSecret = process.env.TURNSTILE_SECRET;
  savedEnv = process.env.NODE_ENV;
  process.env.TURNSTILE_SECRET = "dummy-for-test";
  // Production, so the missing-secret dev bypass can't mask a failure.
  process.env.NODE_ENV = "production";
});

after(() => {
  globalThis.fetch = realFetch;
  process.env.TURNSTILE_SECRET = savedSecret;
  process.env.NODE_ENV = savedEnv;
});

beforeEach(() => {
  globalThis.fetch = realFetch;
});

describe("Cloudflare unreachable", () => {
  test("deny blocks the submission", async () => {
    stubFetch(() => Promise.reject(new Error("ECONNREFUSED")));
    assert.equal((await verifyTurnstile("tok", null, "deny")).ok, false);
  });

  test("allow accepts it and flags it unverified", async () => {
    stubFetch(() => Promise.reject(new Error("ECONNREFUSED")));
    const r = await verifyTurnstile("tok", null, "allow");
    assert.equal(r.ok, true);
    assert.equal(r.unverified, true);
  });

  test("a non-2xx counts as an outage, not a verdict", async () => {
    stubFetch(() => Promise.resolve(new Response("gateway blew up", { status: 502 })));
    assert.equal((await verifyTurnstile("tok", null, "deny")).ok, false);
  });

  test("deny is the default when no policy is given", async () => {
    stubFetch(() => Promise.reject(new Error("ECONNREFUSED")));
    assert.equal((await verifyTurnstile("tok", null)).ok, false);
  });
});

describe("Cloudflare rejects the token", () => {
  const rejected = () =>
    Promise.resolve(Response.json({ success: false, "error-codes": ["invalid-input-response"] }));

  test("deny blocks", async () => {
    stubFetch(rejected);
    assert.equal((await verifyTurnstile("tok", null, "deny")).ok, false);
  });

  // The one that matters. "allow" covers outages only; a bot signal is still a
  // bot signal. If this ever passes true, the policy has widened into a hole.
  test("allow ALSO blocks — the policy never overrides a real verdict", async () => {
    stubFetch(rejected);
    const r = await verifyTurnstile("tok", null, "allow");
    assert.equal(r.ok, false);
    assert.notEqual(r.unverified, true);
  });
});

describe("unexpected responses", () => {
  test("a body without success:true does not pass", async () => {
    stubFetch(() => Promise.resolve(Response.json({ nonsense: 1 })));
    assert.equal((await verifyTurnstile("tok", null, "allow")).ok, false);
  });

  test("success must be boolean true, not merely truthy", async () => {
    stubFetch(() => Promise.resolve(Response.json({ success: "yes" })));
    assert.equal((await verifyTurnstile("tok", null, "allow")).ok, false);
  });
});

describe("happy path", () => {
  test("success:true is accepted and not flagged", async () => {
    stubFetch(() => Promise.resolve(Response.json({ success: true })));
    const r = await verifyTurnstile("tok", null, "deny");
    assert.equal(r.ok, true);
    assert.equal(r.unverified, undefined);
  });
});

describe("missing token", () => {
  test("is refused without calling siteverify", async () => {
    stubFetch(() => {
      throw new Error("siteverify should not be called without a token");
    });
    assert.equal((await verifyTurnstile(null, null, "allow")).ok, false);
  });
});
