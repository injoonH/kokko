# Project workflow

The user has authorized ongoing product improvements and feature releases. Choose useful, focused improvements, implement and validate them, and carry them through the workflow below without asking for routine confirmation.

- Optimize for a private badminton group of about ten people. Fast mobile match entry is the primary product goal. Keep the Korean interface simple and use the existing monochrome style and shadcn components.
- Use `gh` for GitHub writes, including creating commits and updating remote branches through `gh api` when appropriate. Local Git inspection and fetching are fine.
- Every commit title must start with a capital letter and contain fewer than 50 characters. Apply the same rule to squash commit titles.
- Open a focused PR against `main`, assign the authenticated GitHub user, and squash-merge after validation succeeds. Observe repository rules; do not bypass checks or force-push protected branches.
- Validate with `pnpm check`, `pnpm test`, `pnpm build`, and relevant mobile browser tests (`pnpm test:e2e`). Inspect screenshots for new screens. Avoid running Vite-based builds and tests concurrently because they generate the route tree.
- Preserve unrelated user changes. Stage or publish only the intended files, and leave local credentials, databases, and build artifacts out of commits.

## Feature releases

- Every feature release gets a new semantic version tag and a dated entry in `CHANGELOG.md`. Use a minor version for backward-compatible features and a patch version for fixes. Never move or reuse an existing release tag.
- Include the changelog entry in the feature PR. Cover all unreleased changes since the previous version, including user-visible behavior, fixes, and deployment implications.
- After the PR is merged and the local checkout is synced, run `pnpm release vX.Y.Z`. The command uses `gh` to check the committed changelog and passing `main` CI, create the version tag on that exact commit, wait for successful tagged image publication, and publish GitHub Release notes extracted from the changelog.
- Inspect the version tag, versioned AMD64/ARM64 GHCR image, and GitHub Release. Report the release link and any unresolved publication failure. The release command can resume an incomplete release on the same commit without moving its tag.
- Release only from merged, passing code. Creating a release does not update the user's running Docker host.
