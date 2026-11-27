# Players, friends and recorded results

Public standings, player profiles, mutual friends and a temporary quick-match roster have been the product since v2.0.0. The owner approved public access to existing match details on November 21, 2026 and asked to apply the pending match queue and record future results directly on November 27. [Decision 26](DECISIONS.md#26-record-results-when-saved) · [Issue #32](https://github.com/injoonH/kokko/issues/32)

## Match recording

- An active member who played may record a game, correct its score or order, withdraw it or restore it. Score validation, active lineup checks and blocks apply. Ordinary corrections preserve the lineup, discipline and original author.
- A save applies the match, writes its audit and request receipt, and replays affected Elo and seasonal LP in one transaction. Keep canonical playing dates and positions. Explicit placement uses current day versions and match anchors. Changes use the current match version. Retrying the same request with the same payload returns its original result.
- Players can report an invalid result privately. Service administrators may exclude it from play history and rankings with an audited reason. A participant can restore an administrator-excluded game after review. Withdrawn games are visible to participants and administrators in Settings.
- Match history, today's court and rankings use the recorded games. `/api/kokko/arena/matches` accepts authenticated saves. The former submission path resolves requests through the same direct save. Old `/inbox` links open match history. Private-group save receipts remain available to the original account.

## Public data and friends

- The public views show nicknames, avatars, handles, match dates, lineups, scores and rating history. Keep provider details, email, privileges, invitations, stored submissions, reports and audit records private. Keep suspended players in their historical matches and omit them from current standings and new lineups.
- Friends use requests and acceptance. Friendship is a quick-selection shortcut. Blocking removes the relationship and prevents new shared lineups or friend requests. Past recorded games remain visible under the public rules.
- Reads are bounded. History, standings and social use 25-item pages, search uses 20, charts use 200 games plus a baseline, and partner and opponent tables show up to 50 each. Day selection, quick selection and today's court support up to 1,000 matches, 100 players and 12 attendees respectively. Profiles calculate exact totals and activity independently of pagination.
- The public `/leaderboard` shows [season rank](RANKED.md) and lifetime Elo for each discipline. The URL preserves the selected view and discipline. Signed-in viewers can filter to friends with their global positions. New players start at Elo 1,000 and RD 350. Public profiles are in the avatar menu.

## Upgrade to direct recording

Back up the stopped app with its installed image. Restore the archive into a separate volume and boot the published [v2.4.0 image](https://github.com/injoonH/kokko/releases/tag/v2.4.0) there first. Check that the pending queue empties, recorded IDs and lineups match the queued payloads, and the existing match and identity records survive. Verify the Elo and LP replay and repeat startup to check idempotence.

Before serving, v2.4.0 applies pending rows using their reserved dates and positions. The batch retains the original actors and replays each affected discipline once. The transaction keeps the whole queue pending if validation or replay fails. Resolved legacy rows and old request receipts retain their audit and retry data. A prior rejected or cancelled save returns its failure to the original caller. A valid applied result returns the recorded match.

Retain the active data volume, provider configuration and `KOKKO_PUBLIC_SIGNUP` launch gate. Record actual deployment evidence in [issue #32](https://github.com/injoonH/kokko/issues/32). Real provider callbacks and public workload checks remain tracked in [#14](https://github.com/injoonH/kokko/issues/14) and [#16](https://github.com/injoonH/kokko/issues/16).
