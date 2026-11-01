# Changelog

## [Unreleased]

## [1.4.0] - 2026-11-01

### Added

- Predicted win rates in match entry and corrections for singles and doubles. Complete the teams to compare their current Elo and expected chances; changing players, sides, pairings, or match type updates the preview without saving a match.
- Explicit current-Elo labels for historical entry and edits, plus a notice when players without records in that discipline use the initial 1,000 Elo. Incomplete or duplicate lineups do not show an estimate.
- Shared Elo probability calculation with Today's Court. Percentage labels round to complementary values, and extreme estimates display “under 1%” / “over 99%” rather than implying certainty.

### Deployment

- No database migration or new environment variables are required. Server scoring, permissions, rating replay, and save-retry protections are unchanged.
- Deploy `ghcr.io/injoonh/kokko:v1.4.0` by updating the Compose image, pulling, and restarting the app. Publishing the release does not update a running host.

## [1.3.0] - 2026-10-31

### Added

- Match entry and corrections now offer one-tap winning scores based on the other team's entered score, including deuce and the 30-point cap. Enter the losing score, then tap the winning team's button; both scores stay editable. No winning shortcut is offered against 30 points or an invalid opponent score.
- Mobile browser coverage verifies both team sides, manual corrections, draft restoration, and retry-safe saving with the winning-score shortcuts.

### Documentation

- Added a portable newcomer/agent handoff, project decision record, and dated conversation archive, linked from the README and agent workflow.
- Documented the C compiler and cgo prerequisites for backend race tests on a fresh development machine.

### Deployment

- No database migration, scoring-rule change, or new environment variables are required.
- Deploy `ghcr.io/injoonh/kokko:v1.3.0` by updating the Compose image, pulling, and restarting the app. Publication does not update a running host.

## [1.2.0] - 2026-10-31

### Added

- **Today's Court:** choose today's attending players, see their game counts, and get three doubles suggestions. Recommendations prioritize friends who have played less and rested longer, then use doubles Elo and partnership variety to choose teams.
- Open a suggested match directly in the score-entry form. Unfinished scores require an explicit choice before replacement; games awaiting a save response must be resolved first.
- One-tap quick rotation between all three doubles pairings, alternate-team next games after saving, and date-scoped lineup memory in the browser tab.
- Live administrator nickname editing in Settings → Group management, including Unicode validation, retryable errors, and support for suspended profiles. Match history, Elo, photos, and account privileges are preserved.
- A versioned changelog and a `gh`-based release command that checks merged-main CI, publishes a version tag, waits for its image build, and publishes matching GitHub Release notes.

### Deployment

- No database migration or new environment variables are required.
- The tagged workflow publishes `ghcr.io/injoonh/kokko:v1.2.0` for AMD64 and ARM64. Update the image in Compose, pull, and restart the app to deploy it. Existing data remains in the persistent volume.

## [1.1.0] - 2026-10-31

### Added

- Server-operator `rename USER_ID NICKNAME` command with trimmed, Unicode-aware nickname validation and preservation of account fields and match/rating history.

### Changed

- The `members` command lists current public nicknames, falling back to Google names for accounts without an activated profile.

## [1.0.1] - 2026-10-14

### Fixed

- Run Docker build-time Go tests on the builder's native architecture and cross-compile the final target executable, removing ARM emulation from multi-platform builds.

## [1.0.0] - 2026-10-14

### Added

- Initial private badminton tracker with Google sign-in, invitations, singles/doubles Elo, mobile match entry, historical corrections, statistics, profiles, and administration.
- Docker Compose deployment, backup/restore commands, CI validation, and versioned multi-platform GHCR images.

[Unreleased]: https://github.com/injoonH/kokko/compare/v1.4.0...main
[1.4.0]: https://github.com/injoonH/kokko/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/injoonH/kokko/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/injoonH/kokko/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/injoonH/kokko/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/injoonH/kokko/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/injoonH/kokko/tree/v1.0.0
