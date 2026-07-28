import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { checkPassword, expectedToken } from "../src/lib/admin-password.ts";

/**
 * The admin password is the only thing standing between the public and the
 * ability to hide entries and read submitter email addresses. These pin the
 * behaviour that matters: no password configured means nobody gets in.
 */

let saved: string | undefined;

before(() => {
  saved = process.env.ADMIN_PASSWORD;
});
after(() => {
  process.env.ADMIN_PASSWORD = saved;
});

describe("checkPassword", () => {
  test("accepts the configured password", () => {
    process.env.ADMIN_PASSWORD = "correct-horse-battery-staple";
    assert.equal(checkPassword("correct-horse-battery-staple"), true);
  });

  test("rejects a wrong password of the same length", () => {
    process.env.ADMIN_PASSWORD = "correct-horse-battery-staple";
    assert.equal(checkPassword("correct-horse-battery-stapes"), false);
  });

  test("rejects a prefix of the real password", () => {
    process.env.ADMIN_PASSWORD = "correct-horse-battery-staple";
    assert.equal(checkPassword("correct-horse"), false);
  });

  test("rejects an empty attempt", () => {
    process.env.ADMIN_PASSWORD = "correct-horse-battery-staple";
    assert.equal(checkPassword(""), false);
  });

  // The one that matters. A missing env var must not become an open door —
  // notably, empty-attempt-vs-empty-config must not compare equal.
  test("with ADMIN_PASSWORD unset, nothing is accepted", () => {
    delete process.env.ADMIN_PASSWORD;
    assert.equal(checkPassword(""), false);
    assert.equal(checkPassword("anything"), false);
    assert.equal(checkPassword("undefined"), false);
  });

  test("with ADMIN_PASSWORD set to empty string, nothing is accepted", () => {
    process.env.ADMIN_PASSWORD = "";
    assert.equal(checkPassword(""), false);
    assert.equal(checkPassword("anything"), false);
  });
});

describe("session token", () => {
  test("is not the password, and is not reversible to it", () => {
    process.env.ADMIN_PASSWORD = "correct-horse-battery-staple";
    const token = expectedToken();
    assert.ok(token);
    assert.notEqual(token, process.env.ADMIN_PASSWORD);
    assert.doesNotMatch(token!, /correct-horse/);
    assert.match(token!, /^[0-9a-f]{64}$/);
  });

  test("changes when the password changes, invalidating old cookies", () => {
    process.env.ADMIN_PASSWORD = "first-password";
    const a = expectedToken();
    process.env.ADMIN_PASSWORD = "second-password";
    assert.notEqual(a, expectedToken());
  });

  test("is null when no password is configured", () => {
    delete process.env.ADMIN_PASSWORD;
    assert.equal(expectedToken(), null);
  });
});
