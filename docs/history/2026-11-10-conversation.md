# Conversation summary — 2026-11-10

This is a dated record of the user request and implemented scope. Current contracts live in [SPEC.md](../../SPEC.md), [HANDOFF.md](../HANDOFF.md), and the [decision record](../DECISIONS.md).

## User request

> Implement ranking system with beautiful crest images.

## Implementation — v1.6.0

The [v1.6.0 release](https://github.com/injoonH/kokko/releases/tag/v1.6.0) adds six Elo tiers with original graphite-and-silver badminton crests: Bronze, Silver, Gold, Platinum, Diamond, and Master. Home and profiles display personal crests, discipline-specific Elo/game counts, next-tier distance, and progress. The player list shows crests alongside server-assigned standings, with an accessible tier guide showing every crest and its threshold.

Tier boundaries use rounded displayed current Elo: below 900, then 900, 1,000, 1,100, 1,200, and 1,300. Singles and doubles are independent. A positive current game count is required, so the initial 1,000 Elo alone does not award a crest. Period filters do not change tiers. Promotions/demotions follow current ratings, including after replay; no tier awards are stored. Zero-game and suspended members retain their existing exclusion from active ordinal standings.

The six images were generated with the built-in image_gen tool, checked visually, and exported as transparent 384px WebP assets totaling about 201 KiB. The [artwork notes](../CRESTS.md) link all delivered files and the exact generation prompts. No migration or new environment variables are required.

The standing workflow applies: validate, open an assigned PR, squash-merge passing code, and publish a new semantic version. Release/image publication does not deploy the owner's Docker host.
