# kokko

A mobile-first badminton match tracker for a small, private group of friends. Record games after playing, follow your progress, and explore how you perform with different partners.

The application interface is in Korean. **꼬꼬** is the chicken mascot holding a badminton racket.

![kokko — our badminton records](apps/web/public/og.png)

## Joining the project

New contributors and coding agents should start with the [portable project handoff](docs/HANDOFF.md) and [agent workflow](AGENTS.md). The [decision record](docs/DECISIONS.md) explains the architecture and product choices; the [conversation archive](docs/history/2026-10-31-conversation.md) preserves the available user requests and implementation history. These versioned files travel with the repository and require no access to the original chat or workstation.

## Features

- **Today's Court:** choose attending friends, see today's game counts, and get fair doubles suggestions that open directly in match entry.
- **Quick match entry:** singles or doubles, player selection, one-tap doubles pairings, numeric scores, and same-player or rotated-team next matches.
- **Reliable saving:** preserve entries after a failed submission and retry without creating duplicates. Genuine repeated games are allowed.
- **Match history:** filter by player, match type, period, and result; inspect individual rating changes.
- **Historical corrections:** change scores, participants, dates, and playing order; automatically recalculate affected ratings.
- **Player statistics:** separate singles/doubles rankings, rating charts, win rates, partner statistics, and head-to-head results.
- **Private membership:** Google sign-in followed by a single-use invitation; pending accounts cannot access group data.
- **Profiles and administration:** edit your own nickname and photo; administrators rename members, manage invitations, and restore deleted matches.

## Recording games

One completed game is one match record. Doubles is selected by default, with the signed-in player preselected.

After selecting four players, **Quick team combinations (빠른 팀 조합)** shows all three possible doubles pairings. Tap a different pairing to reassign the teams and clear both scores. The current pairing stays selected even when you swap team sides. After saving, keep the same teams or tap either alternate pairing to start the next game immediately, preserving the playing date and appending to that day's games. The selected doubles lineup is remembered for that playing date in the current browser tab, including after leaving the entry screen; sign-out clears it. Singles entry does not show doubles rotation controls.

A valid result is:

- **21–0 through 21–19** for a normal game.
- **22–20 through 29–27** for a two-point win after deuce.
- **30–28 or 30–29** at the 30-point cap.

The same rules apply whichever team wins. Ties, unfinished games, negative scores, and fractional scores are rejected.

For faster score entry, enter the losing team's score and tap the winning team's **“N-point win” (N점 승리)** button. It fills 21 for ordinary results, the two-point winning score after deuce, or 30 against 28/29. With the other score blank it fills 21 and leaves that field blank. The shortcut is unavailable against an opponent score of 30 or an invalid score. Both scores remain directly editable; changing one does not automatically change the other. The shortcuts also work when correcting a match, and saving still requires a complete, valid result.

### Plan the next game

Open **“Who should play next?” (다음 경기는 누구랑?)** from Home, or **“Get the next match suggestion” (다음 경기 추천받기)** after saving. In **Today's Court (오늘의 코트)**, select the friends who are present. The signed-in player stays included so the suggested game can be recorded by a participant. Attendance is remembered per member and Korean calendar date in the current browser tab and cleared on sign-out.

Three suggestions prioritize the other players' game counts (including singles), then who played longest ago. Within those priorities, use current doubles Elo to group team balance into five-percentage-point bands around a 50% expected result, prefer fewer repeated partnerships within the day, then break ties by exact balance and stable player IDs. New players use 1,000 Elo. Deleted and other-day matches do not count toward today's turns or partnership repetition. Changing the attendance selection does not alter records or ratings.

Tap a suggestion to fill the four player slots with today's date and empty scores. An existing scored draft requires an explicit choice before replacement. A game awaiting a save response must be revisited and resolved before a suggestion can replace it. The server still validates participants and match results when saving.

Dates use **Asia/Seoul**. Historical dates are allowed; future dates are not. Games share a within-day sequence across singles and doubles, so no exact playing time is required. New games go last unless a position is selected. Use the history screen to inspect the day's sequence and the match edit screen to correct it.

Only a participant may create a match, including administrators. The author or an administrator may edit or delete it. Ordinary authors must remain participants when editing; administrators may correct the participants without changing authorship. Deletion is soft: the match leaves statistics, its audit history remains, and an administrator can restore it.

## How Elo works

Every player starts at **1,000**, with independent singles and doubles ratings. The K-factor is **32**. Only the result matters: winning 21–0 and winning 30–29 have the same effect against the same opponents.

For singles, a team's rating is its player's pre-match rating. For doubles, it is the arithmetic mean of the two teammates' pre-match doubles ratings.

```text
Expected_A = 1 / (1 + 10 ^ ((Rating_B - Rating_A) / 400))
Change_A   = 32 × (Result_A - Expected_A)

Result_A = 1 for a win, 0 for a loss
Change_B = -Change_A
```

**Each doubles teammate receives the full team change**, not half. For example, if all four players are rated 1,000, each winning player gains 16 and each losing player loses 16.

Ratings are calculated on the server in playing order without intermediate rounding. Current ratings display as integers; changes display to one decimal place. Rankings use current cumulative Elo, with shared ranks for equal displayed ratings. Players with no games in a rating pool are unranked.

Inserting, editing, reordering, deleting, or restoring an old match replays the affected rating pool from the beginning. Changing singles to doubles or vice versa replays both pools. Later rating changes can therefore change after a historical correction. Match changes and recalculation commit together; readers never receive a partially recalculated snapshot.

## Period statistics and partner synergy

The 7-, 30-, and 90-day filters include today and the preceding N−1 Korean calendar dates. An all-time option is also available.

**Period Elo change = rating at the end of the period − rating immediately before the period.** The starting baseline is 1,000 if no earlier games exist. A period with no games shows zero games and zero change. Charts include a starting baseline and a separate point for every game, including games played on the same day. Rankings remain cumulative regardless of the selected period.

Doubles partner synergy measures performance relative to the opponents faced:

```text
Synergy = 100 × mean(actual result − pre-match expected win probability)
```

The unit is **percentage points (pp)**. Winning 60% of games when the average expected win probability was 50% gives +10 pp. Expected probabilities come from the full-history pre-match Elo, while the sample includes only games in the selected period.

Fewer than **five games with a partner in that period** shows “insufficient data.” Win rate and sample size are displayed separately. Synergy is a descriptive reference, not proof that a partnership causes better results.

## Membership and privacy

- New members must sign in with Google and redeem an invitation. Existing members do not need another invitation.
- Invitations expire after **seven days**, can be used once, and can be deactivated by an administrator. The secret is shown only when issued; the server stores its hash.
- Activated members can view the group's profiles, games, and statistics. Other members' Google email addresses are not exposed.
- Members can edit their own display names. Administrators can rename another member in **Settings → Group management → Member nicknames (설정 → 모임 관리 → 회원 닉네임)** without stopping the server, including suspended members with existing profiles. Nicknames must contain 1–20 Unicode characters after trimming whitespace; photos, account privileges, and match/rating history are preserved. Only active administrators can use the member rename API. Server operators can also use the `rename USER_ID NICKNAME` command below. Display names live separately from Google account names; changing PocketBase's `users.name` does not rename an existing public profile.
- Suspending a member blocks access and new participation while preserving history.

This version supports one group and one server instance. Multi-group management, account deletion UI, and automatic offline synchronization are outside its scope.

## Local development

Required tools: **Node.js 24**, **pnpm 12.5.1**, and **Go 1.27.2**. PocketBase is pinned to **0.40.5** in the Go module.

`pnpm test` runs Go's race detector, which requires cgo and a working C compiler with development headers (for example, `build-essential` on Debian/Ubuntu). Keep `CGO_ENABLED=1` for these tests; a Go-only toolchain cannot run them.

From the repository root:

```sh
corepack enable
corepack prepare pnpm@12.5.1 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

Fill in the Google credentials in `.env` using the setup below. Load them into the backend's environment and start it:

```sh
set -a
source .env
set +a
pnpm dev:server
```

In a second terminal, run `pnpm dev`, then open **http://localhost:5173**. Vite proxies `/api` to the backend on port 8090. Local data is stored in `apps/server/pb_data` and excluded from Git. Compose loads `.env` automatically; the local Go process does not.

## Google OAuth setup

Create a **Web application** OAuth client in Google Cloud and configure its consent screen. If the client is in testing mode, add the group's accounts as test users.

| Environment | Authorized JavaScript origin | Authorized redirect URI |
| --- | --- | --- |
| Development | `http://localhost:5173` | `http://localhost:5173/auth/callback` |
| Production | `https://kokko.yuwol.dev` | `https://kokko.yuwol.dev/auth/callback` |

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. The secret stays on the server. Login uses a same-tab authorization-code flow with state and PKCE; register the callback above rather than PocketBase's default popup callback.

Without these credentials, the application starts with Google authentication disabled. Automated tests use a test provider and do not verify real Google sign-in.

## Deployment

The Go server serves both the built frontend and API. Docker builds use digest-pinned **Docker Hardened Images (`dhi.io`)** for Node, Go, and the static runtime. Prepare Docker with Compose and registry access (`docker login dhi.io` if required).

Before starting production:

1. Configure the Google OAuth client and `.env`.
2. Generate `PB_ENCRYPTION_KEY` with `openssl rand -hex 16` and put the resulting 32-character key in `.env`. Keep it stable and back it up separately; it is needed for recovery.
3. Point `kokko.yuwol.dev` at your host and configure TLS and network access for your chosen topology below.
4. Arrange a separate destination for backup copies.

### With your own reverse proxy

nginx is managed outside this project. When it terminates HTTPS on the same host, **replace** `app.command` and `app.ports` in `compose.yaml` with:

```yaml
    command:
      - serve
      - --http=0.0.0.0:8080
      - --origins=https://kokko.yuwol.dev
    ports:
      - "127.0.0.1:8080:8080"
```

Keep `KOKKO_PUBLIC_URL=https://kokko.yuwol.dev`. Proxy all paths to `http://127.0.0.1:8080`, preserving the host and forwarding the original scheme and client IP. The proxy owns certificates and the HTTP-to-HTTPS redirect. The Google callback does not change.

If nginx also runs in Docker, use a shared private network and a container DNS name instead of `127.0.0.1`; no published backend port is needed in that arrangement.

The current server does not configure trusted proxy headers. To use the real client IP for rate limiting, add the following before `app.Save(settings)` in `apps/server/main.go` and rebuild:

```go
settings.TrustedProxy.Headers = []string{"X-Real-IP"}
settings.TrustedProxy.UseLeftmostIP = false
```

Use this only when the proxy overwrites `X-Real-IP` with the actual client address and clients cannot reach the backend directly. Otherwise, all users behind the proxy share its IP-based request limits.

### Direct HTTPS

The checked-in Compose file defaults to PocketBase-managed HTTPS. If you use it unchanged, allow external TCP 80/443 to reach the host; they map to container ports 8080/8443. PocketBase obtains and renews the certificate. DNS and both ports must be ready, and no other service may occupy them.

### Start and check

```sh
docker compose config --quiet
docker compose up --build -d
docker compose logs --tail=100 app
docker compose ps
curl --fail https://kokko.yuwol.dev/api/health
```

The container runs as UID/GID 65532 with a read-only root filesystem and persistent data under `/data/pb_data` in the `kokko_data` volume. **Do not run `docker compose down -v` unless you intend to delete that data.** Run a single app instance; do not scale multiple processes against the same database.

The healthcheck checks process availability, not public TLS configuration. Verify the public HTTPS endpoint separately. Container builds have been checked for Linux AMD64 and ARM64. Startup and backup/restore were verified on ARM64; verify runtime behavior on your deployment host.

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Server-side Google OAuth credentials |
| `PB_ENCRYPTION_KEY` | Persistent settings-encryption key; required by Compose |
| `KOKKO_PUBLIC_URL` | Public origin; set by Compose |
| `KOKKO_DATA_DIR` | Data directory; `/data/pb_data` in the image |
| `KOKKO_PUBLIC_DIR` | Built frontend directory; `/app/public` in the image |
| `KOKKO_HEALTH_URL` | Optional health probe URL; defaults to internal HTTP port 8080 |

## Continuous integration and GHCR images

[The GitHub Actions workflow](.github/workflows/ci.yaml) runs on pull requests, pushes to `main`, candidate version tags matching `v*` or `[0-9]*`, and manual dispatches.

Every run checks Biome formatting/lint, TypeScript, `gofmt`, and `go vet`; runs frontend tests and Go tests with race detection; builds the app; and runs the mobile Chromium E2E suite. Failed browser runs upload diagnostic artifacts for seven days. No Google credentials or production database are needed for CI.

Release-tag validation and note extraction are also tested. The `pnpm release` command requires a matching dated entry in the committed [CHANGELOG.md](CHANGELOG.md), checks that the checkout matches `origin/main`, waits for passing main CI, creates the tag through `gh`, waits for successful image publication, then publishes a GitHub Release using that entry. Pre-release tags produce pre-releases. The command can resume an incomplete release on the same commit, preserving an already published release.

Only a **push of a valid semantic version tag**, after all checks pass, publishes a multi-platform image (`linux/amd64` and `linux/arm64`). Both `v1.2.3` and `1.2.3` are accepted, including pre-release and build-metadata suffixes defined by [SemVer 2.0.0](https://semver.org/). Tags such as `v1`, `v1.2`, `v01.2.3`, or `v1.2.3-01` do not publish. Pushes to `main`, pull requests, and manual dispatches run validation only, even if a manual dispatch selects a version tag. Registry credentials are available only to the publication job. Actions are pinned to commit SHAs.

Configure these **repository Actions secrets** before the first publication:

| Secret | Value |
| --- | --- |
| `DHI_USERNAME` | Docker username, or organization name for an organization token |
| `DHI_TOKEN` | Docker access token with permission to pull the pinned `dhi.io` images |

Your workstation's Docker login is not available on GitHub runners. GHCR publishing uses the automatic `GITHUB_TOKEN` with job-scoped `packages: write`; no separate GHCR token is needed in Actions. Repository/organization policies must allow package publication. If the GHCR package already exists, grant this repository Actions access to it.

Docker builds run the frontend build and Go tests on the builder's native architecture (`BUILDPLATFORM`), then cross-compile the static Go executable for each target (`TARGETOS`/`TARGETARCH`). QEMU is not required. The Docker test step prints individual test results and has a five-minute timeout per test package; target compilation is a separate step. The native CI race tests and browser tests remain required before publication.

Images are published under **`ghcr.io/injoonh/kokko`** (the workflow lowercases the repository owner/name):

| Trigger | Image tags |
| --- | --- |
| Push a release tag such as `v1.0.0` | `v1.0.0`, `sha-<full-commit-sha>` |
| Push a pre-release tag such as `v1.1.0-rc.1` | `v1.1.0-rc.1`, `sha-<full-commit-sha>` |
| Push to `main`, pull request, or manual dispatch | No image published |

No `latest` or `main` image tag is created or updated. Git tag names are preserved as image tags, except that `+` in build metadata becomes `_` to meet Docker tag rules (for example, `v1.0.0+build.1` becomes `v1.0.0_build.1`). The workflow summary includes the published digest for reproducible deployments. Publishing an image does not restart or deploy to your server.

To publish a release from the intended commit:

```sh
pnpm release v1.2.0
```

Sync the checkout to the tested, merged `main` commit, and replace the example with a new semantic version. Add the matching changelog entry in the feature PR first. Authenticate `gh` for this repository; no additional workflow-editing scope is needed. Never reuse or move an existing version tag. Feature releases increment the minor version; fixes increment the patch version. The ongoing contributor workflow is recorded in [AGENTS.md](AGENTS.md).

To deploy a published image, replace `image: kokko:local` in `compose.yaml` with `image: ghcr.io/injoonh/kokko:v1.2.0` (using your published version or digest), then run:

```sh
docker compose pull app
docker compose up -d --no-build app
```

Keep your existing environment, persistent volume, and reverse-proxy settings. Before an upgrade, take a backup. New GHCR packages default to private: either make the package public or authenticate the deployment host with `docker login ghcr.io` using a personal access token (classic) with `read:packages` and access to the package. Never put registry tokens in Compose or commit them to the repository.

References: [GitHub container publishing](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images), [DHI authentication](https://docs.docker.com/dhi/how-to/use/).

## First administrator and operator commands

The first signup is **not** automatically an administrator. After preparing the deployment environment, generate the initial invitation while the app is stopped:

```sh
docker compose build
docker compose stop app
docker compose run --rm app invite
docker compose up -d app
```

Save the printed code, sign in as the intended administrator, and redeem it. Then identify and promote that account explicitly:

```sh
docker compose stop app
docker compose run --rm app members
docker compose run --rm app promote USER_ID
docker compose up -d app
```

Replace `USER_ID` with the intended account's ID from `members`. Administrators can then issue and deactivate invitations from the app's Settings → Group management screen.

To rename another member, first build or deploy an image containing the `rename` command, then stop the app and use the member ID from `members`:

```sh
docker compose build app
docker compose stop app
docker compose run --rm app members
docker compose run --rm app rename USER_ID "New nickname"
docker compose up -d app
```

Replace `USER_ID` with the intended member's ID and quote nicknames containing spaces. Nicknames must contain 1–20 characters after trimming surrounding whitespace. The command changes only the public nickname, preserves the profile photo and match/rating history, and also works for suspended members who already have a profile. Refresh the website to see the new name. `members` lists current public nicknames, falling back to Google names for accounts that have not activated a profile. When deploying published images, pull the updated image instead of running the build step.

To suspend a member, stop the app, run `docker compose run --rm app suspend USER_ID`, and start it again. For local development, run the corresponding `go run . invite`, `go run . members`, `go run . promote USER_ID`, or `go run . rename USER_ID "New nickname"` command from `apps/server`, with the development server stopped and the same environment loaded.

PocketBase's `/_/` admin page is blocked whenever `KOKKO_PUBLIC_URL` is set. A kokko administrator is not a PocketBase superuser; a superuser account is not needed for normal operation. The local admin page at `http://localhost:8090/_/` is available when that variable is unset and requires a separate superuser account. Domain data uses custom SQL tables and is not editable through PocketBase's standard collection screens.

## Backups and recovery

Production runs in UTC. Scheduled ZIP backups run daily at **18:00 UTC / 03:00 KST**, retaining up to **30 scheduled backups**. Local backup archives are not included inside subsequent backup archives.

Backups on the same volume do not protect against host failure. Copy completed archives to separate storage and apply an external retention policy. For example, replace the destination below with your own backup location:

```sh
mkdir -p /YOUR/SEPARATE/BACKUP/LOCATION
cid=$(docker compose ps -q app)
docker cp "$cid:/data/pb_data/backups/." /YOUR/SEPARATE/BACKUP/LOCATION/
```

Store the encryption key separately. Settings encryption does not encrypt the entire database or ZIP archive.

For a manual backup:

```sh
docker compose stop app
docker compose run --rm app backup
docker compose up -d app
```

The command prints a filename such as `manual-YYYYMMDD-HHMMSS.zip`. To restore an archive already in `pb_data/backups`, first back up the current state, then:

```sh
docker compose stop app
docker compose run --rm app restore manual-YYYYMMDD-HHMMSS.zip --yes
docker compose up -d app
```

For an external archive, replace the restore command with:

```sh
docker compose run --rm -v /ABSOLUTE/PATH/snapshot.zip:/restore.zip:ro app restore /restore.zip --yes
```

Restore must run while the server is stopped. It replaces the data directory and retains the old one as `/data/pb_data.before-restore-TIMESTAMP`. Use trusted backup archives; unsafe paths and archives exceeding the 5 GiB extraction limit are rejected. Verify login, members, matches, playing order, and Elo before removing the retained directory.

## Development reference

The pnpm workspace contains `apps/web` (React, TypeScript, Vite, TanStack Router, Tailwind, shadcn/ui, and Recharts). `apps/server` has its own Go module for PocketBase extensions and migrations. Dependency versions are pinned in the package manifests and lockfiles.

```sh
pnpm format       # Biome and gofmt
pnpm check        # Biome, TypeScript, and go vet
pnpm test         # Frontend unit tests and Go tests with the race detector
pnpm build        # Production frontend and server binary

pnpm --filter @kokko/web exec playwright install chromium
pnpm test:e2e     # Run after pnpm build
```

Tests cover scoring, permissions, invitation redemption, Elo replay, concurrent writes, retry safety, OAuth privilege protection, and backup recovery. Mobile browser tests use an isolated temporary PocketBase database on port 8097; their test-only authentication endpoint is excluded from the production binary.

Pending migrations run on server startup. Back up before upgrades; down migrations are destructive. Real Google login, public TLS, and off-host backup delivery must be verified in your deployment environment.

See [SPEC.md](SPEC.md) for the full product and engineering specification. The self-hosted Pretendard font includes its [OFL license](apps/web/public/fonts/LICENSE.txt); shadcn/ui components include their [MIT notice](apps/web/src/components/ui/LICENSE).
