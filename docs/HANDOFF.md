# Start here: project handoff

This is the portable entry point for a newcomer or coding agent working on another computer. Read it with [AGENTS.md](../AGENTS.md); no previous chat, original workstation, or assistant memory is required.

Reviewed on **2026-11-21** for **[v2.0.0](https://github.com/injoonH/kokko/releases/tag/v2.0.0)**. The earlier Pi assessment observed v1.7.0; check [issue #12](https://github.com/injoonH/kokko/issues/12) for the subsequent deployment/backup receipt and recheck the host before assuming its version. Use the release tag and Git history for the exact source commit.

**Rating baseline:** v1.8.0 implements confidence-aware ratings and the owner-authorized replay of existing history, prioritized before public-platform work. See [issue #12](https://github.com/injoonH/kokko/issues/12) and [the Glicko contract](RATINGS.md).

**Public baseline:** v2.0.0 ([PR #20](https://github.com/injoonH/kokko/pull/20)) replaces the private group UI with global standings, public profiles/history, mutual friends, universal active-player search and a temporary quick-match roster. The owner explicitly approved publishing existing match details and requiring **one opposing participant** to confirm new results. Pending corrections/withdrawals preserve accepted results; rating math stays unchanged. Read [PUBLIC.md](PUBLIC.md), decision 21 and [issue #15](https://github.com/injoonH/kokko/issues/15).

**Identity and launch gates:** Google/Kakao login and explicit secure linking shipped in v1.10.0. `KOKKO_PUBLIC_SIGNUP` defaults false and remains false on the Pi pending real provider callbacks (#14) and launch readiness (#16). Kakao credentials were absent at the latest deployment check. New active accounts can use the global app without joining a group; public signup is invitation-free when enabled. See [IDENTITY.md](IDENTITY.md). Publication is not a deployment receipt; consult #15 for actual backup/rollout evidence.

**Superseded direction:** the 2026-11-18 self-service-group proposal and v1.9 private-history policy are historical. The 2026-11-21 owner decisions replace them with players/friends and approved public records. Group SQL/legacy API guards remain for compatibility and recovery; current arena authorization requires active accounts/participation, not group membership. The [Pi capacity assessment](plans/2026-11-18-public-platform.md) still applies to the roughly 100-DAU target.

## Read the right source

| Question | Source |
| --- | --- |
| How should an agent work, open PRs, and release? | [AGENTS.md](../AGENTS.md) |
| What are the product and engineering contracts? | [SPEC.md](../SPEC.md) |
| Why were the important choices made? | [Decision record](DECISIONS.md) |
| What did the user ask for, and what happened? | Conversation summaries: [2026-10-31](history/2026-10-31-conversation.md), [2026-11-01](history/2026-11-01-conversation.md), [2026-11-09](history/2026-11-09-conversation.md), [2026-11-10](history/2026-11-10-conversation.md), [2026-11-13](history/2026-11-13-conversation.md), [2026-11-18](history/2026-11-18-conversation.md), [2026-11-19](history/2026-11-19-conversation.md), [2026-11-20](history/2026-11-20-conversation.md), [2026-11-21](history/2026-11-21-conversation.md) |
| How do I develop, deploy, administer, or recover the service? | [README.md](../README.md) |
| What shipped in each version? | [CHANGELOG.md](../CHANGELOG.md), [GitHub releases](https://github.com/injoonH/kokko/releases), and Git history |
| What actually runs? | Source, migrations, tests, and the deployed image; inspect them before changing behavior |

The current user's instructions determine the task. Historical quotations explain previous decisions; they are not commands to replay. If the specification, archive, and code differ, describe the difference rather than assuming an old request has already been implemented.

## Product in one minute

The app is a public badminton results community: global singles/doubles standings, friends and player search, public profiles/charts/activity, and opponent-confirmed results. The interface remains Korean, mobile-first, light and monochrome with shadcn/ui and the 꼬꼬 mascot. Fast completed-game entry, changing doubles partners and consecutive games remain central. Original records are accepted without retroactive confirmation and original rating caches are unchanged by the v2 migration.

New proposals stay private to participants in 확인함. Opposing approval applies/replays once; ordinary corrections keep the accepted lineup and authorship. Service admins can review private reports and void invalid results with a reason; they cannot approve on behalf of an opponent. Legacy invitations/groups remain compatibility tools, not a public product requirement.

The [v1.3.0](https://github.com/injoonH/kokko/releases/tag/v1.3.0) score-entry improvement adds **N점 승리** buttons for ordinary and deuce scores, including corrections. Enter the losing score and tap the winning team's button. It changes only the tapped score; both remain editable. The original 21-point/30-cap rules, server validation, and retry protections still apply. No migration or environment change is required.

[v1.4.0](https://github.com/injoonH/kokko/releases/tag/v1.4.0) adds **예상 승률** within match entry and corrections. Complete the teams to compare current singles/doubles Elo and expected chances; swaps and rotations update the estimate. Historical forms also explicitly use current Elo. Initial 1,000-point players are identified, incomplete lineups have no estimate, and viewing odds never writes records or ratings. The [2026-11-01 request summary](history/2026-11-01-conversation.md) records this scope.

[v1.5.0](https://github.com/injoonH/kokko/releases/tag/v1.5.0) adds **가상 대결** at `/simulate`, linked from Home and entry. Choose any active singles/doubles lineup to see win chances and conditional win/loss Elo changes. The shared entry/correction preview also shows these changes. That release used equal full teammate adjustments; v1.8.0 replaces them with personal confidence-aware adjustments. Simulation is isolated from real drafts and pending saves; its selections reset on reload/leaving. See the [2026-11-09 request summary](history/2026-11-09-conversation.md).

[v1.6.0](https://github.com/injoonH/kokko/releases/tag/v1.6.0) adds six original crest tiers to Home, player profiles, and standings, plus next-tier progress and a tier guide. Tier boundaries use displayed current Elo, independently per discipline, and require at least one current game. They are derived from existing ratings, not stored awards or a new rating system. See the [2026-11-10 request summary](history/2026-11-10-conversation.md) and [crest assets/prompts](CRESTS.md).

[v1.6.1](https://github.com/injoonH/kokko/releases/tag/v1.6.1) gives each tier a distinct color and reduces crest sizes to 64px on tier cards, 56px in the guide, and 24px in standings. Simulation and real entry/corrections now share one avatar-based participant picker with swapping and clearing. Parent screens retain their own state, drafts, scores, and save locks. These are usability fixes; no migration or environment change is required.

[v1.6.2](https://github.com/injoonH/kokko/releases/tag/v1.6.2) prioritizes the Home dashboard: filters, key stats, tier, the Elo chart, and recent matches appear before planning tools. **다음 경기 추천** and **가상 대결** are now two compact 44px links in one row below recent matches, replacing the large cards near the top. The global match-entry action stays prominent.

[v1.7.0](https://github.com/injoonH/kokko/releases/tag/v1.7.0) adds a GitHub-style activity calendar to player profiles. It shows the latest 365 Korean dates, exact daily game counts, active days, and current/all-time longest playing streaks. Singles and doubles combine independently of page filters. Current streak can end today or yesterday. It derives from `allMatches` and server `today`, so historical edits, deletions, and restorations are reflected without a migration. See the [2026-11-13 summary](history/2026-11-13-conversation.md).

## Start on a new machine

Use a POSIX shell for the commands below; Windows contributors can use WSL. Install Node.js 24, pnpm **12.5.1**, Go **1.27.2**, and `gh`. The authoritative pins are in [package.json](../package.json), [go.mod](../apps/server/go.mod), and [Dockerfile](../Dockerfile). PocketBase is embedded in the Go application and pinned to **0.40.5**; there is no separate PocketBase download needed for normal development.

The backend race tests also need cgo, a C compiler, and development headers (for example, Debian/Ubuntu's `build-essential`). Do not disable race detection to work around a missing compiler; install the prerequisites and run with `CGO_ENABLED=1`.

Authenticate your own authorized GitHub account and clone the repository:

```sh
gh auth login
gh repo clone injoonH/kokko
cd kokko
corepack enable
corepack prepare pnpm@12.5.1 --activate
pnpm install --frozen-lockfile
```

Read `AGENTS.md` before editing. Record the existing `git status --short --branch`, confirm `git remote -v`, and inspect recent commits and releases. Recheck live repository rules with `gh ruleset check main --repo injoonH/kokko`; archived permissions and credentials are not a substitute for the new machine's actual access.

Run the normal validation commands **sequentially**:

```sh
pnpm check
pnpm test
pnpm build
pnpm --filter @kokko/web exec playwright install chromium
pnpm test:e2e
```

On Linux, Playwright's `install --with-deps chromium` also installs its system dependencies. Browser tests automatically start a Go test harness on `127.0.0.1:8097` with a temporary database and test sessions. They do not require Google credentials or a production database. The session/seed endpoints exist only in the Go test binary.

For interactive development, follow [local development](../README.md#local-development) and [Google OAuth setup](../README.md#google-oauth-setup). Copy `.env.example` to a local `.env` and obtain any needed secrets through the owner's normal secret-sharing channel. Local Go development does not automatically load `.env`; Compose does. A missing provider credential pair disables only that provider; the other configured provider remains usable. See [IDENTITY.md](IDENTITY.md) for Kakao and the public-signup switch.

Do not copy the original workstation's auth files, databases, or paths into project configuration. Credentials, Google consent/test-user access, registry access, production data, and the persistent encryption key must be supplied separately when needed. Tests can run without production access.

## Architecture and code map

One Go PocketBase process serves the built React app and `/api/kokko`. The public arena API exposes explicit bounded projections. Proposals and ratings commit transactionally in one PocketBase/SQLite process; global ratings follow each account. Group SQL remains a compatibility layer, not a public boundary.

| Area | Files to start with |
| --- | --- |
| Runtime settings, provider credentials, operator commands, scheduled backups | [apps/server/main.go](../apps/server/main.go) |
| PocketBase `users` auth collection and custom SQL schema | [Initial migration](../apps/server/migrations/1770000000_initial.go) |
| Identity, onboarding, account linking and provider setup | [identity.go](../apps/server/internal/kokko/identity.go), [account route](../apps/web/src/routes/account.tsx), [IDENTITY.md](IDENTITY.md) |
| Historical private-group compatibility and operator recovery | [groups.go](../apps/server/internal/kokko/groups.go), [group migration](../apps/server/migrations/1794960001_groups.go), [group contract](GROUPS.md) |
| Score validation and canonical rating replay | [model.go](../apps/server/internal/kokko/model.go) |
| Glicko equations, doubles adapter and parity fixtures | [glicko.go](../apps/server/internal/kokko/glicko.go), [glicko.ts](../apps/web/src/lib/glicko.ts), [rating contract](RATINGS.md) |
| Legacy mutation/retry compatibility, replay, invitations and nicknames | [service.go](../apps/server/internal/kokko/service.go) |
| Public proposals, order reservations, confirmation and moderation | [arena.go](../apps/server/internal/kokko/arena.go), [arena_http.go](../apps/server/internal/kokko/arena_http.go) |
| Public snapshots, exact SQL aggregates and activity, inbox, standings | [arena_reads.go](../apps/server/internal/kokko/arena_reads.go) |
| Friend requests, blocking, handles and player search | [social.go](../apps/server/internal/kokko/social.go), [public migration](../apps/server/migrations/1795219200_public_players.go) |
| HTTP boundaries, profile updates, static frontend serving | [http.go](../apps/server/internal/kokko/http.go) |
| State snapshots, period statistics, charts, synergy | [stats.go](../apps/server/internal/kokko/stats.go) |
| Backup restoration | [backup.go](../apps/server/internal/kokko/backup.go) |
| Profile activity calendar and playing streaks | [activity.ts](../apps/web/src/lib/activity.ts), [activity.tsx](../apps/web/src/components/activity.tsx) |
| Home dashboard order and compact planning links | [Home route](../apps/web/src/routes/_member.index.tsx) |
| Shared participant slots and active-member dialog | [participant-picker.tsx](../apps/web/src/components/participant-picker.tsx) |
| Match entry and pending-save drafts | [entry.tsx](../apps/web/src/components/entry.tsx) |
| Current-Elo win-rate estimates and shared probability labels | [prediction.ts](../apps/web/src/lib/prediction.ts), [prediction component](../apps/web/src/components/prediction.tsx) |
| Imaginary matchups with isolated selections | [Simulator route](../apps/web/src/routes/_member.simulate.tsx) |
| Elo tier thresholds, progress, and crest UI | [ranks.ts](../apps/web/src/lib/ranks.ts), [rank.tsx](../apps/web/src/components/rank.tsx), [crest provenance](CRESTS.md) |
| Doubles pairings and rotation controls | [rotation.ts](../apps/web/src/lib/rotation.ts), [rotation.tsx](../apps/web/src/components/rotation.tsx) |
| Attendance, fair suggestions, and safe handoff into entry | [court.ts](../apps/web/src/lib/court.ts), [court route](../apps/web/src/routes/_member.court.tsx) |
| Admin nickname dialog and report review | [member-nickname.tsx](../apps/web/src/components/member-nickname.tsx), [admin route](../apps/web/src/routes/_member.admin.tsx) |
| Auth state, API client, shared types | [api.ts](../apps/web/src/lib/api.ts), [types.ts](../apps/web/src/lib/types.ts) |
| Backend and browser integration coverage | [Server tests](../apps/server/internal/kokko/service_test.go), [nickname tests](../apps/server/internal/kokko/nickname_test.go), [browser harness](../apps/server/internal/kokko/browser_test.go), [E2E suite](../apps/web/e2e/app.spec.ts) |
| Deployment, validation, images, release publication | [Dockerfile](../Dockerfile), [compose.yaml](../compose.yaml), [CI](../.github/workflows/ci.yaml), [release.mjs](../scripts/release.mjs) |

Frontend routes live in `apps/web/src/routes`. `routeTree.gen.ts` is generated by the router tooling. Vite builds and Vitest can both generate it: do not run them concurrently. `.tanstack`, `dist`, and browser artifacts are generated files, not source changes to publish.

## Invariants to preserve

- **Playing streaks:** use all accepted non-deleted participation dates service-wide across both disciplines, independent of other filters, with Korean server `today`. Current ends today or yesterday; longest spans all history. Calendar totals cover the latest 365 days. Do not persist counters or interpret streak as wins.
- **Home hierarchy:** filters, key stats, tier, Elo chart, and recent matches come before the compact planning-tool row. Match recording remains the primary action.
- **Identity:** stable provider IDs and explicit authenticated linking preserve account ownership. Never merge by email or auto-enroll a new profile into `legacy`. Keep public signup gated until launch/callback validation is ready; see [IDENTITY.md](IDENTITY.md).
- **Server authority:** active account status, participation, opposing approval, immutable authorship and current admin privileges, scoring, and Elo are checked on the server. A hidden button or route guard is not authorization.
- **Scoring:** currently 21 points, win by two after deuce, capped at 30. Custom targets are not implemented. Early wording about variable scores is preserved in the [decision record](DECISIONS.md#6-scoring-and-early-wording).
- **Winning-score shortcuts:** apply only on tap, never automatically while typing. A blank opposite score offers 21 and stays blank. An opposite score of 30 or an invalid value has no winning shortcut. These are input conveniences, not a scoring-rule change.
- **Ratings (v1.8.0):** Glicko-1, initial 1,000 / RD 350, floor RD 30, Korean-day aging, independent disciplines, and documented doubles contribution updates. Teammates may differ; no zero-sum promise. See [RATINGS.md](RATINGS.md). Score margin does not affect ratings.
- **Crest appearance:** distinct copper/steel/gold/emerald/blue/violet artwork; compact 64px/56px/24px tier-card/guide/standings sizes. Keep readable labels and tier ornament.
- **Shared picker:** entry, corrections, and simulation use `ParticipantPicker`; it has no storage or API calls. Parents own selected slots. Explicitly disable the picker during busy/unresolved real saves, since dialog actions render in a portal.
- **Crest tiers:** use displayed current Elo with positive current game counts, separately per discipline; zero-game pools are unranked. Thresholds are 900/1,000/1,100/1,200/1,300, independent of period filters. Tier cards do not alter server Elo, persisted history, or shared ordinal ranks. Progress covers the last 100 Elo before a next tier; Master has none.
- **Predictions:** use current server-supplied Elo from the selected discipline, including on historical entry/edit forms. They are a read-only reference, independent of entered scores and dates, with a visible 1,000-point default notice for players without records. Previewing does not change drafts, match/rating data, permissions, or retry behavior.
- **Hypothetical Elo changes (v1.8.0):** calculate individual Glicko win/loss outcomes from the current aged RD snapshot; show one decimal and personal RD. `/simulate` may omit the acting member but does not save matches or access entry/attendance/lineup storage. Its current-Elo outcomes are not historical edit-impact calculations.
- **Public scope:** approved nicknames/avatars/handles and accepted match/date/lineup/score/rating fields are public. Provider details, email, others' roles, pending proposals, reports, raw audit and retry records are not. Legacy private APIs retain their original group guards; old POST only resolves owned matching stored retries.
- **Confirmation and replay:** only an active opposing participant approves; authors/teammates/admins cannot bypass it. Pending corrections preserve the old accepted result. Reserve chronological slots before approval and use versions/anchors for explicit placement. Confirmation atomically replays the affected discipline. Existing history needs no retroactive approval or rating reset.
- **Repeated games:** identical players/scores may be a genuine next game. Retry identifiers prevent duplicates; they never deduplicate genuine games by score.
- **Drafts:** preserve account-scoped legacy keys, old-group imports and unresolved request protocols. Resolve an old ambiguous save before conversion. Never replace an unresolved save from court recommendations. Remembered lineups/attendance remain tab/date scoped; simulation does not modify them. Only a reported game's participating pending proposals contribute to that member's planning counts; they never affect Elo/public statistics.
- **Bounded reads:** history/inbox/friends/standings have pages; exact profile totals/activity use SQL independently. Chart keeps 200 filtered games plus baseline, pairs keep top 50, day selectors up to 1,000, quick directory up to 100, attendance up to 12. Search/explicit selection fetches authoritative ratings/RD for additional players. Do not derive full statistics from a history page.
- **Names:** the public nickname is `kokko_profiles.nickname`, separately from Google's `users.name`. Online renames must use the transaction that checks the acting admin; the actor-less operator method is not a member-facing API.

See the [decision record](DECISIONS.md) and [SPEC.md](../SPEC.md) for rationale and the full contracts.

## GitHub and release handoff

Use Issues and PRs actively as continuation records, including scope, dependencies, validation and remaining operations. Titles start with a capital letter and stay within 50 characters (commit/squash titles below 50). The rating task is #12; public follow-ups are #13–#16.

The owner in the recorded sessions was **@injoonH**. Follow the current user's assignee instructions and authenticate the intended account on the new machine. Use `gh` for GitHub writes, capitalized commit titles of at most **49 characters**, focused PRs, assignment to the requester, and squash merges after checks pass. The verified rules at this snapshot required a PR, squash-only merging, linear history, and signed commits; recheck them rather than bypassing them.

`gh api graphql` with `createCommitOnBranch` was used to create signed commits and update remote feature branches. Publish only explicitly selected files and use `expectedHeadOid` to protect against overwriting a moved branch. A remote API commit does not automatically update the local checkout; fetch and synchronize it while preserving pre-existing staged and unstaged changes. Never blindly reset another contributor's work.

An older local `gh pr edit --add-assignee` failed because its query referenced deprecated Projects (classic). A working fallback is the issue-assignee REST endpoint, because PRs also have issue numbers:

```sh
gh api repos/injoonH/kokko/issues/PR_NUMBER/assignees \
  --method POST -f 'assignees[]=GITHUB_LOGIN'
```

Replace the placeholders with the actual PR and intended account. This was a tool-version issue, not a repository requirement. The previous token lacked `workflow` scope; the release command uses the existing image workflow and does not require editing it. Inspect current permissions before assuming the same limitation on another computer.

For a feature release, include a dated changelog entry in the PR, merge after passing validation, synchronize the local checkout to the exact `main` commit, then run:

```sh
pnpm release vX.Y.Z
```

Use a new minor version for compatible features or a patch version for fixes. The command reads **committed** release notes, waits for main CI, creates the tag through `gh`, waits for tagged validation and successful image publication, and publishes GitHub Release notes. Never move a published tag. Documentation-only handoffs can be merged without inventing a product release; keep their notes under `Unreleased` until the next appropriate release.

## Operations and remaining context

The intended public origin is `https://kokko.yuwol.dev`. [compose.yaml](../compose.yaml) defaults to direct PocketBase-managed HTTPS, and the README describes using an external reverse proxy. The final image runs as UID/GID 65532 with a read-only root filesystem and persistent data in `/data/pb_data`. Keep one app instance. Do not infer that a published image has been deployed to the owner's host.

Daily backups run at 18:00 UTC / 03:00 KST and retain 30 scheduled copies. Automated off-host copying is not implemented; the operator must arrange it separately. Follow [backup and recovery instructions](../README.md#backups-and-recovery), preserve the persistent encryption key, and test restoration. Domain tables are custom SQL and are not editable through PocketBase's standard collection screens; production `/_/` is blocked when `KOKKO_PUBLIC_URL` is set.

Ideas that were discussed but are not shipped include arbitrary scoring targets/caps and automated off-host backup copying. Self-service groups were superseded by player/friend discovery; open signup remains gated for real callbacks and launch checks. Account-erasure UX and off-host recovery remain launch work; automatic offline synchronization remains outside the current implementation. These are plans, not shipped behavior.

At the archive snapshot, v1.2.0's [tagged CI](https://github.com/injoonH/kokko/actions/runs/41167104423) passed validation and multi-platform image publication. Its validation included four release-tool tests, thirteen frontend tests, backend race tests, and ten browser tests. The running production version, real Google sign-in on a new environment, the owner's backup destination, and current host/proxy configuration were not verified by that release.

## Keep the handoff useful

When shipping a meaningful change, update the affected current documents and the changelog together. Record new user decisions or changed constraints in a dated conversation summary with links to the implementing PR/release. Preserve older summaries as historical snapshots, and clearly mark superseded behavior. Store project decisions and visible user-facing outcomes, not private reasoning, credentials, or unrelated conversations.

## Confidence migration handoff

v1.8.0 adds rating deviation and a one-time full replay, preserving recorded matches and other source tables. Startup fails if replay fails. Do not downgrade only the image: restore the pre-upgrade PocketBase backup with v1.7.0. `kokko ratings` previews without domain writes; `kokko ratings --apply` applies pending migrations/replay on a stopped or isolated copy. Check the implementing PR, release, and issue #12 for validation and the actual Pi deployment/backup receipt; a published release alone is not evidence of deployment. Public signup was unimplemented in v1.8.0; v1.10.0 adds its gated identity foundation. See [IDENTITY.md](IDENTITY.md) and issue #14 for the current remaining work.
