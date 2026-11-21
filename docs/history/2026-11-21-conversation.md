# 2026-11-21 — Public players and opponent confirmation

## User decisions

The owner wants a League-of-Legends-like community with a global dashboard, mutual friends and a quick-match list that can include friends. Any active registered users should be able to play together. Private/self-service groups are no longer the desired product organization.

After clarification the owner explicitly chose:

1. **“Make existing match details public.”**
2. **“After one opposing player confirms.”** New results affect ratings after one participating opponent confirms.

These supersede the earlier private-history/self-service-group proposals. Existing open Google/Kakao registration intent, global per-person ratings, Korean mobile interface and fast changing-partner entry remain. The ongoing authorization to implement, validate, create assigned PRs, squash merge, tag features and write changelogs remains in effect.

## Implementation and continuation

[v2.0.0](https://github.com/injoonH/kokko/releases/tag/v2.0.0) ([PR #20](https://github.com/injoonH/kokko/pull/20)) implements [issue #15](https://github.com/injoonH/kokko/issues/15): public standings/profiles/accepted history, mutual friends/blocking, any-player search and private opponent-confirmed proposals. Pending corrections/withdrawals preserve accepted ratings; admin moderation records a reason and cannot bypass opponent confirmation. Migration preserves recorded results, source/audit/retry data and rating caches. Read [PUBLIC.md](../PUBLIC.md) for exact bounds and behavior, and the implementing PR linked from #15 for validation.

Feature publication and actual Docker deployment are separate. Check #15 for the backup, rehearsal and rollout receipt; do not assume a GitHub release changed the running host. No credentials or personal player data belong in this archive.

Public registration remains off on the Pi pending real Google/Kakao callbacks in #14 and launch readiness in #16. Kakao credentials, provider console configuration, account-erasure UX, off-host recovery and representative capacity checks remain external/launch work. The earlier Pi assessment still supports a measured roughly 100-DAU pilot; this change does not claim a completed load test or public launch.
