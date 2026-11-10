# Rank crests

The six original badminton crests were created for kokko with the **built-in image_gen tool**, then exported with aspect-preserving browser-canvas downscaling and WebP encoding. The rendered artwork was not retouched. Alpha transparency is preserved and checked at export.

The family uses graphite shields, brushed silver, and a central shuttlecock. Ornament increases with rank so the crests remain distinguishable in the monochrome interface: a plain shield, small fins, winged star, angular twin stars, a faceted diamond, and a crowned winged shield.

## Delivered assets

| Tier | Asset | Size |
| --- | --- | --- |
| 브론즈 | [bronze.webp](../apps/web/public/crests/bronze.webp) | 24,358 bytes |
| 실버 | [silver.webp](../apps/web/public/crests/silver.webp) | 27,910 bytes |
| 골드 | [gold.webp](../apps/web/public/crests/gold.webp) | 39,512 bytes |
| 플래티넘 | [platinum.webp](../apps/web/public/crests/platinum.webp) | 32,100 bytes |
| 다이아몬드 | [diamond.webp](../apps/web/public/crests/diamond.webp) | 36,872 bytes |
| 마스터 | [master.webp](../apps/web/public/crests/master.webp) | 44,772 bytes |

All files are 384 × 384 WebP with transparency. Combined size is **205,524 bytes** (about 201 KiB). CSS displays them at smaller sizes, with reserved dimensions to prevent layout shifts. The current player's crest loads eagerly; list crests load lazily. The tier guide loads the full family when opened.

## Generation prompts

The exact final prompt set, generation method, reference role, final file paths, and delivery settings are stored in [rank-crest-prompts.json](assets/rank-crest-prompts.json). Gold was generated first as the style anchor; each other tier was generated in a separate built-in image_gen call with that original Gold image as a style reference. The prompt set contains no credentials or workstation-specific source paths.

Tier behavior and thresholds live in [ranks.ts](../apps/web/src/lib/ranks.ts) and [SPEC.md](../SPEC.md). The images decorate server-supplied Elo; they are not a second rating model.
