# Changelog

## [Unreleased]

### Documentation

- Added a portable newcomer/agent handoff, project decision record, and dated conversation archive, linked from the README and agent workflow.

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

[Unreleased]: https://github.com/injoonH/kokko/compare/v1.2.0...main
[1.2.0]: https://github.com/injoonH/kokko/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/injoonH/kokko/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/injoonH/kokko/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/injoonH/kokko/tree/v1.0.0
