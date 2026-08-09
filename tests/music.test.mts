import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isAllowedMusicExtension, isVideoExtension } from "../src/lib/music.ts";

describe("isAllowedMusicExtension", () => {
  test("accepts every allowed extension", () => {
    for (const ext of ["mp3", "wav", "m4a", "aac", "flac", "mp4", "mov", "m4v"]) {
      assert.ok(isAllowedMusicExtension(`song.${ext}`), ext);
    }
  });

  test("is case-insensitive", () => {
    assert.ok(isAllowedMusicExtension("song.MP3"));
  });

  test("rejects disallowed extensions", () => {
    for (const ext of ["exe", "html", "svg", "js", "php", "doc"]) {
      assert.equal(isAllowedMusicExtension(`file.${ext}`), false, ext);
    }
  });

  test("matches only the last extension — a double extension isn't sniffed as the first", () => {
    assert.equal(isAllowedMusicExtension("song.mp3.html"), false);
    assert.ok(isAllowedMusicExtension("notes.html.mp3"));
  });

  test("a filename with no extension is rejected", () => {
    assert.equal(isAllowedMusicExtension("song"), false);
  });
});

describe("isVideoExtension", () => {
  test("video extensions are video", () => {
    for (const ext of ["mp4", "mov", "m4v"]) {
      assert.ok(isVideoExtension(`clip.${ext}`), ext);
    }
  });

  test("audio extensions are not video", () => {
    for (const ext of ["mp3", "wav", "m4a", "aac", "flac"]) {
      assert.equal(isVideoExtension(`song.${ext}`), false, ext);
    }
  });

  test("case-insensitive", () => {
    assert.ok(isVideoExtension("clip.MP4"));
  });
});
