import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getViewerShareUrl } from "./viewerShare.js";

test("viewer share URL preserves the network address, port and path", () => {
  assert.equal(getViewerShareUrl({
    hostname: "192.168.10.25",
    origin: "http://192.168.10.25:60884",
    pathname: "/",
  }), "http://192.168.10.25:60884/");
  assert.equal(getViewerShareUrl({
    hostname: "timer.example.test",
    origin: "https://timer.example.test",
    pathname: "/viewer",
  }), "https://timer.example.test/viewer");
});

test("viewer share URL rejects loopback and unspecified addresses", () => {
  for (const hostname of ["localhost", "HOST.LOCALHOST", "127.0.0.1", "127.0.0.2", "[::1]", "0.0.0.0", "[::]"]) {
    assert.equal(getViewerShareUrl({ hostname, origin: "http://example.test", pathname: "/" }), null);
  }
});
