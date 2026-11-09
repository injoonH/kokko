# Conversation summary — 2026-11-09

This is a dated record of the user's request and implemented scope. Consult [SPEC.md](../../SPEC.md), [HANDOFF.md](../HANDOFF.md), and the [decision record](../DECISIONS.md) for current contracts.

## User request

> Add ELO rate change prediction feature. When user inputs imaginary battle, show the win percentage and predicted ELO change.

## Implementation — v1.5.0

The [v1.5.0 release](https://github.com/injoonH/kokko/releases/tag/v1.5.0) adds **가상 대결** at `/simulate`, accessible from Home and match entry. Members can choose any active singles/doubles lineup, including teams without themselves, and see win percentages plus Elo changes for either winning or losing. Player swaps, team-side swaps, clearing a selection, and doubles rotation update the prediction.

Predictions use the current discipline's Elo, initial 1,000 ratings where needed, and the existing K = 32 rule. Each doubles teammate receives the full team change. Values retain full precision until display, with one decimal for changes and unsigned rounded zero. Entry/correction previews show the same conditional changes. Historical forms still describe playing that matchup now rather than the effect of editing past history.

The simulator keeps its choices in component state only and resets on reload or leaving. It does not access match drafts, unresolved save requests, attendance, or lineup memory; it has no match-save action. Actual records retain existing server authorization, scoring, replay, and retry behavior. No migration or new environment variables are required.

The standing project workflow applies: validate, open an assigned PR, squash-merge passing code, and publish a new semantic version. Publishing an image/release does not deploy the owner's Docker host.
