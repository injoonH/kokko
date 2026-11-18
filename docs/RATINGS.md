# Confidence-aware ratings

Implemented in v1.8.0, tracked in [issue #12](https://github.com/injoonH/kokko/issues/12). This replaces fixed K=32 Elo, including existing history. The interface keeps the familiar Elo label.

## Sources and scope

[Chess.com's explanation](https://support.chess.com/en/articles/8566476-how-do-ratings-work-on-chess-com) identifies Glicko and rating deviation (RD): uncertainty in both players affects changes, and inactivity increases uncertainty. It does not publish a complete parameter set or a doubles algorithm. We do not claim identical Chess.com results or use Glicko-2 volatility.

Use [Mark Glickman's published Glicko-1 equations](https://www.glicko.net/glicko/glicko.pdf), with one completed game per rating period and simultaneous pre-game snapshots. The author's three-opponent example (approximately 1464.1 / RD 151.4) and two-sided prediction example are independently checked. Shared golden vectors verify Go/TypeScript parity, including unequal doubles confidence.

## App settings

| Setting | Contract |
| --- | --- |
| Initial rating | 1,000, separately for singles and doubles |
| Initial / maximum RD | 350 |
| Minimum post-game RD | 30 |
| Daily variance | `(350² − 50²) / 365` |
| Aging | `min(350, sqrt(lastRD² + dailyVariance × elapsedKoreanDates))` |
| Result | Win=1, loss=0; no score-margin adjustment |
| Ordering | Korean match date, shared within-day order, match ID tie-breaker |

The baseline, one-game periods, 365-day calibration, and doubles adapter are kokko choices. The calibration takes RD 50 to 350 over one year without games; it is not inferred from Chess.com. Same-day games have no additional aging. A player with no history starts at RD 350. Inactivity never changes the mean rating or stored game history. State snapshots age current RD to server `today`; stored current RD remains the value immediately after `last_played`.

## Doubles adapter

Team strength is the mean of its members. Treat player `i`'s contribution as `rating_i/n`, `RD_i/n`, where `n` is 1 or 2. The effective opposing contribution is:

```text
opponentRating = (sum(opponentRatings) − sum(otherTeammateRatings)) / n
opponentRD = sqrt(sum(opponentRD²) + sum(otherTeammateRD²)) / n
```

Apply Glicko's one-opponent update to that contribution, then multiply its posterior rating and RD by `n`, applying the app's RD floor. All participants use the same aged pre-match values. Never use an already-updated teammate or opponent while processing that match.

This is an independent-player approximation: it does not retain player covariances, partner effects, or team ratings. For singles it reduces exactly to the published update. Teammates can change by different amounts, and gains/losses need not sum to zero. A first equal-rating game changes each singles player by about ±162.2, or each doubles player by ±112.3, with RD 350.

For the displayed win probability, apply the author's two-sided prediction to team means and combined variance `sum(all participant RD²)/n²`. This differs from the conditional opponent-only expectation inside an individual rating update. Historical `expected` stores the two-sided pre-game forecast for partner/opponent performance statistics; members of a team share that forecast. Predictions show separate personal win/loss adjustments and RD. They use today's snapshot even in historical forms; changing the form date does not reconstruct pre-game history.

## Persistence and recovery

The additive migration adds `before_rd`/`after_rd` to history, `rd`/`last_played` to current ratings, and `rating_system` to meta. Schema migration alone leaves system=0. Before serving, the service transaction rebuilds both disciplines, sets system=1, and advances revision once. An error rolls everything back and prevents startup. Subsequent starts do not rewrite ratings. Unknown future system versions fail closed.

Historical corrections, insertion, ordering, deletion, restoration, and discipline changes use the same replay. Source matches, participants, audit revisions, day versions, profiles, invitations, authorship, and idempotency records are not rewritten by the rating migration. Tiers remain derived from displayed ratings and can change after recalculation.

Stop the serving process before operator commands. On an isolated data copy, `kokko ratings` reports match/history/player counts, changed player-discipline ratings, maximum absolute movement, and a digest of source matches, without changing domain records or applying schema migrations. `kokko ratings --apply` previews, applies pending migrations, and performs the same one-time atomic replay as server startup. A second preview should report zero changed ratings. Neither command prints names, tokens, or credentials.

Before deployment, retain an old-image PocketBase backup, the old image tag and exact deployment configuration, and the persistent encryption key separately. Rehearse on a copy and verify source-table digests and SQLite integrity before and after. Downgrading the image alone is insufficient: restore the pre-upgrade backup with the previous image. Migration rollback deliberately refuses to invent legacy scores. See [backup and recovery](../README.md#backups-and-recovery).

## Group isolation (v1.9.0)

Ratings and RD remain global per discipline. Group views contain only that group's historical rating rows and show current summaries for its visible players; stored global last-playing dates are not exposed. Charts sample global Elo at visible group matches, while period change sums those matches' deltas. Canonical global replay remains authoritative, including after cross-group corrections. The group schema migration itself does not recalculate or reset v1.8.0 ratings. See [GROUPS.md](GROUPS.md).
