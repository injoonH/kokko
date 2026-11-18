# Conversation summary — 2026-11-19

The owner’s request to move onto the next steps followed the completed v1.8.0 confidence-rating release. Work continued across midnight on the first public-platform prerequisite: [group isolation #13](https://github.com/injoonH/kokko/issues/13).

[v1.9.0](https://github.com/injoonH/kokko/releases/tag/v1.9.0) preserves existing friends/history in private **우리 모임**, adds checked group memberships and local owner/moderator/member roles, and separates them from service-wide administration. Current rating/RD follows people across groups; private match details, charts, activity, local ordering, day versions and period statistics stay scoped. Existing legacy drafts, invitations, authorship, audit/retry records and ratings are retained. Multi-group members have a header selector with isolated storage and unresolved-save protection.

This is the gated isolation stage. Google registration still requires invitations; open Google/Kakao identities, self-service creation/joining and the public dashboard remain #14/#15. The owner did not add new signup or ranking-integrity policy in this follow-up. Read [GROUPS.md](../GROUPS.md) and decision 19 for the exact access/order/operator/recovery contracts.

Backend coverage checks populated-data migration, actual archive restoration, old cached requests, revoked memberships/tokens, cross-group projections, separate privileges, global replay, and local ordering. Mobile coverage checks group selection, scoped player pickers, separate drafts, preserved scores and pending-save protection. An isolated copy of the Pi’s v1.8.0 data migrated successfully without changing the prior source or rating caches: 101 match records, 336 rating-history rows and 11 profiles became one private legacy group. No personal rows or credentials were exported or archived here.

The implementing PR, release checks and final deployment/backup receipt are linked in issue #13. Publication alone is not evidence of a live upgrade. Co-workers should start with HANDOFF.md, verify current source/host state, and continue with #14, #15 and #16 as tracked.
