# Conversation summary — 2026-11-20

The owner asked to resume and then “Go onto the next step.” The existing public-service direction and authorization for Issues, assigned PRs, squash merges and tagged/changelog releases remain in force. No new school-domain restriction, ranking policy or provider credential was supplied.

The v1.9.0 private-isolation release was verified deployed on the Pi with a backup/restore/migration rehearsal and unchanged source/rating data. Issue #13 contains its operational receipt. Existing friends/history remain private; Google is configured and Kakao credentials were absent when checked. An earlier optional Kakao setup question was unanswered; that absence is not an answer or approval.

Work continued on [identity #14](https://github.com/injoonH/kokko/issues/14). The v1.10.0 foundation adds provider-neutral Google/Kakao login, nickname onboarding, a group-free account page and explicit authenticated provider linking. Accounts are keyed by stable provider identity; email matches never merge accounts. Linking keeps account ownership, privileges, profile and ratings intact. Kakao supports missing email and requests only nickname consent. New activation does not join the legacy group, and suspensions remain effective.

Public activation is off by default through `KOKKO_PUBLIC_SIGNUP=false`. This is the coordinated rollout guard from the existing architecture plan, not a reversal of open registration. Self-service groups/global standings remain #15, hosting/performance/launch checks remain #16, and real provider setup/callback evidence remains tracked in #14. Synthetic integration/browser callbacks do not prove live Google/Kakao validation. Secrets must be configured outside chat/Git.

Read [IDENTITY.md](../IDENTITY.md) and decision 20 for behavior, provider setup, migration and recovery. The [implementing PR #19](https://github.com/injoonH/kokko/pull/19) and [v1.10.0 release](https://github.com/injoonH/kokko/releases/tag/v1.10.0) are tracked in issue #14. Check that issue for final validation/publication and any deployment receipt; this archive does not assume that publishing an image updates the Pi.
