# Start here: project handoff

This is the portable entry point for a newcomer or coding agent working on another computer. Read it with [AGENTS.md](../AGENTS.md); no previous chat, original workstation, or assistant memory is required.

Reviewed on **2026-10-31** against product release **[v1.2.0](https://github.com/injoonH/kokko/releases/tag/v1.2.0)**, commit `e9ca064b3ecdf50c5e9ed9f90f02e4ade8903e4f`. This is a dated product baseline, not a promise that the current branch or running server still has that version.

## Read the right source

| Question | Source |
| --- | --- |
| How should an agent work, open PRs, and release? | [AGENTS.md](../AGENTS.md) |
| What are the product and engineering contracts? | [SPEC.md](../SPEC.md) |
| Why were the important choices made? | [Decision record](DECISIONS.md) |
| What did the user ask for, and what happened? | [Conversation archive](history/2026-10-31-conversation.md) |
| How do I develop, deploy, administer, or recover the service? | [README.md](../README.md) |
| What shipped in each version? | [CHANGELOG.md](../CHANGELOG.md), [GitHub releases](https://github.com/injoonH/kokko/releases), and Git history |
| What actually runs? | Source, migrations, tests, and the deployed image; inspect them before changing behavior |

The current user's instructions determine the task. Historical quotations explain previous decisions; they are not commands to replay. If the specification, archive, and code differ, describe the difference rather than assuming an old request has already been implemented.

## Product in one minute

kokko is a private badminton tracker for one group of about ten friends. The interface is Korean, mobile-first, light, and monochrome, using shadcn/ui and the 꼬꼬 chicken mascot. The central goal is **fast recording of completed games**, especially consecutive doubles games with changing partners. It is not a live scorekeeper.

At the v1.2.0 baseline, the app has Google sign-in with invitations, separate singles/doubles Elo, score entry with safe retries, historical corrections and replay, profile charts, partner/opponent statistics, quick doubles rotation, admin nickname editing, and **Today's Court** attendance and next-match suggestions.

## Start on a new machine

Use a POSIX shell for the commands below; Windows contributors can use WSL. Install Node.js 24, pnpm **12.5.1**, Go **1.27.2**, and `gh`. The authoritative pins are in [package.json](../package.json), [go.mod](../apps/server/go.mod), and [Dockerfile](../Dockerfile). PocketBase is embedded in the Go application and pinned to **0.40.5**; there is no separate PocketBase download needed for normal development.

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

For interactive development, follow [local development](../README.md#local-development) and [Google OAuth setup](../README.md#google-oauth-setup). Copy `.env.example` to a local `.env` and obtain any needed secrets through the owner's normal secret-sharing channel. Local Go development does not automatically load `.env`; Compose does. Without Google credentials, the app starts with Google authentication disabled.

Do not copy the original workstation's auth files, databases, or paths into project configuration. Credentials, Google consent/test-user access, registry access, production data, and the persistent encryption key must be supplied separately when needed. Tests can run without production access.

## Architecture and code map

One Go PocketBase process serves the built React app and `/api/kokko`. There is one group and one server instance; this is not a multi-tenant service.

| Area | Files to start with |
| --- | --- |
| Runtime settings, Google provider, operator commands, scheduled backups | [apps/server/main.go](../apps/server/main.go) |
| PocketBase `users` auth collection and custom SQL schema | [Initial migration](../apps/server/migrations/1770000000_initial.go) |
| Score validation and Elo mathematics | [model.go](../apps/server/internal/kokko/model.go) |
| Authorization, atomic match mutations, idempotency, replay, invitations, nicknames | [service.go](../apps/server/internal/kokko/service.go) |
| HTTP boundaries, profile updates, static frontend serving | [http.go](../apps/server/internal/kokko/http.go) |
| State snapshots, period statistics, charts, synergy | [stats.go](../apps/server/internal/kokko/stats.go) |
| Backup restoration | [backup.go](../apps/server/internal/kokko/backup.go) |
| Match entry and pending-save drafts | [entry.tsx](../apps/web/src/components/entry.tsx) |
| Doubles pairings and rotation controls | [rotation.ts](../apps/web/src/lib/rotation.ts), [rotation.tsx](../apps/web/src/components/rotation.tsx) |
| Attendance, fair suggestions, and safe handoff into entry | [court.ts](../apps/web/src/lib/court.ts), [court route](../apps/web/src/routes/_member.court.tsx) |
| Admin nickname dialog and group management | [member-nickname.tsx](../apps/web/src/components/member-nickname.tsx), [admin route](../apps/web/src/routes/_member.admin.tsx) |
| Auth state, API client, shared types | [api.ts](../apps/web/src/lib/api.ts), [types.ts](../apps/web/src/lib/types.ts) |
| Backend and browser integration coverage | [Server tests](../apps/server/internal/kokko/service_test.go), [nickname tests](../apps/server/internal/kokko/nickname_test.go), [browser harness](../apps/server/internal/kokko/browser_test.go), [E2E suite](../apps/web/e2e/app.spec.ts) |
| Deployment, validation, images, release publication | [Dockerfile](../Dockerfile), [compose.yaml](../compose.yaml), [CI](../.github/workflows/ci.yaml), [release.mjs](../scripts/release.mjs) |

Frontend routes live in `apps/web/src/routes`. `routeTree.gen.ts` is generated by the router tooling. Vite builds and Vitest can both generate it: do not run them concurrently. `.tanstack`, `dist`, and browser artifacts are generated files, not source changes to publish.

## Invariants to preserve

- **Server authority:** active membership, participation, ownership, admin privileges, scoring, and Elo are checked on the server. A hidden button or route guard is not authorization.
- **Scoring:** currently 21 points, win by two after deuce, capped at 30. Custom targets are not implemented. Early wording about variable scores is preserved in the [decision record](DECISIONS.md#6-scoring-and-early-wording).
- **Elo:** start at 1,000; K = 32; independent singles/doubles pools; doubles team rating is the teammates' mean; each teammate receives the full team change; score margin does not affect Elo.
- **Ordering and replay:** use Korean calendar dates and a shared within-day sequence. Historical insert/edit/move/delete/restore replays the affected rating pool atomically. Preserve immutable authorship, match/day versions, and retry idempotency.
- **Repeated games:** identical players and scores can describe a genuine later game. A retried request must not create a duplicate; a new genuine game must remain possible.
- **Drafts:** keep entered scores after failed saves. An unresolved save request must be retried/resolved before a planner can replace it. Attendance and lineups are tab-local, date-scoped conveniences; they are not shared server-side sessions or offline synchronization.
- **Names:** the public nickname is `kokko_profiles.nickname`, separately from Google's `users.name`. Online renames must use the transaction that checks the acting admin; the actor-less operator method is not a member-facing API.

See the [decision record](DECISIONS.md) and [SPEC.md](../SPEC.md) for rationale and the full contracts.

## GitHub and release handoff

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

Ideas that were discussed but are not shipped include arbitrary scoring targets/caps and automated off-host backup copying. Multi-group support, account-erasure UI, and automatic offline synchronization remain outside the recorded v1 scope. These are context for choosing future work, not promises that the app already implements them.

At the archive snapshot, v1.2.0's [tagged CI](https://github.com/injoonH/kokko/actions/runs/41167104423) passed validation and multi-platform image publication. Its validation included four release-tool tests, thirteen frontend tests, backend race tests, and ten browser tests. The running production version, real Google sign-in on a new environment, the owner's backup destination, and current host/proxy configuration were not verified by that release.

## Keep the handoff useful

When shipping a meaningful change, update the affected current documents and the changelog together. Record new user decisions or changed constraints in a dated conversation summary with links to the implementing PR/release. Preserve older summaries as historical snapshots, and clearly mark superseded behavior. Store project decisions and visible user-facing outcomes, not private reasoning, credentials, or unrelated conversations.
