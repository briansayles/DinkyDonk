import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  defaultTimerSettings,
  normalizeTimerSettings,
} from "./timerSettings.js";

test("browser timer QR visibility defaults on and preserves the saved choice", () => {
  assert.equal(defaultTimerSettings.showNetworkViewerQr, true);
  assert.equal(normalizeTimerSettings({}).showNetworkViewerQr, true);
  assert.equal(
    normalizeTimerSettings({ showNetworkViewerQr: false }).showNetworkViewerQr,
    false,
  );
  assert.equal(
    normalizeTimerSettings({ showNetworkViewerQr: "false" }).showNetworkViewerQr,
    true,
  );
});
