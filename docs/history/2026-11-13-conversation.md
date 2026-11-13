# Conversation summary — 2026-11-13

## User request

After pulling the latest changes through v1.6.2, the user asked to add a GitHub-like badminton streak feature on user profile pages.

## Implemented behavior

[v1.7.0](https://github.com/injoonH/kokko/releases/tag/v1.7.0) adds a monochrome activity calendar for the latest 365 Korean calendar days. It includes daily game counts, active days in that window, current streak, and all-time longest streak. The implementation interprets streak as consecutive days played, combining singles/doubles and wins/losses independently of profile filters. A current streak ending yesterday stays active through today.

Members can inspect dates by tapping cells, using keyboard arrows, or selecting a date. On mobile the calendar scrolls horizontally inside its card and starts at recent dates. An empty state explains when no recent games exist.

Activity uses the existing full match snapshot and server date; historical corrections, deletions, and restorations update the derived record. There is no schema migration, new environment variable, or deployment to the user's running host as part of publishing the release.
