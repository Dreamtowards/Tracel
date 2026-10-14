import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { analyze } from "@tracel/timeline/analytics";
import { createCapture } from "@tracel/timeline/mock";
import { saveRange } from "../src/native";

Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
afterEach(() => clearMocks());
const capture = createCapture();
const payload = {
  source: "Tracel simulated capture",
  epoch: capture.epoch,
  range: capture.bounds,
  analytics: analyze(capture, capture.bounds),
};

test("cancelling the native save dialog never writes a file", async () => {
  const commands: string[] = [];
  mockIPC((command) => {
    commands.push(command);
    if (command === "plugin:dialog|save") return null;
    throw new Error("Unexpected file write after cancellation");
  });
  assert.equal(await saveRange(payload), "cancelled");
  assert.deepEqual(commands, ["plugin:dialog|save"]);
});

test("native export preserves the selected range and analytics in UTF-8 JSON", async () => {
  let exported: unknown;
  mockIPC((command, args) => {
    if (command === "plugin:dialog|save") return "C:\\exports\\range.json";
    if (command === "plugin:fs|write_text_file") {
      exported = JSON.parse(new TextDecoder().decode(args as Uint8Array));
      return;
    }
    throw new Error(`Unexpected command: ${command}`);
  });
  assert.equal(await saveRange(payload), "saved");
  assert.deepEqual(exported, JSON.parse(JSON.stringify(payload)));
});

test("failed native writes reject instead of reporting a successful export", async () => {
  mockIPC((command) => {
    if (command === "plugin:dialog|save") return "C:\\exports\\range.json";
    throw new Error("Disk full");
  });
  await assert.rejects(() => saveRange(payload), /Disk full/);
});
