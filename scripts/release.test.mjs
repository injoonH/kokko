import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseVersion } from "./release.mjs";

test("release tags use full semantic versions and identify prereleases", () => {
  assert.deepEqual(releaseVersion("v1.2.0"), {
    version: "1.2.0",
    prerelease: false,
  });
  assert.deepEqual(releaseVersion("1.2.0+build.1"), {
    version: "1.2.0+build.1",
    prerelease: false,
  });
  assert.deepEqual(releaseVersion("v1.3.0-rc.1+build.2"), {
    version: "1.3.0-rc.1+build.2",
    prerelease: true,
  });
  for (const tag of [
    undefined,
    "",
    "v1",
    "v1.2",
    "v01.2.3",
    "v1.2.3-01",
    "v1.2.3/other",
    "v1.2.3\n",
  ])
    assert.throws(() => releaseVersion(tag), /semantic version/);
});
