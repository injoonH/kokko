# Project decision record

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

The user accepted the proposed Elo rules. The current approved rules are initial rating 1,000, K = 32, separate singles/doubles pools, and win/loss-only results. Doubles uses mean team ratings; both winning teammates receive the full team delta, and both opponents receive the opposite delta. There is no score-margin multiplier or partner-specific rating pool.

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

Use K = 32 and the full expected probability, with zero-sum changes between teams for each outcome. Each doubles teammate receives the entire displayed adjustment. Round only for display to one decimal place; rounded zero has no sign. Current-Elo outcomes describe playing the matchup now, including when displayed in historical entry/corrections. They do not simulate the effect of rewriting history.

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
