# November 23, 2026

After the seasonal leaderboard release, the owner reported that oversized UI components left too little information visible before scrolling and asked for a usability improvement.

[v2.2.1](https://github.com/injoonH/kokko/releases/tag/v2.2.1) shortens the app shell, combines summary stats, and moves recent games ahead of the Home chart and discovery tools. Rank progress, details and confidence remain accessible. It compacts standings, history, and confirmation cards, and puts scores immediately after teams and quick rotations on entry. Browser tests check the first screen at 320 and 390 pixels with synthetic matches. [Decision 24](../DECISIONS.md#24-show-more-match-information-on-phones) · [Issue #27](https://github.com/injoonH/kokko/issues/27)

The narrowest screenshot caught an Elo change splitting across lines. [v2.2.2](https://github.com/injoonH/kokko/releases/tag/v2.2.2) adds the unbroken-number fix and its browser assertion for the Pi rollout.

## UX redesign kickoff

Later that day the owner had every mobile screen rebuilt from code as editable, component-based Figma frames, switched them to Pretendard, and asked for a UX critique. They agreed with these findings:
- Entry is a long form whose save button sits below the fold.
- "경기 기록" names both an action and a tab.
- Solid black means both "action" and "selected".
- There are too many rating measures on screen.
- Results aren't scannable.
- Destructive actions sit too close to frequent ones.
- Some pages do too many jobs, and helper copy is heavy.

They chose to begin with the foundations step. They also asked that their own team always appear on the left; which side counts as A or B does not matter to players.

Implemented: [v2.3.0](https://github.com/injoonH/kokko/releases/tag/v2.3.0) foundations, under [decision 25](../DECISIONS.md#25-separate-actions-from-selections) and [#30](https://github.com/injoonH/kokko/issues/30).

Proposals still open:
- A thumb-first entry flow.
- Navigation changes.
- Page restructuring.
- The owner's question whether results could be recorded freely, with disputes instead of opponent confirmation; they find the extra confirmation step tiring.
- Which rating system to put first.
