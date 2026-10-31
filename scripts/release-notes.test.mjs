import assert from "node:assert/strict";
import { test } from "node:test";
import { releaseNotes } from "./release-notes.mjs";

const changelog = `# Changelog

## [1.20.0] - 2026-11-01

### Added
- Future feature.

## [1.2.0] - 2026-10-31

### Added
- 오늘의 코트 🏸

## [1.1.0] - 2026-10-30

### Fixed
- Older fix.

[1.1.0]: https://example.com/compare
`;

test("extracts exactly the requested version with or without a v prefix", () => {
  const expected = "### Added\n- 오늘의 코트 🏸\n";
  assert.equal(releaseNotes(changelog, "v1.2.0"), expected);
  assert.equal(releaseNotes(changelog, "1.2.0"), expected);
  assert.ok(!releaseNotes(changelog, "v1.1.0").includes("https://example.com"));
});

test("rejects missing versions, missing dates, and empty release entries", () => {
  assert.throws(() => releaseNotes(changelog, "v1.3.0"), /Missing/);
  assert.throws(() => releaseNotes(changelog), /required/);
  assert.throws(
    () => releaseNotes("## [1.2.0]\n- Feature", "v1.2.0"),
    /Missing/,
  );
  assert.throws(
    () => releaseNotes("## [1.2.0] - 2026-10-31\n### Added\n", "v1.2.0"),
    /Empty/,
  );
});

test("preserves prerelease and build metadata and accepts CRLF", () => {
  assert.equal(
    releaseNotes(
      "## [1.3.0-rc.1+build.2] - 2026-11-01\r\n\r\n- Preview.\r\n",
      "v1.3.0-rc.1+build.2",
    ),
    "- Preview.\n",
  );
});
