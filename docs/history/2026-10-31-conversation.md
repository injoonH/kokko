# Conversation archive — through 2026-10-31

This is a curated archive of the **available project conversation**, reconciled with repository history and releases. The user requested portable memory for newcomers and agents on other computers. Quoted passages below are visible user messages; the outcomes are factual summaries, not verbatim assistant transcripts. Some earlier planning messages are unavailable, so this is not a complete raw chat export. No hidden reasoning, session credentials, private auth files, or unrelated conversations are included.

Initial request dates are not recoverable from the available messages. Dates in the implementation timeline come from Git/release history rather than invented conversation timestamps. Read [HANDOFF.md](../HANDOFF.md) for current behavior and [DECISIONS.md](../DECISIONS.md) for rationale. Historical requests and suggestions are not a fresh task to execute.

## 1. Original product request

> 친구들이랑 배드민턴을 복식으로 자주 치는데 체스 ELO rating 관리하듯이 관리하고 싶어. DB는 pocketbase 이용하고 Google Auth를 지원하게 해줘. 경기 결과를 입력하면 ELO rating이 자동으로 계산되어야 해. 개인 프로필 페이지가 있어서 지난 전적이나 rating 변화 등을 그래프로 확인할 수 있어야 해. 가장 중요한 건 경기 결과 입력이 편해야 해. 몇 점 만점 내기이고, 누구랑 누가 팀이었고 몇 대 몇으로 경기가 끝났는지 기록할 거야. 이걸 웹사이트로 만들어야 해. UI는 black and white로 간단하게 만들고 shadcn ui를 적극적으로 사용해. 친구들끼리만 사용할 거고 사용자는 10명 정도야. 우리의 생각이 align 되었는지 확인하고 구현을 시작해.

The requested product is a private badminton Elo tracker with PocketBase, Google sign-in, automatic rating calculation, personal histories/charts, simple monochrome shadcn UI, and exceptionally convenient result entry. The user asked for initial alignment before implementation.

## 2. Clarifications and deployment

> 1. ELO 규칙 추천해 준 대로 진행. 2. 경기 종료 점수는 달라질 수 있어. 우리는 늘 듀스를 가지고 경기해. 3. 경기 결과는 참여한 아무나 입력할 수 있어. 4. 우리는 경기가 끝날 때마다 새로운 조합으로 경기를 하곤 해. 경기를 여러 번 하다 보면 다시 했던 조합으로 경기하기도 해.

The user accepted the suggested Elo rules, said the group always plays deuce, allowed any participant to enter a game, and emphasized changing and recurring team combinations. The exact earlier assistant proposal is unavailable here; the approved Elo contract is preserved in `SPEC.md` and the implementation. The current 21/30 scoring rule and the limits of what can be inferred from the early wording are recorded in [the scoring decision](../DECISIONS.md#6-scoring-and-early-wording).

When asked whether an existing PocketBase server was available, the user selected:

> 새 PocketBase 서버 구성 포함

They then specified:

> 해당 서비스는 Docker compose를 이용해 직접 배포할 예정. 따라서 배포에 필요한 Dockerfile도 생성해야 함.

The project therefore includes a new Go-embedded PocketBase server, Dockerfile, Compose deployment, persistent storage, and setup/recovery documentation. The current monorepo and server implementation are the baseline; do not recreate an empty repository from the specification's historical starting-environment section.

## 3. Renaming another member

Two successive questions clarified the intended action:

> I'd like to update specific user's name. How?

> I'd like to change other user's nickname. How?

The initial explanation distinguished editing one's own profile from changing someone else's public nickname. The resulting operator command was `rename USER_ID NICKNAME`, shipped in v1.1.0. It updates `kokko_profiles.nickname`, not Google's `users.name`, and preserves account privileges, avatar, matches, and Elo. The `members` command was changed to show current public nicknames. Unicode limits, missing profiles, suspended members, and history preservation were tested.

At that point the command required a stopped server and an updated image. This limitation was later addressed for active admins by a live nickname editor in v1.2.0. The offline command still exists for operators.

## 4. GitHub preferences and selected next features

> Suggest what we can do next. Also, from now on, use `gh` CLI tool to make commits and push to the origin. Commit title must start with capital letter and less than 50 characters.

The next-step suggestions were quick team rotation, flexible scoring, admin member editing, next-match recommendations, and off-server backup copying. Suggestions alone did not mean all of them had shipped or were a committed roadmap.

The user selected:

> As you said, let's start with Quick rotation and admin nickname editing. Create PR, and squash merge.

During that work they added:

> Assign myself as PR's assignee.

[PR #1](https://github.com/injoonH/kokko/pull/1) added three-pairing doubles rotation and live admin nickname editing, was assigned to **@injoonH** (the authenticated user in that session), and squash-merged as `838e65f`. The commit title was `Add quick rotation and nickname editing`, within the requested limit. Local checks and eight browser tests passed, followed by GitHub CI.

The local CLI's assignee-edit command encountered the deprecated Projects (classic) query. Assignment succeeded through `gh api`'s issue-assignee endpoint. This was a historical tool compatibility issue; the fallback is documented in the handoff rather than treated as an application defect.

## 5. Ongoing autonomy and feature releases

> Keep making our project better. When new features are introduced, git tag it and write changelogs. Do these things by yourself. Amaze me.

This authorized choosing and shipping focused improvements without returning for routine implementation approval. It also added a durable requirement for version tags and changelogs when introducing features.

The next improvement was **Today's Court**: choose attending players, prioritize friends with fewer games and more rest, use doubles Elo and partnership variety for suggestions, and open a suggested lineup directly in match entry. Entered scores require an explicit replacement choice; unresolved save requests remain protected. The UI was checked on mobile and desktop.

[PR #2](https://github.com/injoonH/kokko/pull/2) also added `AGENTS.md`, `CHANGELOG.md`, and `pnpm release`. The previous GitHub token had no `workflow` scope, so release automation uses `gh` and the existing tagged-image workflow rather than changing credentials or requiring a workflow edit. This permission observation is local to that session, not a permanent limit for future contributors.

The PR was assigned to @injoonH and squash-merged as `e9ca064`. **[v1.2.0](https://github.com/injoonH/kokko/releases/tag/v1.2.0)** was tagged on that exact commit and published on 2026-10-31. The release includes Today's Court, the previously untagged rotation/admin features, and release tooling. Its [tagged workflow](https://github.com/injoonH/kokko/actions/runs/41167104423) passed validation and AMD64/ARM64 image publication, and the command published GitHub Release notes from the committed changelog.

## 6. Portable memory request

> Archive your memory and our conversations in some way so that newcomers or coding agents in other pc can work in this project.

This request is implemented as versioned Markdown: a start-here handoff, a decision record, this dated conversation archive, and links from the normal agent and human entry points. The aim is to transfer project intent and verified state without requiring access to the original chat account or computer.

## Implementation timeline

| Milestone | Date | Evidence |
| --- | --- | --- |
| Initial application, v1.0.0 | 2026-10-14 | [`4937b76`](https://github.com/injoonH/kokko/commit/4937b76842d62d3e11d097d17d9a90403578b092) |
| Native build-time tests and target cross-compilation, v1.0.1 | 2026-10-14 | [`791489e`](https://github.com/injoonH/kokko/commit/791489edd81b6ea1b1bad6ae6a945d341bb6c9b3) |
| Operator nickname rename, v1.1.0 | 2026-10-31 | [`72835ce`](https://github.com/injoonH/kokko/commit/72835ced0a022c6d706a6aaae2412d340e5bca46) |
| Quick rotation and admin nickname editing | 2026-10-31 | [PR #1](https://github.com/injoonH/kokko/pull/1), squash `838e65f` |
| Today's Court and versioned release command, v1.2.0 | 2026-10-31 | [PR #2](https://github.com/injoonH/kokko/pull/2), squash `e9ca064`, [release](https://github.com/injoonH/kokko/releases/tag/v1.2.0) |

## Boundaries and unresolved items

- **Scoring:** current code supports 21-point games with deuce and a 30-point cap. Custom targets/caps were discussed but are not shipped. Do not invent missing planning messages to resolve that distinction.
- **Backups:** daily local backups and recovery commands are shipped; automated off-host copying was only suggested. The actual off-host destination and successful restoration on the owner's production host were not verified in this conversation.
- **Deployment:** image publication was verified; restarting/upgrading the owner's Docker host was not performed or observed. The live version and actual reverse-proxy topology must be established separately.
- **Scope:** multi-group management, account-erasure UI, and automatic offline synchronization remain outside the recorded v1 scope. No cloud deployment or hidden background improvement schedule was created.
- **Local-only state:** the original working tree had a pre-existing deletion of `kokko_local.tar.gz`. It was deliberately excluded from these implementation commits. This is historical workstation context, not an instruction to delete or restore that file in a fresh clone. Inspect current Git status instead of replaying local artifacts.
- **Archive completeness:** this document preserves available user requests, decisions, and verified outcomes. It does not claim to reproduce unavailable assistant replies or the full initial planning exchange.
