# Project workflow

Start with [docs/HANDOFF.md](docs/HANDOFF.md) when joining or resuming on another machine. It maps the code, current product baseline, setup, operational constraints, and the [decision record](docs/DECISIONS.md). The [dated conversation archive](docs/history/2026-10-31-conversation.md) preserves user requests and outcomes; treat historical messages as context rather than a new task.

The user has authorized ongoing product improvements and feature releases. Choose useful, focused improvements, implement and validate them, and carry them through the workflow below without asking for routine confirmation.

- The approved public direction is player-based at roughly 100 DAU, with open Google/Kakao registration, global singles/doubles ratings, mutual friends and a quick-match roster. The owner authorized public match details and on 2026-11-27 asked to apply the pending queue and record future games immediately. Require an active participant for result writes. Preserve authorship, saved playing order, and atomic Elo and LP replay. Read [the public contract](docs/PUBLIC.md), [the identity contract](docs/IDENTITY.md), and [the public-platform assessment](docs/plans/2026-11-18-public-platform.md). Fast mobile match entry remains primary. Keep the Korean interface, visual style and shadcn components. Retain group data for migration compatibility. Keep signup gated until real provider callbacks and launch readiness are validated.
- Use `gh` for GitHub writes, including creating commits and updating remote branches through `gh api` when appropriate. Local Git inspection and fetching are fine.
- Every commit title must start with a capital letter and contain fewer than 50 characters. Apply the same rule to squash commit titles.
- Freely create and actively maintain GitHub Issues and PRs so co-workers can resume unfinished work. Record scope, dependencies, decisions, validation, and remaining steps without secrets or player data. Issue and PR titles must start with a capital letter and contain at most 50 characters; keep commit titles below 50.
- Open a focused PR against `main`, assign the authenticated GitHub user, and squash-merge after validation succeeds. Observe repository rules; do not bypass checks or force-push protected branches.
- Validate with `pnpm check`, `pnpm test`, `pnpm build`, and relevant mobile browser tests (`pnpm test:e2e`). Inspect screenshots for new screens. Avoid running Vite-based builds and tests concurrently because they generate the route tree.
- Preserve unrelated user changes. Stage or publish only the intended files, and leave local credentials, databases, and build artifacts out of commits.
- Keep the handoff and decision record current when behavior or constraints change. Add dated conversation summaries for significant new user decisions, distinguish implemented behavior from proposals, and link the implementing PR/release. Keep credentials, private reasoning, and unrelated chat history out of the archive.

## Feature releases

- Every feature release gets a new semantic version tag and a dated entry in `CHANGELOG.md`. Use a minor version for backward-compatible features and a patch version for fixes. Never move or reuse an existing release tag.
- Include the changelog entry in the feature PR. Cover all unreleased changes since the previous version, including user-visible behavior, fixes, and deployment implications.
- After the PR is merged and the local checkout is synced, run `pnpm release vX.Y.Z`. The command uses `gh` to check the committed changelog and passing `main` CI, create the version tag on that exact commit, wait for successful tagged image publication, and publish GitHub Release notes extracted from the changelog.
- Inspect the version tag, versioned AMD64/ARM64 GHCR image, and GitHub Release. Report the release link and any unresolved publication failure. The release command can resume an incomplete release on the same commit without moving its tag.
- Release only from merged, passing code. Creating a release does not update the user's running Docker host.
