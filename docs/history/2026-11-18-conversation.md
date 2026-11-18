# Conversation summary — 2026-11-18

## User request

The owner wants to expand kokko beyond the original friend group so students at their school can register freely, create groups, join each other, and use a service-wide highest-Elo dashboard. They requested Google or Kakao accounts in place of invitation codes and asked whether PocketBase and the current Raspberry Pi hosting are appropriate for approximately 100 daily active users.

In response to the architecture questions, they confirmed:

1. Inspect the host directly with `ssh raspberrypi`.
2. Elo follows each person across groups.
3. Registration is open, rather than restricted to verified school accounts.

These choices supersede the earlier private-only/single-group product target. Fast mobile match entry and the established separate singles/doubles Elo rules remain relevant to the next design.

## Assessment and recorded plan

Read-only SSH inspection found a Pi 4 Model B with 8 GB RAM, low current load, approximately 4.17 GiB available memory, and a healthy v1.7.0 container. The actual Go process used about 51.5 MiB RSS. The application database was about 608 KiB with 11 accounts and 101 match records; it was stored on the microSD-backed root filesystem. No account details or credentials were exported, and no service settings or data were changed.

The recommendation is to retain the React/Go/PocketBase/Compose stack for the initial public rollout, retain the Pi for a pilot, improve persistent storage/backups, and change the application's data-access and write patterns before opening signup. The current app serves one whole-group state snapshot and rebuilds a discipline's entire rating history on every mutation; those patterns need to change for growth.

The [public-platform plan](../plans/2026-11-18-public-platform.md) records the proposed groups/memberships model, global per-discipline rating ownership, scoped permissions, Google/Kakao onboarding, legacy-data migration, paginated queries, incremental Elo appends, and staging load-test criteria. Opposing-team confirmation, provisional leaderboard thresholds, and detailed moderation policy are recommendations for implementation, not additional user decisions already made.

This work records requirements and an assessment. It does not claim that public signup, multiple groups, or the new dashboard have shipped. The memory entry points and specification distinguish this new target from the current released private-group behavior.
