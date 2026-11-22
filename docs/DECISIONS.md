# Project decision record

**Scope update, 2026-11-18:** the owner approved a public, multi-group direction with open Google/Kakao signup and global Elo. Earlier private-only decisions below describe the released v1 architecture. See decision 16 and the [public-platform assessment](plans/2026-11-18-public-platform.md) for the planned change; the runtime has not yet been migrated.

Recorded on 2026-10-31 from the available conversation, specification, source, and releases. These notes explain the current baseline; [SPEC.md](../SPEC.md) contains the detailed contract and [HANDOFF.md](HANDOFF.md) maps the implementation. Revisit decisions deliberately and update the relevant sources when behavior changes.

## 1. Fast recording comes first

The user plays with a small private group and said result entry was the most important feature. Teams change after games, and a previous pairing can recur. Optimize selecting players, rotating teams, entering scores, and starting another game before expanding general administration or infrastructure.

The product records completed games, not live point-by-point play. A single group of roughly ten people is the scale assumption, not a hard signup limit. Use a Korean mobile interface, a simple black-and-white/light visual style, and the existing shadcn components and mascot.

## 2. PocketBase is embedded in Go

The user chose PocketBase and Google authentication and requested a new-server setup and self-hosted Docker Compose deployment. The approved specification selected a Go PocketBase extension for explicit transactions, deterministic Elo replay, and concurrency tests. Use the existing `apps/web` / `apps/server` pnpm workspace rather than recreating a standalone JavaScript-hook backend or adding a second API framework.

PocketBase manages `users` authentication. Domain data is stored in the custom SQL tables defined by the [migration](../apps/server/migrations/1770000000_initial.go): profiles, invitations, matches, participants, rating history/current ratings, revisions, requests, day versions, and the global revision. This explains why public profile names are not changed through the standard `users.name` field or collection editor.

## 3. Invitation-gated Google membership

Only Google-authenticated, invitation-activated members access group data. New accounts are pending; invitation redemption and activation are atomic. Single-use invitations expire after seven days and store hashes. The first signup is not automatically an admin: an operator explicitly promotes an activated account.

Keep Google account details separate from public profiles and do not expose other members' email addresses. Check current privileges in server transactions, including for admin nickname editing. Membership suspension preserves history while blocking access and new participation.

## 4. Elo is server-owned and reproducible

The original approved rules were initial rating 1,000, K = 32, separate singles/doubles pools, and win/loss-only results. Doubles used mean team ratings and full equal teammate deltas. **Decision 17 supersedes that fixed-K calculation** with Glicko and confidence. The baseline, separate disciplines, lack of score-margin multipliers, and absence of partner-specific pools remain.

Keep full-precision intermediate ratings. Store Korean dates and playing order; replay the affected pool after historical changes. Match changes, audit records, replay, revision updates, and retry results commit together. Do not manually patch a player's current rating to correct a past result.

## 5. Participation and authorship have different roles

The early request says any participant can enter a result. Accordingly, **any participant may create a record**, including when an administrator is playing. Creation does not grant every participant ownership of someone else's record: the shipped policy allows edits/deletes/moves by the author or an administrator, with restoration reserved for admins.

Ordinary authors must remain participants after their own edits. Admins can correct participants without changing immutable authorship. Deletion is soft so the audit trail and restoration path remain available. Retries use the same request ID; a genuine repeated game uses a new request ID.

## 6. Scoring and early wording

The original request mentioned recording how many points a game was played to. The clarification says final scores can vary and the group always plays deuce. The available current specification explicitly defines **21-point games, two-point deuce wins, and a 30-point cap**, and both [server](../apps/server/internal/kokko/model.go) and [client](../apps/web/src/lib/types.ts) enforce that rule.

Thus deuce-related final-score variation is shipped; arbitrary 15-point/custom targets or configurable caps are not. The complete early planning exchange is not available in this archive, so do not invent a separate approval or interpret the historical wording as an already implemented feature. A future change should update the specification, persisted match model as needed, both validation paths, entry UI, correction/replay behavior where affected, and tests together.

[v1.3.0](https://github.com/injoonH/kokko/releases/tag/v1.3.0) adds winning-score shortcuts to entry and corrections within these same rules. A tap fills only that team's score based on its opponent's score; manual typing never silently adjusts the other score. A blank opponent score offers 21 without filling the blank, and 30 or invalid opponent scores disable the shortcut. Both fields and all shortcuts remain locked while a save is unresolved. This improves entry speed without introducing another scoring mode or changing server authority.

## 7. Rotation and planning reduce repeated input

[PR #1](https://github.com/injoonH/kokko/pull/1) added all three pairings of four selected doubles players, one-tap alternate-team next games, and date-scoped tab memory. Team-side swaps preserve the selected pairing and its A/B labels; choosing a different pairing clears scores.

[PR #2](https://github.com/injoonH/kokko/pull/2) added Today's Court for a larger attending roster. The acting player is included because match creation requires participation. Suggestions first prioritize the other players' game counts and rest order. Among those choices, they use doubles Elo balance in five-percentage-point bands, then fewer repeated partnerships, exact balance, and deterministic ID tie-breaks. Both match types count as playing turns; only today's doubles partnerships count toward repetition.

Suggestions and attendance do not change Elo or write matches. They fill an ordinary draft, preserving entered scores unless explicitly replaced and preserving unresolved save requests until resolved. Expected win probabilities are descriptive Elo estimates, not guaranteed outcomes.

## 8. Nicknames are a public-profile operation

[v1.1.0](https://github.com/injoonH/kokko/tree/v1.1.0) added the offline `rename USER_ID NICKNAME` operator command. [v1.2.0](https://github.com/injoonH/kokko/releases/tag/v1.2.0) added live admin nickname editing. Both preserve photos, private auth fields, privileges, matches, and ratings and accept 1–20 Unicode code points after trimming whitespace.

Use `kokko_profiles.nickname`. The actor-less `RenameMember` method is for a server operator; online calls use `RenameMemberAsAdmin`, which checks current active-admin privileges inside the update transaction. Existing profiles of suspended members can be renamed without reactivating them.

## 9. One self-hosted process and portable releases

The user owns deployment through Docker Compose. One Go process serves frontend and API against one persistent data directory. The final container is non-root and read-only except for its data volume. Multi-platform images are built from pinned DHI bases; tests run on the native builder before target cross-compilation. Do not reintroduce ARM emulation for the build-time Go tests.

The user explicitly requested `gh` for commits and publishing, capitalized commit titles under 50 characters, assigned PRs, squash merges, and version tags/changelogs for features. GitHub-created signed commits and the existing protected-branch rules support that workflow. The user later authorized agents to choose and ship focused improvements without routine confirmation.

The release command reads committed changelog entries, checks main CI, creates a new tag, waits for the existing tagged image workflow, then publishes matching release notes. This avoids relying on a particular workstation's workflow-editing token permissions. A published release/image does not deploy or migrate the owner's running service by itself.

## 10. Win-rate predictions use current Elo

On 2026-11-01 the user requested a predicted win rate feature; see the [dated summary](history/2026-11-01-conversation.md). [v1.4.0](https://github.com/injoonH/kokko/releases/tag/v1.4.0) exposes the existing Elo expected-result formula directly within singles/doubles entry and corrections, and shares its calculation and percentage labels with Today's Court.

Use current server-supplied ratings for the selected discipline, mean team ratings for doubles, and initial 1,000 Elo for players without records in that pool. Identify initial ratings in the UI, show no estimate for incomplete or invalid lineups, round complementary percentages together, and avoid presenting rounded extremes as certainty. This is a descriptive estimate; it has no separate synergy adjustment or sample-size grading.

Historical forms explicitly say current Elo. Changing a draft's score or date does not reconstruct pre-match ratings or influence the preview. A known suspended historical participant can still be compared without permitting new participation. Prediction code is read-only: the server continues to own membership, match validation, scoring, replay, and idempotency. No prediction fields are added to mutations or the database.

## 11. Hypothetical Elo outcomes are isolated from entry

On 2026-11-09 the user asked to enter imaginary battles and see win percentage plus predicted Elo change; see the [dated request summary](history/2026-11-09-conversation.md). [v1.5.0](https://github.com/injoonH/kokko/releases/tag/v1.5.0) adds a dedicated member-only simulator and extends the shared entry preview with both win/loss Elo outcomes.

The original v1.5.0 preview used K = 32 and equal, zero-sum teammate adjustments. **Decision 17 replaces those equations** with personal Glicko outcomes and RD. Continue rounding only for display to one decimal place; rounded zero has no sign. Current-rating outcomes describe playing the matchup now, including in historical entry/corrections. They do not simulate rewriting history.

The simulator can compare any active lineup, including teams without the viewer. Its selections live only in component state. It neither reads nor writes entry drafts, pending requests, attendance, or lineup storage, and it has no match-save action. This keeps experimentation from displacing real results awaiting recording. Server membership, participation, scoring, and authoritative replay remain the boundary for actual records.

## 12. Crest tiers decorate the existing Elo ladder

On 2026-11-10 the user requested a ranking system with beautiful crest images; see the [dated summary](history/2026-11-10-conversation.md). [v1.6.0](https://github.com/injoonH/kokko/releases/tag/v1.6.0) adds six visual tiers to the existing server-ranked player list, Home, and player profiles. The [original crest family](CRESTS.md) was generated with the built-in image_gen tool and delivered as small transparent WebP assets.

Use the rounded Elo already shown to members so a boundary rating and its label agree. Bronze is below 900, followed by Silver at 900, Gold at 1,000, Platinum at 1,100, Diamond at 1,200, and Master at 1,300. Each discipline has its own tier. A positive current game count is required; period filters must not erase a tier, and a zero-game pool must not award one merely for its initial 1,000 Elo.

The next-tier gap is an exact distance in displayed Elo. The progress bar covers the last 100 Elo before promotion and clamps longer distances to zero; Master has no invented next target. Tiers update from current server snapshots after normal rating changes or historical replay. They are not persisted achievements, placement matches, season resets, or a change to Elo. Server-assigned ordinal ranks and shared ties remain authoritative; suspended members keep history but have no active standing.


## 13. Colored compact crests and one participant picker

After seeing v1.6.0, the user reported that the matching grayscale colors were hard to distinguish, that crests were too large, and that simulation and real match entry should use the same participant component. The follow-up is recorded in the [2026-11-10 summary](history/2026-11-10-conversation.md). [v1.6.1](https://github.com/injoonH/kokko/releases/tag/v1.6.1) fixes those usability issues.

Tier crests are an explicit exception to the surrounding monochrome interface: Bronze is copper, Silver cool steel, Gold yellow gold, Platinum emerald, Diamond blue, and Master violet. Existing shuttlecock motifs and distinct ornament remain, and tier names stay visible so color is not the only cue. The built-in image_gen tool recolored each original crest independently. Use compact images: 64px on personal tier cards, 56px in the guide, and 24px beside names in standings; keep player avatars prominent in standings.

Real entry, corrections, and the simulator share the controlled `ParticipantPicker` with avatar slots, an active-member dialog, swapping, and clearing. It owns only dialog state and never accesses storage or the API. Parents still own selected players, scores, rotations, drafts, and save requests. Pending real saves explicitly disable all picker controls, including portaled dialog actions. Sharing the UI must not let simulator changes replace real drafts or weaken server participation checks.

## 14. Home puts personal information before planning tools

The user reported that the large **다음 경기는 누구랑?** and **가상 대결** cards near the top pushed important information down. [v1.6.2](https://github.com/injoonH/kokko/releases/tag/v1.6.2) replaces them with two compact links below recent matches; the court link is shortened to **다음 경기 추천**. The [2026-11-10 summary](history/2026-11-10-conversation.md) records this request.

Keep Home ordered around filters, key statistics, personal tier, the Elo chart, and recent results. Optional planning tools follow in one row with 44px touch targets. The global match-entry action remains prominent. This changes presentation and priority only; court planning, simulation, filters, ratings, and draft behavior retain their existing contracts.


## 15. Profile streaks measure playing days

On 2026-11-13 the user requested a GitHub-like badminton streak feature on player profiles. [v1.7.0](https://github.com/injoonH/kokko/releases/tag/v1.7.0) implements the request; see the [dated summary](history/2026-11-13-conversation.md).

A streak measures consecutive Korean calendar dates with recorded participation, not wins or consecutive scheduled sessions. Combine singles and doubles, regardless of page filters. Use `allMatches` and server `today`; exclude deleted and future matches. Count repeated games individually for calendar intensity but once per date for streaks. Current streak may end yesterday until today is over; longest streak spans all history even beyond the latest 365-day calendar. Display this scope in Korean beside the calendar.

Derive activity from the existing authorized state snapshot rather than storing a separate counter or award. Historical corrections, deletions, and restorations therefore change the derived record. Keep the surrounding monochrome style, scroll the calendar within its mobile card, and expose daily counts through touch, keyboard navigation, and a date input. This feature has no effect on Elo, scoring, or match entry.

## 16. Public groups share service-wide Elo

On 2026-11-18 the owner requested a public service for their school's students, with self-service groups, Google/Kakao login in place of invitation codes, and a global dashboard, targeting approximately 100 DAU. They confirmed open registration and that Elo follows a person across groups, and authorized direct SSH inspection of the existing Pi. See the [request summary](history/2026-11-18-conversation.md) and [architecture/capacity assessment](plans/2026-11-18-public-platform.md).

This approves a new product direction, superseding the private-only target; it does not describe a shipped migration. Keep one service account and one global rating per discipline. Groups organize memberships and matches, and group standings filter their members' global ratings. Group ownership must not become the old installation-wide admin privilege, and existing private history needs an isolated legacy group rather than being exposed by removing invitation checks.

The observed Pi 4/8 GB has current CPU and memory headroom, while its database is on microSD and current application reads/replays are global. Retain PocketBase/Go/Compose for the pilot, improve storage and query/write patterns, and measure representative staging concurrency before public rollout. An earlier correction can affect global ratings in other groups, so replay must follow the global discipline timeline.

Opposing-team confirmation, provisional leaderboard thresholds, detailed public-profile exposure, and moderation UX are recommended policy work, not choices already specified by the owner. Kakao app credentials and real-provider callbacks require deployment configuration. Keep the current runtime private until the coordinated group/auth/API migration is validated.

## 17. Confidence-aware ratings take priority

On 2026-11-18 the owner prioritized Chess.com's confidence-based rating approach before the public-platform work and explicitly authorized changing existing scores by replaying recorded matches. [Issue #12](https://github.com/injoonH/kokko/issues/12) tracks implementation and deployment; [the rating contract](RATINGS.md) records the full formulas, settings, sources, and recovery rules.

Chess.com names Glicko and RD, but does not disclose a full parameter set or doubles extension. Use published Glicko-1, preserve the 1,000 baseline and separate disciplines, age RD by Korean dates, and document the individual-contribution doubles approximation. Defaults are RD 350, floor 30, and variance calibrated from RD 50 to 350 over 365 idle days. These are app choices, not claimed Chess.com internals. Show each player's own conditional changes and RD; do not retain a common team delta or zero-sum promise.

Persist pre/post RD and the last playing date. Replay both disciplines atomically once after the additive schema migration and before serving, with an explicit algorithm version and a single revision increment. Failure must roll back derived state and block startup. Original match, participant, audit, day-version, profile, and idempotency records stay intact. Preserve a pre-upgrade backup and rehearse on a copy before applying to the owner's real history. Keep existing private access until the public-platform migration is ready.

## 18. GitHub is an active continuation record

On 2026-11-18 the owner explicitly authorized frequent GitHub Issues and PRs so co-workers can continue unfinished work on other computers. Keep concrete scope, dependencies, decisions, validation, and remaining operations there. Issue/PR titles start with a capital letter and contain at most 50 characters; commit/squash titles retain the stricter below-50 rule. Do not publish credentials or personal match data. Public follow-up phases are tracked in issues #13–#16 and linked from the architecture plan.

## 19. Isolate groups before opening signup

After v1.8.0, the owner asked to move to the next steps. v1.9.0 implements [issue #13](https://github.com/injoonH/kokko/issues/13), with [GROUPS.md](GROUPS.md) as the data/access/order/recovery contract. Migrate all old records into private `legacy`, preserve existing Glicko caches and source/audit/retry data, and enforce current group membership before any detailed state, mutation, audit, invitation or online administration action. Service administrators have no membership bypass; local owners/moderators never acquire account-level powers.

Keep the canonical global date/day order for replay and present local positions/version tokens. Same-position edits retain their canonical slot; explicit local placement uses visible anchors, and default appends go at the global day's end. Replay the affected discipline across all groups. Ratings/RD stay global; detailed charts/activity/statistics stay group-local, and period change sums that group's deltas. Suppress global last-playing dates from group summaries. Group revision is not a complete snapshot ETag because shared global ratings can change elsewhere.

Provide private operator provisioning and safe membership selection for this gated stage. Preserve legacy draft keys and old request fingerprints, scope other groups separately, and block switching on unresolved saves. Keep Google invitations enabled until #14/#15 deliver public identities and self-service groups together; no public activation is introduced here. The release and issue record validation, backup rehearsal and actual deployment separately.

## 20. Link identities deliberately and gate activation

On 2026-11-20 the owner asked to continue to the next step after the private-isolation deployment. v1.10.0 implements the identity foundation of [#14](https://github.com/injoonH/kokko/issues/14); see [IDENTITY.md](IDENTITY.md) and the [dated continuation summary](history/2026-11-20-conversation.md). This follows the already approved open Google/Kakao direction without introducing a school-domain rule.

Keep one stable account across providers and groups. Require an authenticated, explicit linking action plus proof of the provider identity; reject automatic email matching, identities already owned by another account, and replacing an existing provider identity. Preserve account fields, profiles, roles and all rating/history data during linking and returning login. PocketBase v0.40.5's stock OAuth submit has implicit email linking and unverified-record link deletion, so kokko replaces that submit while retaining provider code exchange/parsing and the standard auth-rule/MFA/token response. Generic self-service unlink is blocked until a safe recovery/unlink flow exists.

Make email optional, request only Kakao nickname consent, and let users choose the public nickname. Public onboarding creates a profile and activates the account transactionally with no group membership or rating reset. Group-free accounts have an account/profile/linking page and can use a private invitation. State/match APIs continue checking persisted group membership. Onboarding retries preserve existing profile/privileges, and suspended accounts never reactivate through login or onboarding.

`KOKKO_PUBLIC_SIGNUP=false` remains the production default while #15/#16 and actual provider callbacks are unfinished. This switch is a rollout guard, not a change to the owner's open-registration decision. Google and Kakao credential pairs independently control provider availability; missing Kakao configuration must not disable Google. Automated provider/browser tests are evidence for application behavior, not proof of a live provider callback. Configure credentials separately on the host and record real staging validation in #14 before launch.

On 2026-11-22, the owner confirmed a real Kakao sign-in reached an unfinished signup. v2.0.1 treats that as recoverable through the original account's explicit linking flow. The same provider proof and active session are required. Only a pending member with no profile and just the verified provider link can be replaced. Moving the link and removing the unused signup and sessions commit together. Active and suspended accounts retain the original ownership protections. See [the dated summary](history/2026-11-22-conversation.md) and [#14](https://github.com/injoonH/kokko/issues/14).


## 21. Public players replace groups; opponents confirm

On 2026-11-21 the owner chose a League-of-Legends-like player model: global dashboard, mutual friends, a quick-match player list, and matches between any registered active players. They explicitly answered **“Make existing match details public”** and **“After one opposing player confirms.”** This supersedes decisions 16/19's proposed self-service groups and private-history product policy. See [the dated summary](history/2026-11-21-conversation.md), [PUBLIC.md](PUBLIC.md) and [issue #15](https://github.com/injoonH/kokko/issues/15).

v2.0.0 exposes approved public projections of existing/accepted results and profiles; it preserves source records, authorship and current/history Glicko caches at migration. Keep provider identity, email, others' privileges, pending requests, raw audits and reports private. A friendship is mutual and helps selection, never a requirement to play. Keep old group SQL/guards and draft/retry records only for compatibility/recovery; new arena actions use active account and participation checks.

Submit new games and participant score/date/order/withdrawal/restoration changes as private proposals. One active opposite-team participant must confirm; authors, teammates and admins cannot bypass this. Pending changes preserve the accepted result. Confirmation checks accepted versions and applies/replays atomically once. Original accepted lineups/disciplines/authorship are immutable to ordinary correction. Reserve playing order before confirmation so arrival order cannot rewrite chronology. Rejection/cancellation has no rating effect.

An admin may void an invalid accepted result with a mandatory reason, closing pending proposals and replaying ratings. Administrative reopening merely permits a fresh opponent-confirmed restoration. Blocking removes friendship and prevents new shared lineups/requests without rewriting past records. Public history is paged while SQL computes exact profile statistics/activity independently.

This releases the public data model, not an automatic open-registration rollout. Preserve `KOKKO_PUBLIC_SIGNUP=false` until real Google/Kakao callbacks (#14) and launch checks (#16). No new rating system, school-domain restriction, background matchmaking, chat or game assets are introduced. Rehearse a pre-upgrade backup with the published image before deploying; rollback needs the old archive and matching image.

## 22. Put global standings in a dedicated tab

On 2026-11-22 the owner approved a closer League of Legends ladder and a dedicated global leaderboard tab. v2.1.0 ships the public navigation first with the existing singles/doubles Elo standings. Home links to the full list, friends retain global places, and Settings moves to the signed-in avatar menu. The ordered tabs are 홈, 전체 순위, 경기 기록, 친구, 확인함. The separate seasonal LP rules are tracked in [#22](https://github.com/injoonH/kokko/issues/22) with a replay before rollout. See [#23](https://github.com/injoonH/kokko/issues/23) and the [November 22 conversation summary](history/2026-11-22-conversation.md).
