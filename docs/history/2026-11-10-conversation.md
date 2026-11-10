# Conversation summary — 2026-11-10

This is a dated record of the user request and implemented scope. Current contracts live in [SPEC.md](../../SPEC.md), [HANDOFF.md](../HANDOFF.md), and the [decision record](../DECISIONS.md).

## User request

> Implement ranking system with beautiful crest images.

## Implementation — v1.6.0

The [v1.6.0 release](https://github.com/injoonH/kokko/releases/tag/v1.6.0) adds six Elo tiers with original graphite-and-silver badminton crests: Bronze, Silver, Gold, Platinum, Diamond, and Master. Home and profiles display personal crests, discipline-specific Elo/game counts, next-tier distance, and progress. The player list shows crests alongside server-assigned standings, with an accessible tier guide showing every crest and its threshold.

Tier boundaries use rounded displayed current Elo: below 900, then 900, 1,000, 1,100, 1,200, and 1,300. Singles and doubles are independent. A positive current game count is required, so the initial 1,000 Elo alone does not award a crest. Period filters do not change tiers. Promotions/demotions follow current ratings, including after replay; no tier awards are stored. Zero-game and suspended members retain their existing exclusion from active ordinal standings.

The six images were generated with the built-in image_gen tool, checked visually, and exported as transparent 384px WebP assets totaling about 201 KiB. The [artwork notes](../CRESTS.md) link all delivered files and the exact generation prompts. No migration or new environment variables are required.

The standing workflow applies: validate, open an assigned PR, squash-merge passing code, and publish a new semantic version. Release/image publication does not deploy the owner's Docker host.


## Follow-up request

> As all crests are same color, It is hard to tell the difference. Use different colors for them. Also, currently, crests are showing too big. Also, use same component for choosing participants for battle simulation and recording real battles.

## Follow-up implementation — v1.6.1

The [v1.6.1 release](https://github.com/injoonH/kokko/releases/tag/v1.6.1) fixes crest recognition and scale: copper, cool steel, yellow gold, emerald, blue, and violet distinguish the six tiers. Original motifs and tier names remain. Images are 64px on Home/profile tier cards, 56px in the guide, and 24px beside tier names in standings, with player avatars restored as the main identity image. This supersedes the original all-monochrome crest presentation; Elo tier thresholds and ranking rules stay the same.

Simulation, real entry, and corrections now use the same avatar-based participant picker, active-member dialog, position-swap behavior, and clear-slot action. Simulation selections remain local and separate from real drafts and pending saves. Real entry retains scores during individual participant changes, and locks the shared picker while a save is unresolved. Browser coverage checks both screens with the same interaction sequence, switching singles/doubles, preservation of hidden slots, pending-save locks, compact crest dimensions, and unchanged server records while previewing.

The six recolors were made with the built-in image_gen tool and exported as transparent WebP images. [Artwork notes and exact prompts](../CRESTS.md) document the delivered files. No migration or new environment variables are required. Publishing does not update the running Docker host.

## Home layout feedback

> I think '다음 경기는 누구랑' and '가상 대결' are too large and located too top in the home tab so that other important informations are sinked down.

## Home layout implementation — v1.6.2

The [v1.6.2 release](https://github.com/injoonH/kokko/releases/tag/v1.6.2) removes the two large planning cards from the top of Home. Filters, key stats, personal tier, the Elo chart, and recent matches now appear first. **다음 경기 추천** and **가상 대결** remain available as two compact 44px links in a single row below recent matches. The shorter court label replaces **다음 경기는 누구랑?** on Home.

The main match-entry action remains prominent in the app header. No rating, court-planning, simulator, draft, or storage behavior changes. The existing mobile dashboard/browser coverage is updated for the new label and viewport screenshots, including checks that the current-Elo card and the win-rate/Elo-change labels are in the initial mobile viewport. No migration or new environment variables are required, and release publication does not deploy the running host.
