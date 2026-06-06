import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeWinAnsi } from "../lib/api/pdf-text";

test("sanitizeWinAnsi maps typographic characters to ASCII", () => {
  const input =
    String.fromCharCode(0x201c) + "Test" + String.fromCharCode(0x201d) +
    String.fromCharCode(0x2014) + "ok" + String.fromCharCode(0x2026) +
    String.fromCharCode(0x2019) + "s";
  assert.equal(sanitizeWinAnsi(input), '"Test"-ok...\'s');
});

test("sanitizeWinAnsi strips characters outside the WinAnsi range", () => {
  const emoji = String.fromCharCode(0xd83d, 0xde00); // grinning face (surrogate pair)
  const arrow = String.fromCharCode(0x2192);
  assert.equal(sanitizeWinAnsi("a" + emoji + "b" + arrow + "c"), "abc");
});

test("sanitizeWinAnsi preserves Latin-1 accented characters", () => {
  const input = "caf" + String.fromCharCode(0xe9); // café
  assert.equal(sanitizeWinAnsi(input), "caf" + String.fromCharCode(0xe9));
});

test("sanitizeWinAnsi maps the euro sign to EUR", () => {
  assert.equal(sanitizeWinAnsi(String.fromCharCode(0x20ac) + "10"), "EUR10");
});

test("sanitizeWinAnsi maps non-WinAnsi control chars (NUL, C0, DEL, C1) to spaces", () => {
  const input =
    "a" + String.fromCharCode(0x00) + "b" + String.fromCharCode(0x07) +
    "c" + String.fromCharCode(0x7f) + "d" + String.fromCharCode(0x80) +
    "e" + String.fromCharCode(0x9f) + "f";
  assert.equal(sanitizeWinAnsi(input), "a b c d e f");
});

test("sanitizeWinAnsi is a no-op for empty input", () => {
  assert.equal(sanitizeWinAnsi(""), "");
});
