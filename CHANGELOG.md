# Changelog

## [Unreleased]

## [1.7.0] - 2026-11-13

### Added

- Player profiles now show a GitHub-style monochrome activity calendar for the latest 365 Korean calendar days, with daily match counts, active days, and current and all-time longest playing streaks.
- Singles and doubles both count, regardless of result or profile filters. Multiple matches increase a day's intensity but count as one active day. Current streaks can end today or yesterday, so an unfinished day does not break them.
- Tap a day, use arrow keys, or choose a date to inspect its match count. The calendar scrolls horizontally on mobile and opens at the most recent dates; members without recent games see an empty-state message.
- Activity follows the existing authoritative match snapshot, including historical corrections, deletions, and restorations. No activity awards or additional records are stored.

### Deployment

- No database migration or new environment variables are required. Scoring, Elo, permissions, and match-entry behavior are unchanged.
- Deploy `ghcr.io/injoonh/kokko:v1.7.0` by updating the Compose image, pulling, and restarting. Publishing the release does not update a running host.

## [1.6.2] - 2026-11-10

### Fixed

- Home now shows filters, key statistics, personal tier, the Elo chart, and recent matches before optional planning tools. The statistics also appear above the tier card to make personal results visible sooner on mobile.
- Replaced the large **다음 경기는 누구랑?** and **가상 대결** cards near the top with a compact two-link row below recent matches. The court link is now **다음 경기 추천**; both links keep 44px touch targets.

### Deployment

- No database migration or new environment variables are required. Court planning, simulation, filters, ratings, and match-entry behavior retain their existing contracts.
- Deploy `ghcr.io/injoonh/kokko:v1.6.2` by updating the Compose image, pulling, and restarting. Publishing the release does not update a running host.

## [1.6.1] - 2026-11-10

### Fixed

- Tier crests now have six distinct colors: copper Bronze, cool-steel Silver, yellow-gold Gold, emerald Platinum, blue Diamond, and violet Master. Original shuttlecock motifs, tier ornament, and readable labels remain.
- Reduced oversized crests to 64px on personal tier cards, 56px in the tier guide, and 24px beside tier names in standings. Player avatars are again the main identity image in standings.
- Simulation, real match entry, and corrections now use one avatar-based participant picker and active-member dialog, with consistent player swapping and a clear-slot action. Entry retains its scores and pending-save locks; simulation keeps its selections separate from real drafts, attendance, and lineup memory.

### Deployment

- No database migration or new environment variables are required. Elo calculations, tier thresholds, ranking positions, and server participation checks keep their existing contracts.
- Deploy `ghcr.io/injoonh/kokko:v1.6.1` by updating the Compose image, pulling, and restarting. Publishing the release does not update a running host.

## [1.6.0] - 2026-11-10

### Added

- Six Elo rank tiers with original transparent badminton crests: Bronze, Silver, Gold, Platinum, Diamond, and Master. Ornament increases across a coherent graphite-and-silver family; all six optimized WebP images total about 201 KiB.
- Personal tier cards on Home and player profiles, with current Elo, discipline-specific game counts, the next tier, and promotion progress. Players without games in a discipline remain unranked.
- Crests and tier labels in the player standings, plus an accessible six-tier guide explaining thresholds, shared ranks, and progress. Singles/doubles tiers are independent and use displayed current Elo, regardless of period filters.

### Fixed

- Standings keep inactive players after active players and display zero Elo accurately. Current-Elo tiers follow the same rounding as the displayed rating, so a displayed boundary and its crest agree.

### Deployment

- No database migration or new environment variables are required. Tiers derive from existing server ratings; Elo calculation, shared ordinal ranks, permissions, and match-entry behavior retain their existing contracts.
- Deploy `ghcr.io/injoonh/kokko:v1.6.0` by updating the Compose image, pulling, and restarting. Publishing the release does not update a running host.

## [1.5.0] - 2026-11-09

### Added

- **Imaginary matchups (가상 대결):** open from Home or match entry, choose any active singles/doubles lineup, and compare win percentages and predicted Elo changes for a win or loss. The signed-in player can sit out of the imagined matchup.
- Predicted win/loss Elo changes in the existing entry and correction preview. Calculations use the full-precision expected probability and K = 32; each doubles teammate receives the displayed adjustment in full.
- Team swaps, player swaps, clearing selections, and quick doubles rotation in the simulator. Simulations stay on that screen and never replace scored drafts, unresolved save requests, attendance, or remembered match lineups.

### Deployment

- No database migration or new environment variables are required. Simulations do not save matches or change ratings; recorded matches retain server validation and authoritative Elo replay.
- Deploy `ghcr.io/injoonh/kokko:v1.5.0` by updating the Compose image, pulling, and restarting the app. Publication does not update a running Docker host.

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

[Unreleased]: https://github.com/injoonH/kokko/compare/v1.7.0...main
[1.7.0]: https://github.com/injoonH/kokko/compare/v1.6.2...v1.7.0
[1.6.2]: https://github.com/injoonH/kokko/compare/v1.6.1...v1.6.2
[1.6.1]: https://github.com/injoonH/kokko/compare/v1.6.0...v1.6.1
[1.6.0]: https://github.com/injoonH/kokko/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/injoonH/kokko/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/injoonH/kokko/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/injoonH/kokko/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/injoonH/kokko/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/injoonH/kokko/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/injoonH/kokko/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/injoonH/kokko/tree/v1.0.0
