import { test } from "node:test";
import assert from "node:assert/strict";
import { accentForeground, accentPresets, defaultAccent, validAccent } from "../src/theme";

test("custom accents accept only full hex colors, including saved preferences", () => {
  for (const value of [defaultAccent, "#FF8800", "#000000", ...accentPresets.map((preset) => preset.color)]) assert.ok(validAccent(value));
  for (const value of [null, {}, 123, "#fff", "#12345678", "red", "url(https://example.com)", "#12gg45"]) assert.equal(validAccent(value), false);
});

test("accent foreground remains legible on light and dark custom colors", () => {
  assert.equal(accentForeground("#ffffff"), "#18181b");
  assert.equal(accentForeground(defaultAccent), "#18181b");
  assert.equal(accentForeground("#000000"), "#fafafa");
  assert.equal(accentForeground("#123456"), "#fafafa");
  assert.equal(accentForeground("#777777"), "#fafafa");
});
