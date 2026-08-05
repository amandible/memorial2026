import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { safeFilename, newStorageKey, formatBytes } from "../src/lib/artifact-files.ts";
import { parseKind } from "../src/lib/photos.ts";

/**
 * The filename a stranger supplies becomes part of an R2 object key. That is the
 * one place a submitted string reaches storage addressing, so the property worth
 * pinning down is that nothing in it can describe a path.
 */

describe("safeFilename", () => {
  test("strips directory components", () => {
    // Basename only — the directory part is dropped, not flattened into the name.
    assert.equal(safeFilename("../../etc/passwd"), "passwd");
    assert.equal(safeFilename("/absolute/path/notes.txt"), "notes.txt");
    assert.equal(safeFilename("C:\\Users\\joe\\recipe.doc"), "recipe.doc");
  });

  test("leaves no slash, backslash or traversal in the result", () => {
    for (const nasty of [
      "../../../root/.ssh/id_rsa",
      "..\\..\\windows\\system32",
      "a/b/c/../../d.txt",
      "....//....//x",
    ]) {
      const out = safeFilename(nasty);
      assert.ok(!out.includes("/"), `slash survived: ${out}`);
      assert.ok(!out.includes("\\"), `backslash survived: ${out}`);
      assert.ok(!out.startsWith("."), `leading dot survived: ${out}`);
    }
  });

  test("keeps ordinary names readable", () => {
    assert.equal(safeFilename("Sofia log 1971.pdf"), "Sofia-log-1971.pdf");
    assert.equal(safeFilename("harpsichord.jpg"), "harpsichord.jpg");
  });

  test("never returns empty, so a key can't end in a bare dash", () => {
    assert.equal(safeFilename(""), "file");
    assert.equal(safeFilename("..."), "file");
    assert.equal(safeFilename("/////"), "file");
    assert.equal(safeFilename("???"), "file");
  });

  test("truncates a very long name", () => {
    assert.ok(safeFilename("x".repeat(500) + ".txt").length <= 80);
  });
});

describe("newStorageKey", () => {
  test("stays under the artifacts prefix whatever the filename claims", () => {
    for (const nasty of ["../../evil", "/etc/passwd", "..\\..\\x", "normal.txt"]) {
      const key = newStorageKey(nasty);
      assert.ok(key.startsWith("artifacts/"), key);
      // One separator only: the prefix. Nothing submitted can add another.
      assert.equal(key.split("/").length, 2, key);
    }
  });

  test("two submissions of the same name get different keys", () => {
    assert.notEqual(newStorageKey("photo.jpg"), newStorageKey("photo.jpg"));
  });
});

describe("parseKind", () => {
  test("only a known kind passes through; everything else falls back to friends-family", () => {
    assert.equal(parseKind("friends-family"), "friends-family");
    assert.equal(parseKind("camping"), "camping");
    assert.equal(parseKind("gigs"), "gigs");
    // A typo, an injection attempt, or a missing field must not become a
    // fourth value — the column has a check constraint and the insert would throw.
    for (const junk of ["Gigs", "GIGS", "artifact", "photo", "", null, undefined, 0, {}, "'; drop table photos;--"]) {
      assert.equal(parseKind(junk), "friends-family");
    }
  });
});

describe("formatBytes", () => {
  test("reports sizes a person can read", () => {
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(2048), "2.0 KB");
    assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
    assert.equal(formatBytes(1536 * 1024 * 1024), "1.5 GB");
  });

  test("says so rather than showing a misleading zero", () => {
    assert.equal(formatBytes(null), "unknown size");
    assert.equal(formatBytes(0), "unknown size");
  });
});
