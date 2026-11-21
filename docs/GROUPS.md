# Private group isolation

> **Historical v1.9/v1.10 contract:** v2.0.0 intentionally supersedes the private group product. The owner authorized existing match publication and opponent-confirmed player-wide results on 2026-11-21. Read [PUBLIC.md](PUBLIC.md). Group SQL/operator APIs remain for compatibility/recovery, not the current UI or public permissions. Old match POST is retry-only and can resolve an active author’s matching cached save after leaving a group.

v1.9.0 implements the isolation phase in [issue #13](https://github.com/injoonH/kokko/issues/13). Public registration and self-service groups remain [#14](https://github.com/injoonH/kokko/issues/14) / [#15](https://github.com/injoonH/kokko/issues/15). This release keeps Google invitations and private access; it does not expose a public group directory, signup activation, or global dashboard.

v1.10.0 adds the [gated identity foundation](IDENTITY.md): configured Google/Kakao login, explicit linking, and optional profile onboarding without membership. Production still defaults to private invitations. Self-service groups/dashboard and the coordinated public launch remain #15/#16; existing isolation and rating contracts below are unchanged.

## Data and migration

`1794960001_groups.go` creates `kokko_groups`, `kokko_group_members`, and `kokko_group_days`, and adds group references to matches/invitations. All original profiles, including suspended participants, belong to private group **우리 모임** (`legacy`). The earliest active service administrator becomes its owner; other existing administrators become moderators. Without an active administrator, the earliest active profile becomes owner. Existing account roles do not change. On an empty installation, the first invitation redemption establishes the legacy owner.

The migration preserves match IDs, serialized match data, canonical order, scores, authorship, versions, audit/retry records, and Glicko current/history rows. Existing day versions seed the legacy group's versions. SQLite cannot add a populated reference column with a non-null default, so the migration adds nullable foreign keys, backfills them, and installs required/immutable-reference triggers. New null/unknown group assignments and group changes are rejected. The JSON group reference must agree with the SQL reference; missing legacy JSON fields normalize to `legacy` without rewriting archived data.

Take a v1.8.0 PocketBase backup and retain its image and deployment configuration before upgrading. Rehearse restoration and migration on an isolated copy. Rollback requires that archive with v1.8.0; changing only the image is insufficient. `migrate down` deliberately refuses a lossy rollback. No new environment variables are required. Publishing a release does not deploy a host.

## Access contract

- Active account status and current persisted group membership are required. Unknown groups and private groups without membership return the same 404. Service administrators do not bypass membership.
- `owner` / `moderator` can correct/delete/restore group matches and manage that group's invitations. Ordinary members retain authorship/participation rules. All real new matches require the recording member's participation.
- New participants must be active in the same group. Historical participants who left or were suspended can remain on corrections/restores. They retain visible historical profiles but have status `left` or `suspended`, cannot be newly selected, and have no current group standing.
- An account-level service administrator may rename profiles visible in their selected group. Group ownership/moderation alone never grants account-level nickname or installation privileges. Offline operator tools remain explicit service-wide actions.
- Every mutation, cached retry, audit request and invitation action rechecks current membership/privileges. A previously issued token or completed-request result cannot restore revoked group access.
- Invitations belong to exactly one group. Redemption adds only that membership; joining another group preserves the account's nickname, avatar, existing privileges and ratings. A blocked membership cannot be bypassed with another invitation.

## HTTP and snapshots

`GET /api/kokko/me` includes only the account's active group memberships (`id`, `name`, `visibility`, `role`). Pending/suspended accounts receive no groups.

`state`, match revisions, invitations and online nickname administration use a `group` query parameter. Match mutation bodies include `groupId`; a supplied query context must agree. Missing context means `legacy`, with the same membership checks. It never means all groups or automatic enrollment. Old legacy request fingerprints remain compatible because the added mutation field is omitted when absent.

State contains `group` and the acting account's `me.serviceRole`. For existing clients, `me.role` is a derived `admin`/`member` group permission, not the account role. The group includes its explicit owner/moderator/member role.

Snapshots include only that group's matches, deleted records, history, day versions, roster and historical participants. Global current rating/RD/game-count summaries are included only for those visible players. Other groups' match IDs, dates, orders, players, scorelines, history and invitations are absent. The stored global `lastPlayed` is not exposed in group ranking summaries; its response field is empty after server-side RD aging.

Standings rank current active group members by their global discipline rating. Current Elo and tiers include all groups. Games, win/loss, partners/opponents, activity and charts use the selected group. Period Elo change is the **sum of that group's visible match deltas**, excluding hidden-group contributions. A chart shows global Elo at this group's match times, starting immediately before the first included game. Current Elo can differ from the last chart point after play elsewhere.

Snapshot revision and day versions are group-local. A foreign group's write does not expose its ordering metadata. Global rating summaries can nevertheless change through shared players, so group revision is not an ETag for the entire snapshot. Public bounded reads/conditional caching remain work for #16.

## Canonical order and replay

Persist one global timeline per discipline using date, canonical shared day order and ID. Return contiguous per-group day positions to clients. Use per-group day versions for local placement intent.

- A new default append goes at the end of the canonical day.
- An ordinary same-date, same-local-position correction preserves its canonical slot.
- Explicit placement inserts before the selected visible group match, or immediately after the group's last visible match when placing last. With no group anchor, append globally.
- Date changes, deletion and restoration maintain canonical order; another group's relative order stays intact.
- Replay the entire affected discipline across groups after any correction. A group A change can alter later group B ratings/RD. Do not replay only the selected group or reset ratings on membership changes.

Mutation results and newly written audit snapshots use group-local positions. Existing pre-group audit/retry snapshots were entirely legacy-group records and remain unchanged. SQL/canonical match data stays internal.

## Mobile context and operator provisioning

The header names the current private group. Members with multiple groups can switch using the shadcn selector; selection is tab-local and account-specific. Switching reloads the page to clear stale route/state data. Drafts, remembered doubles lineups and attendance have separate group namespaces. Legacy storage keys remain readable as legacy-only data, preserving pre-upgrade drafts and unresolved saves. Never use them as a fallback in another group. Unresolved entry/edit requests block switching until the result is resolved; ordinary unfinished scores remain saved for returning later.

For this gated phase, stop the server before operator commands. Discover IDs with `members` and `groups`, then:

```sh
kokko group-create OWNER_ID '주말 모임'
kokko group-member GROUP_ID USER_ID member
kokko group-member GROUP_ID USER_ID moderator
kokko group-member GROUP_ID USER_ID left
kokko group-member GROUP_ID USER_ID blocked
kokko invite --group GROUP_ID
```

Use the deployment's existing image, environment and volume for these commands. Groups created here are private. The owner must already be an activated profile. The membership command refuses to remove/demote the owner; ownership transfer and self-service membership UI are future product work. `promote` changes only the service role, and does not grant group membership/moderation.

Validation covers populated-schema migration and actual archive recovery, old request retries, revoked tokens and memberships, group/admin privilege separation, hidden-record projections, group-local ordering, global replay equivalence, invitations, and mobile switching with preserved drafts/pending saves. Check issue #13 for the implementing PR, release and actual deployment receipt.
