# Changelog

## [Unreleased]

## [2.3.0] - 2026-11-23

### Added

- 확인함 in the top and bottom navigation shows how many results you can confirm. The count refreshes as you move between pages.
- Match rows show 승/패 and list your team and score first. Match detail, 확인함 cards and 오늘의 코트 suggestions also put your side on the left; court suggestions read 우리 팀 and 상대 팀.

### Changed

- One shape scale: 12px corners for buttons and inputs, 16px for cards and dialogs, round chips.
- 전체 순위 toggles use the same segmented control as the other screens.
- Solid black now marks only the main action. A selected quick team combination shows an outline, a tint and a check. Both court teams and the current Elo stat use the same neutral card as their neighbours.

### Deployment

- Upgrade the Compose image to `ghcr.io/injoonh/kokko:v2.3.0` with the existing volume and configuration. No migration or environment change. `/api/kokko/me` adds a `pending` count for active players.

## [2.2.2] - 2026-11-23

### Fixed

- Keep each rating and match statistic readable on one line on narrow phones by giving wider values more room in the compact summary.

### Deployment

- The `v2.2.2` Compose image includes the v2.2.1 density update and uses the existing volume and configuration.

## [2.2.1] - 2026-11-23

### Fixed

- Fit more on small screens with a shorter header and bottom bar, a single row of Home and profile stats, and compact rank, history, and leaderboard rows. Home brings recent matches above the Elo chart and discovery links.
- Bring team selection, quick rotations, and score inputs closer together. Keep the date picker, score shortcuts, save, and confirmation actions easy to tap.

### Deployment

- Upgrade the Compose image to `ghcr.io/injoonh/kokko:v2.2.1` using the existing volume and configuration. This is a frontend layout update.

## [2.2.0] - 2026-11-23

### Added

- Independent singles and doubles ranked years, five placements, and seasonal rank points across ten tiers. Divisions run IV to I through Diamond. Master leads to two Grandmaster slots and one Challenger slot in each pool, recalculated at Korean midnight. Kokko's own crests, promotion progress and season peaks appear on Home and profiles.
- The public leaderboard defaults to **시즌 랭크**. The **Elo** view keeps the lifetime standings, and the match list and details show applied LP separately from Elo.

### Deployment

- The additive rank tables store a replayable projection and the original opening date. First startup schedules the next Korean date. A fresh isolated deployment can set `KOKKO_RANKED_START` for rehearsal. Back up before upgrading. Lifetime Glicko, confirmed results and account records stay available.

## [2.1.0] - 2026-11-22

### Added

- **전체 순위** opens a public leaderboard from the mobile bottom bar and the desktop or tablet header. Switch between doubles and singles with a shareable URL, browse player profiles, and filter to friends while retaining global positions.

### Changed

- Home links to the leaderboard. Settings and the signed-in player's profile are available from the header avatar menu, with match entry beside it.

### Deployment

- The existing Elo standings power the new route. No migration or environment change is required.

## [2.0.1] - 2026-11-22

### Fixed

- Link a login started by mistake to your existing account even after it created an unfinished signup. Use your original login and **설정 → 로그인 계정 연결** to verify the second provider. The unused signup is removed after linking. Your profile, permissions, and rating history stay with your existing account. Signup screens point returning players to this flow.

### Deployment

- No migration, new environment variables, or rating replay. Both providers are configured on the Pi, and public signup remains off during launch validation (#14, #16).

## [2.0.0] - 2026-11-21

### Added

- Public global singles/doubles standings, searchable player profiles and accepted match details, including existing history as authorized by the owner. Unique #handles distinguish equal nicknames; provider identities, emails, private requests, raw audits and reports stay private.
- Mutual friend requests, acceptance, removal and blocking. Friends appear first in fast entry and court selection; any active unblocked players can play without a friendship or group membership.
- A mobile confirmation inbox: new results affect Elo after one opposing participant confirms. Pending corrections, withdrawals and restorations keep the accepted result unchanged. Retry and concurrent-confirmation guards prevent double application; reserved playing order handles late approval. Confirmation cards show placement intent; public ordinals count accepted games only, while the private court timeline retains the order of accepted and participating pending games.
- Private match reporting and service-admin review/void actions with recorded reasons. Administrative reopening still requires a fresh opponent-confirmed restoration. Participants can find excluded games in Settings.

### Changed

- Replaced private-group navigation and invitation entry with the public player/friend model. Legacy tables, guarded read/operator APIs and saved requests remain for recovery; fresh legacy match writes return 410. Existing source records, authorship and rating caches are retained without retroactive approval or a rating reset.
- Match entry folds optional predictions so final scores stay closer to team/rotation controls. Participant corrections retain accepted teams/disciplines and original authorship. Friends/recent players are quick choices, with full search and authoritative Elo/RD for other players. Court planning includes the member's participating pending games without changing public statistics.
- History, search, social, inbox and standings use bounded pages. SQL computes exact profile totals and full-history streaks independently; charts show up to 200 filtered games with a truncation notice. Older group drafts can be imported; uncertain pre-upgrade saves resolve before conversion without losing scores.

### Deployment

- Breaking access-policy/API change: existing approved nickname/photo/match/lineup/score/rating details become public. Keep authentication metadata, reports and pending proposals private. The additive migration creates public handles, friendship/blocking, proposals, moderation and order metadata; Glicko settings and existing caches are unchanged.
- Back up with v1.10.0 and rehearse restoration/migration with the published v2 image before upgrading. Downgrade requires that archive and matching image. No new environment variables; preserve the data volume and encryption key.
- Keep `KOKKO_PUBLIC_SIGNUP=false` until real provider callbacks (#14) and public launch checks (#16) pass. Releasing v2 neither configures Kakao nor enables signup or deploys the running Pi.

## [1.10.0] - 2026-11-20

### Added

- Google/Kakao login buttons follow the providers configured on the server. Kakao needs only nickname consent and supports accounts without an email address. Callback validation binds state, PKCE, origin and the current account, and clears failed/cancelled requests.
- Optional invitation-free signup lets new users choose their public nickname. The account page works before joining a group, including profile editing and private-group invitations. New accounts never join the existing friends group automatically.
- Explicit login-provider linking keeps the same account, nickname, permissions, ratings and history. Email matching never merges accounts; conflicting identities and suspended accounts are rejected. Provider tokens remain server-side, and ordinary users cannot remove their only login through PocketBase's generic unlink endpoint.

### Deployment

- The migration makes account email optional without changing existing records or replaying ratings. Back up with v1.9.0 and rehearse recovery before upgrade; rollback requires the old archive and matching image.
- Compose adds `KAKAO_CLIENT_ID` (REST API key), `KAKAO_CLIENT_SECRET`, and `KOKKO_PUBLIC_SIGNUP` (default `false`). Existing Google-only invitation deployments remain supported. Keep public signup off until self-service groups, launch checks and real provider callbacks are ready in #14–#16.
- The identity contract documents provider setup, consent, linking and staging checks. Automated callbacks use synthetic providers; publication does not configure real Kakao credentials, verify live sign-in or update the running Pi.

## [1.9.0] - 2026-11-19

### Added

- Private group isolation: existing members, matches and invitations migrate to **우리 모임**. Group owners/moderators have local moderation rights, separate from service administrators. Private state, audits, invitations and mutations check current membership, including on cached retries.
- Members with multiple operator-provisioned groups can switch in the header. Each group has its own player picker, drafts, attendance and remembered lineups; unresolved entry saves block switching. Existing friends-group drafts and retry requests remain compatible.
- Global singles/doubles rating and confidence continue across groups, while match history, charts, activity and period statistics show the selected group. Local day positions hide other groups' ordering; historical corrections still replay the full global discipline timeline.
- Operator commands create private groups, set memberships/moderators and issue group-specific invitations. Public signup, self-service creation/joining, Kakao and the public dashboard remain gated for the following phases.

### Deployment

- The atomic group schema migration adds group/membership/day-version tables and match/invitation references. Original serialized matches, authorship, audit/retry records and all current/history ratings are preserved at upgrade. Existing account administrators are mapped to legacy group moderation without gaining access to unrelated groups.
- Take a v1.8.0 backup and rehearse restoration/migration before upgrading. Recovery requires restoring that archive with the old image; image-only downgrade and lossy schema rollback are unsupported. No new environment variables are required.
- Publish/deploy `ghcr.io/injoonh/kokko:v1.9.0`; release publication does not update a running host. The group contract and issue #13 contain privacy, ordering, compatibility and recovery details.

## [1.8.0] - 2026-11-18

### Added

- Confidence-aware Glicko-1 ratings replace fixed K=32 Elo. Rating deviation (RD) reflects uncertainty in each player, including opponents and doubles partners. Inactivity raises uncertainty without lowering scores; singles and doubles remain separate.
- Home and player profiles explain rating confidence. Entry, corrections, simulation, and court suggestions use current RD; conditional win/loss changes are shown per player because teammates can differ.
- An operator `ratings` preview and `ratings --apply` command support migration rehearsal. Published worked examples, shared Go/browser golden vectors, and atomic migration coverage verify the calculation.

### Deployment

- The additive schema migration stores RD, last playing dates, and the rating-system version. Before serving, both disciplines and all rating history are replayed atomically once from recorded matches. Existing scores, charts, statistics, tiers, and ranks can change; match records, permissions, and retry protections are preserved.
- Back up with the previous image before upgrading, and rehearse against an isolated copy. Startup refuses a failed replay. Recovery requires restoring the pre-upgrade backup together with the previous image; downgrading the image alone is insufficient. No new environment variables are required.
- Deploy `ghcr.io/injoonh/kokko:v1.8.0`. Publication does not update a running Docker host. The rating contract documents app-specific doubles and inactivity choices; these are not claimed to be Chess.com's private settings.

### Documentation

- Added active GitHub issue/PR continuation guidance and tracked the rating prerequisite plus four public-platform phases.
- Recorded the approved public-service direction: open Google/Kakao signup, self-service groups, service-wide Elo, and about 100 DAU. Added an architecture/migration plan and a read-only assessment of the existing Raspberry Pi. Public signup, group isolation, and the global dashboard remain planned.

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
