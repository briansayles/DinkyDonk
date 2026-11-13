import { strict as assert } from "node:assert";
import { test } from "node:test";
import { checkForNewRelease } from "./releaseCheck.js";

function releaseResponse(tag) {
  return {
    ok: true,
    json: async () => ({ tag_name: tag, draft: false, prerelease: false }),
  };
}

test("notifies only when the published version is newer", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    releaseResponse("app-v0.10.0"),
  );
  assert.equal(await checkForNewRelease("0.9.9"), "0.10.0");
  assert.equal(await checkForNewRelease("0.10.0"), null);
  assert.equal(await checkForNewRelease("0.11.0"), null);
  assert.equal(await checkForNewRelease("0.10.0-beta.1"), "0.10.0");
  assert.equal(await checkForNewRelease("0.10.0+build.1"), null);
  fetchMock.mock.mockImplementation(async () => releaseResponse("DinkyDonk-v1.0.0"));
  assert.equal(await checkForNewRelease("0.99.99"), "1.0.0");
});

test("surfaces failed checks and malformed releases", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => ({
    ok: false,
    status: 403,
  }));
  await assert.rejects(checkForNewRelease("0.4.0"), /HTTP 403/);
  fetchMock.mock.mockImplementation(async () => releaseResponse("unexpected-tag"));
  await assert.rejects(checkForNewRelease("0.4.0"), /Unrecognized release tag/);
  fetchMock.mock.mockImplementation(async () => releaseResponse("app-v0.5.0-rc.1"));
  await assert.rejects(checkForNewRelease("0.4.0"), /prerelease/);
  fetchMock.mock.mockImplementation(async () => ({
    ok: true,
    json: async () => ({ tag_name: "app-v0.5.0", draft: false, prerelease: true }),
  }));
  await assert.rejects(checkForNewRelease("0.4.0"), /invalid release/);
  fetchMock.mock.mockImplementation(async () => {
    throw new Error("offline");
  });
  await assert.rejects(checkForNewRelease("0.4.0"), /offline/);
  await assert.rejects(checkForNewRelease("not-a-version"), /Invalid version/);
});
