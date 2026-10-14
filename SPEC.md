# kokko — Product and Engineering Specification

## 1. Objective

Build **kokko**, a mobile-first web application for a small group of friends to record badminton results and explore match history, player statistics, partner synergy, and Elo rating changes.

The name “kokko” comes from the Korean pronunciation of the final syllable in “shuttlecock.”

The mascot is **꼬꼬**, a cute chicken holding a badminton racket.

The application will initially serve a single group of no more than 10 people.

The primary product priority is:

**Make it quick and easy to record several completed matches after a badminton session.**

This is not a live scoreboard. Users enter results after playing.

Implement a working application, including backend behavior, configuration, tests, and deployment documentation. Do not stop after producing a plan or a static mockup.

## 2. Confirmed Requirements and Approved Initial Defaults

Treat the explicitly stated product and engineering requirements as mandatory.

The following initial defaults were approved during planning. Document them so they can be changed later:

- Initial Elo: 1,000.
- K-factor: 32.
- Separate singles and doubles ratings.
- Elo changes based on wins and losses, without score-margin adjustments.
- The partner synergy formula defined below.
- A minimum of five matches before displaying a synergy assessment.
- Deletion permissions identical to editing permissions.
- Soft deletion of matches.
- Single-use invitation codes by default.
- A light theme as the default appearance.
- The suggested screen and navigation structure.

Do not ask for confirmation about routine implementation details. Ask only when a blocker would require changing a core requirement.

## 3. Starting Environment and Technology Stack

The starting directory is an empty Git repository with only `git init` completed.

- Use the current directory as the project root.
- Do not create a nested Git repository or an unnecessary wrapper directory.
- Set up the project from scratch.

Use:

- React.
- TypeScript for the frontend.
- Vite.
- TanStack Router.
- Tailwind CSS.
- shadcn/ui.
- PocketBase.
- Charts compatible with the shadcn/ui Chart approach.

Use **pnpm** for the frontend in a monorepo workspace. Place the frontend in `apps/web` and the Go PocketBase application in `apps/server`, with its own Go module.

- Briefly explain the choice.
- Pin the chosen tool version.
- Commit its lockfile.
- Use the same package manager in local development, scripts, documentation, and Docker builds.
- Do not mix package-manager lockfiles.

Check the official documentation for the versions you actually use. Pin dependencies appropriately.

Do not add another backend framework unless there is a concrete need.

## 4. Language, Typography, and Visual Identity

### Language

All users are Korean. Support **Korean only**.

- All user-facing navigation, buttons, forms, validation messages, errors, empty states, chart labels, and accessibility labels must be in Korean.
- Set the HTML document language to `ko`.
- Do not add a language selector or an unnecessary internationalization framework.
- Keep the brand name `kokko` and established technical labels such as `Elo` where appropriate.

### Typography

Use **Pretendard Variable** as the primary font.

- Verify the font source and license.
- Provide appropriate system-font fallbacks.
- Pay particular attention to the alignment and readability of scores, ratings, and statistical values.

### Theme and Components

Use a black, white, and gray visual palette.

- Default to a white background with dark text.
- Use shadcn/ui components wherever appropriate, including Button, Card, Table, Tabs, Dialog, Sheet, Select, Form, and Tooltip.
- Make important numbers and primary actions visually clear.
- Avoid making the product feel like a dense administrative dashboard.
- Communicate wins, losses, and rating changes with labels, signs, and icons rather than color alone.
- Provide accessible contrast, focus indicators, labels, and touch targets.
- Ensure forms, tables, and charts work on narrow mobile screens.

### Mascot

Create a simple, cute chicken mascot named **꼬꼬**, holding a badminton racket.

Use it sparingly in places such as:

- The brand area.
- Empty states.
- Successful match submission states.

Keep it consistent with the monochrome visual system.

If image-generation tools are unavailable, create an original SVG or another suitable original asset. Do not reuse an unrelated copyrighted character.

## 5. Authentication, Invitations, and Membership

Use **Google sign-in**.

A valid invitation code is required for first-time membership.

- Existing members must not need to enter an invitation code again when signing in.
- Only users who have completed both Google authentication and invitation verification may access application data.
- A Google-authenticated account that has not completed invitation verification must not be able to read or modify matches, players, or statistics.
- Enforce invitation verification and membership access on the server.
- Do not rely on hidden UI elements or route guards as the security boundary.
- Only registered, activated members may be selected as match participants.
- Members may view other members’ match histories and statistics.

Separate ordinary members from application administrators.

- Do not implement application administration by exposing PocketBase superuser credentials.
- Assign the first administrator explicitly through a server-side setup procedure.
- Do not automatically make the first person who signs up an administrator.

Approved invitation defaults:

- Administrators can generate and deactivate invitation codes.
- Codes are single-use by default.
- Code redemption must be atomic to prevent concurrent reuse.
- Ordinary members cannot list invitation codes or inspect redemption information.

Display nicknames and profile images. Do not expose members’ Google email addresses to other members.

The first version serves one private group. Multi-group management is out of scope.

## 6. Match Model and Scoring Rules

One completed **21-point game counts as one match record**.

Support:

- Singles: one player versus one player.
- Doubles: two players versus two players.

Doubles is the default input mode.

A player cannot occupy multiple positions in the same match.

### Valid Final Scores

A game normally ends at 21 points.

At 20–20:

- A team must win by two points.
- The maximum winning score is 30.
- At 29–29, the next point wins.

Accept only valid completed-game scores.

Examples:

- Valid: 21–0 through 21–19.
- Valid: 22–20, 23–21, and subsequent two-point victories through 29–27.
- Valid: 30–28 and 30–29.
- Invalid: 21–20, 22–19, 30–27, tied scores, negative scores, non-integer scores, or scores above 30.

Apply the same validation regardless of which team won.

Derive the winning team from the score.

Store the actual playing date/order separately from the record creation timestamp.

## 7. Match Permissions

Only a participant in a match may create its record.

- Preselect the signed-in member in the match form.
- Verify on the server that the submitting user is a participant.
- Application administrators do not bypass this creation requirement.

Only the record’s author or an application administrator may edit it.

- Prevent users from changing record ownership to bypass permissions.
- Preserve valid team sizes and unique participants during edits.
- An ordinary author must not use editing to remove themselves and bypass the participant requirement.

Approved deletion behavior:

- The author and administrators may delete a record.
- Require confirmation.
- Use soft deletion.
- Exclude deleted matches from statistics and rating calculations.
- Retain enough history to trace edits and deletions.

## 8. Fast Match Entry

The primary flow is:

**Select players → assign teams → enter final scores → save.**

Requirements:

- Optimize controls for one-handed mobile use.
- Default the playing date to today while allowing historical dates.
- Make all members easy to select from a small player list.
- Preselect the current user.
- Clearly show selected players and team assignments.
- Make swapping player positions or changing team assignments easy.
- Use numeric keyboards for score inputs.
- Minimize input for typical 21-point results while keeping both scores visible and editable.
- Keep entered data after a failed submission and support retrying.
- Disable repeated submission while saving.
- Prevent duplicate creation caused by request retries on the server.
- Allow genuine repeated games involving the same players and score.

After saving, provide a **“Next match with the same players”** action.

This should:

- Preserve the date and player selection.
- Allow quick team reassignment.
- Clear the scores.

### Playing Order

Elo depends on match order.

Allow users to inspect and correct the order of matches played on the same day.

Do not force users to enter an exact clock time for every match. Prefer a playing date plus an explicit within-day order.

Use a stable tie-breaker to ensure deterministic processing.

## 9. Screens and Navigation

The following initial screen structure was approved.

### Home / My Dashboard

Display:

- Current Elo and personal ranking.
- Period selection: 7 days, 30 days, 90 days, and all time.
- Match count, wins, losses, win rate, and Elo change for the selected period.
- Elo history chart.
- Recent matches.
- A prominent match-entry action.

Provide a singles/doubles switch, defaulting to doubles.

### Match History

Provide a table containing:

- Playing date.
- Match type.
- Players on both teams.
- Final score.
- Win/loss from the selected player’s perspective.
- That player’s Elo change.

Provide filters for:

- Period.
- Player.
- Singles or doubles.
- Win or loss.

On mobile, prioritize essential columns and expose additional information in match details.

Show edit and delete actions only to authorized users, while enforcing the same permissions on the server.

### Players

Provide:

- A member list.
- Separate singles and doubles rankings.
- Player detail pages with Elo, match count, win rate, match history, and rating charts.
- Separate statistics for playing together as partners and playing against one another.

### Partner Synergy

Use doubles matches only.

For each partner, show:

- Matches played together.
- Wins and losses.
- Win rate.
- Synergy indicator.
- Sample size and an explanation of the calculation.

### Settings and Administration

Provide:

- Profile settings.
- Sign-out.
- Administrator-only invitation management.
- Match management consistent with the permission rules.

Keep mobile navigation simple, such as Home, History, Players, and Settings. Keep match recording readily accessible as the primary action.

## 10. Elo Calculation

Use these initial defaults:

- Initial player rating: **1,000**.
- K-factor: **32**.
- Separate singles and doubles rating pools.
- No score-margin multiplier.

For doubles, the team rating is the arithmetic mean of its two players’ pre-match doubles ratings.

For singles, the team rating is the player’s singles rating.

Expected result for Team A:

`E_A = 1 / (1 + 10^((R_B - R_A) / 400))`

Rating change for each player on Team A:

`delta_A = 32 × (S_A - E_A)`

Where:

- `S_A = 1` for a win.
- `S_A = 0` for a loss.

Apply the corresponding calculation to Team B.

For doubles, both teammates receive the same rating adjustment.

- Preserve decimal precision internally.
- Round only for presentation.
- Track each player’s pre-match rating, post-match rating, and rating change.
- Calculate authoritative ratings on the server.
- Do not trust client-provided rating values.

### Recalculation and Consistency

Process matches in actual playing order, with a stable tie-breaker.

When a historical match is created, edited, deleted, or reordered:

- Recalculate the affected singles or doubles rating history.
- Update related statistics and synergy calculations.
- Preserve deterministic results.

Given the small dataset, a complete replay of the affected rating pool is acceptable and preferable to fragile optimization.

Use transactions, server-side serialization, or another suitable mechanism so concurrent submissions cannot corrupt match order or ratings.

Do not expose partially recalculated data as final results.

## 11. Period Statistics and Rating Charts

Interpret dates in **Asia/Seoul**.

Store actual timestamps in UTC. Define the match’s local playing date consistently.

For 7-, 30-, and 90-day filters:

- Include today and the preceding N−1 Korean calendar dates.
- Use the actual playing date rather than the record creation date.

Calculate period Elo change as:

**Rating at the end of the period minus rating immediately before the period began.**

- Use 1,000 if no earlier matches exist.
- If no matches occurred in the period, show zero matches and zero rating change.
- Do not plot a rating of zero on days without matches.
- Include a period-start baseline so the first rating change is understandable.

The chart should offer the clarity of a rating-history view like chess.com, without copying its branding or exact interface.

Tapping or hovering over a match point should show:

- Playing date.
- Teams.
- Score.
- Post-match rating.
- Rating change.

Preserve visibility into individual rating changes when multiple matches occur on the same day.

## 12. Partner Synergy

Do not equate the highest raw partnership win rate with the strongest synergy.

Use this approved initial metric:

**Synergy = 100 × mean(actual result − pre-match team expected win probability)**

Where:

- Actual result is 1 for a win and 0 for a loss.
- Expected probability comes from the pre-match doubles Elo calculation.
- The display unit is percentage points, or `pp`.

A positive value means the pair performed better than their Elo-based expectation against those opponents.

Requirements:

- Display win rate separately from synergy.
- Always show the number of matches behind the metric.
- Below five matches, show a Korean “insufficient data” state instead of a synergy assessment.
- Explain that this is a descriptive reference metric, not proof of a causal partnership effect.
- Update the metric whenever match history or pre-match Elo values change.

## 13. Routing and Frontend State

Use **TanStack Router with type-safe, file-based routing**.

Distinguish routes for:

- Unauthenticated users.
- Authenticated users who have not completed invitation verification.
- Activated members.
- Administrators.

Route guards improve navigation behavior but do not replace backend authorization.

Where appropriate, store filters such as period, player, and match type in validated URL search parameters.

Filters should survive refreshes and browser back navigation.

Direct navigation to a nested URL and refreshing that URL must work in production.

## 14. Backend Design

Use PocketBase for authentication, persistence, and server-side application logic.

Design the collections and relationships needed for:

- Members and public profiles.
- Invitations.
- Matches.
- Match participation.
- Rating history.
- Edit and deletion history.

Choose the exact schema based on integrity, access control, and ease of recalculation.

Requirements:

- Manage schemas and access rules with migrations.
- Validate membership, participation, ownership, administrative permissions, and scoring on the server.
- Prevent ordinary users from modifying roles, activation status, ratings, or other protected fields.
- Separate public profile data from private authentication information, or enforce equivalent field-level protection.
- Keep server secrets and PocketBase superuser credentials out of frontend code.
- Keep development seed data separate from real user data.

### PocketBase Extension Language

The frontend must use TypeScript. PocketBase extensions do not need to use TypeScript.

Use a Go-based PocketBase application. Manage Go modules and the exact toolchain version, document development/build/test commands, and use gofmt. Go was selected for explicit transaction boundaries, deterministic replay, and concurrency testing.

Avoid unnecessary backend frameworks or infrastructure.

## 15. Formatting and Code Quality

Use **Biome and EditorConfig**.

- Use Biome for formatting, linting, and import organization on supported files.
- Configure `.editorconfig` for indentation, UTF-8, line endings, and final newlines.
- Avoid redundant formatter configurations that conflict with Biome.
- Exclude generated files and build artifacts appropriately.
- Provide commands for formatting, linting, type checking, testing, and building.
- Use `gofmt` for Go code if applicable.
- Do not assume Biome supports every file type.

## 16. Docker and Deployment

Provide working Docker build files and a final **`compose.yaml`**.

Use one Go PocketBase service to serve the built frontend and API at the same origin, `https://kokko.yuwol.dev`. Use PocketBase's built-in HTTPS; no existing reverse proxy is assumed. Map external ports 80/443 to unprivileged container ports 8080/8443 and persist the entire data directory, including certificates.

Development uses Vite on port 5173 with `/api` proxied to PocketBase on port 8090. Browser API calls use relative same-origin paths.

### Base Images

Use **Docker Hardened Images from `dhi.io`** for build and runtime stages. Access was verified with authenticated Docker pulls during planning.

For both build and runtime stages:

- Verify that the image and tag actually exist.
- Verify architecture compatibility, required tools, and access requirements.
- Do not invent image names or tags.
- If registry authentication is required, document the prerequisite.
- Never place registry credentials in source control or container images.
- Resolve image access or compatibility problems explicitly; do not silently substitute non-DHI images.
- Use explicit version tags instead of `latest`.
- Pin image digests where practical.
- Do not assume a minimal runtime image includes a shell or package manager.

### Container Operation

- Use multi-stage builds where appropriate.
- Include only required runtime artifacts in final images.
- Run as a non-root user where practical.
- Ensure the runtime user can write to the PocketBase data volume.
- Persist PocketBase data across container recreation.
- Provide a `.dockerignore` that excludes secrets, real data, and unnecessary development files.
- Provide environment-variable examples, health-check or status-check instructions, restart policies, and backup/restore instructions.
- After required external configuration, the application should start using `docker compose up --build`.
- Validate Compose configuration and perform image build and startup checks where possible.
- Clearly report anything that could not be verified because of unavailable credentials or environment limitations.

## 17. Documentation and External Setup

Provide a README covering:

- Local installation and development.
- Tool versions and package-manager choice.
- Environment variables.
- PocketBase version and migrations.
- Google OAuth configuration.
- Development and production redirect URIs.
- First-administrator setup.
- Initial invitation-code creation.
- Production deployment with persistent storage.
- Backup and restore procedures.
- Elo, synergy, date ordering, and period-statistics policies.

Clearly distinguish implemented functionality from external setup the user must complete.

Do not claim Google sign-in works without configuring and testing the required credentials.

Do not replace production authentication with fake sign-in.

An explicitly labeled development demo may be provided for UI inspection without OAuth credentials, but keep it separate from production authentication and data.

## 18. Validation and Acceptance Criteria

Write meaningful tests for the critical behavior:

- Valid and invalid final scores, including deuce and the 30-point cap.
- Correct singles/doubles team sizes.
- Duplicate-player prevention.
- Blocking match creation by nonparticipants.
- Blocking unauthorized edits and deletions.
- Blocking application data access before invitation verification.
- Preventing invitation-code reuse.
- Singles and doubles Elo calculations.
- Recalculation after historical insertion, edits, deletions, and reordering.
- Period changes that correctly use the rating before the period starts.
- Insufficient-data handling for partner synergy.
- Retry-safe submissions and consistent concurrent writes.

Run:

- Formatting and lint checks.
- Type checks.
- Relevant tests.
- Production builds.

Where the environment permits, verify the main user flows at mobile screen sizes.

Implement loading, empty, error, first-time onboarding, and no-match states.

## 19. Execution and Final Report

Start with a concise implementation plan, then proceed with implementation.

Make routine decisions autonomously within this specification.

Ask questions only when a concrete blocker requires changing a core requirement.

Complete the working application rather than stopping at a scaffold or visual prototype.

In the final report, briefly provide:

- Implemented functionality.
- Validation performed and results.
- How to run the project.
- External configuration the user still needs to complete.
- Known limitations or unverified behavior.

Do not claim tests, builds, authentication flows, or deployment checks succeeded unless they were actually verified.

## 20. Approved Implementation Decisions

The user explicitly approved the final plan and authorized implementation. Feedback on future proposals alone does not authorize implementation of those proposals.

- Use a pnpm workspace monorepo: `apps/web` and `apps/server`; no additional orchestration framework or shared package until needed.
- Production origin: `https://kokko.yuwol.dev`. One Go PocketBase process serves both the built frontend and API. Do not assume an existing reverse proxy. Use built-in HTTPS with persistent certificates/data, non-root high internal ports, and external ports 80/443.
- Google OAuth uses same-tab authorization-code exchange with state and PKCE. Callbacks are `http://localhost:5173/auth/callback` and `https://kokko.yuwol.dev/auth/callback`.
- New OAuth accounts are pending. Invitation redemption and activation commit atomically. Only Google-authenticated, invitation-activated members access application data.
- Initial setup creates an invitation through a server CLI. The designated administrator redeems it and is then promoted by explicit account ID through the CLI; never promote the first signup automatically.
- Invitations are single-use, expire in seven days, are not email-bound, and store only a hash. Show the secret once, rate-limit redemption, and allow administrators to deactivate codes.
- Store `played_on` as a Korean calendar date, not a fabricated timestamp. Reject future dates. Use a shared within-day sequence across match types and an immutable match ID tie-breaker. Append by default; allow an explicit position.
- Authors can move their own matches. Administrators can move all matches and correct participants even if this removes the original author. Authorship is immutable; ordinary authors must remain participants after their edits.
- Use match versions and day sequence versions to detect stale updates. Renumbering adjacent matches is system normalization, not permission to change their content.
- Serialize match mutations in one application instance. Commit match data, participants, audit history, complete affected-pool Elo replay, revision, and idempotency result together. Type changes replay both pools. No partially recalculated reads.
- Use float64 internally without intermediate rounding. Display current Elo as an integer and changes to one decimal place. Each doubles teammate receives the full calculated delta.
- Synergy's five-match threshold applies to the selected period, but expected probability comes from full-history pre-match Elo. Do not invent qualitative grading thresholds.
- Soft-deleted matches are excluded from calculations. Administrators may restore them, triggering replay. Retain audit history without automatic purging in v1.
- Rankings use current cumulative Elo; zero-game players are unranked, and equal displayed ratings share rank.
- Default UI: light theme only, doubles, last 30 days, Home/History/Players/Settings. Self-host Pretendard Variable with its license.
- Membership suspension revokes access and new participation but preserves history. Unchanged historical participants may remain during corrections.
- Group size is a scale assumption, not a hard signup cap. Account erasure UI and offline automatic synchronization are outside v1.
- Use daily backups with 30-copy scheduled retention. The operator must copy archives to a separate storage location and verify restoration before production use.
- Test transaction rollback, simultaneous ordering, type changes, restoration, suspension, and email isolation in addition to section 18.
