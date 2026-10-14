import { test } from "node:test";
import assert from "node:assert/strict";
import { translate } from "../src/i18n";

test("English stays the default source text while Chinese uses shared and host messages", () => {
  assert.equal(translate("en", { Timeline: "自定义" }, "Timeline"), "Timeline");
  assert.equal(translate("zh-CN", {}, "Timeline"), "时间轴");
  assert.equal(translate("zh-CN", { Timeline: "自定义" }, "Timeline"), "自定义");
  assert.equal(translate("zh-CN", {}, "An unknown native error"), "An unknown native error");
});

test("localized labels preserve application names and substitute values literally", () => {
  assert.equal(translate("zh-CN", {}, "Focus {app}", { app: "Editor $& {project}" }), "聚焦 Editor $& {project}");
  assert.equal(translate("en", {}, "Saved {count} samples.", { count: 0 }), "Saved 0 samples.");
  assert.equal(translate("en", {}, "Unknown {value}"), "Unknown {value}");
});
