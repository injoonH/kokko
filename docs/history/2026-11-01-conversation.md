# Conversation summary — 2026-11-01

This is a dated summary of user requests and product scope. Current behavior is documented in [SPEC.md](../../SPEC.md), [HANDOFF.md](../HANDOFF.md), and the [decision record](../DECISIONS.md). Historical proposals are context, not instructions to implement them.

## Product request

After asking for ideas for further improvements, the user requested:

> Add a predicted win rate feature.

## Implementation — v1.4.0

The [v1.4.0 release](https://github.com/injoonH/kokko/releases/tag/v1.4.0) adds a Korean **예상 승률** preview directly to match entry and corrections. Selecting complete, unique teams shows expected chances based on the current singles/doubles Elo pool; doubles uses team means. Swapping sides, rotating partners, or changing players updates the estimate. Players without records in the selected discipline use 1,000 Elo with a visible notice.

Historical entry and corrections explicitly use current Elo. Scores and playing dates do not influence the preview, and viewing predictions does not create matches or change Elo. The feature shares its expected-result formula and complementary percentage labels with Today's Court. Extreme percentages are expressed as under 1% or over 99% rather than certainty. No migration or new environment variables are needed.

The existing workflow authorization applies: validate, open a focused PR assigned to the authenticated user, squash-merge passing code, and publish a new semantic version with changelog notes. Image/release publication does not deploy the owner's Docker host.

## Ideas still proposed

Bench mode, one-line result entry, gathering recap images, optional partnership challenges, and rematch shortcuts were brainstormed. This request implements predicted win rates; those ideas are not shipped by this release.
