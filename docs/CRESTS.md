# Rank crests

The six original badminton crests were created for kokko with the **built-in image_gen tool**. In v1.6.1, each original v1.6.0 grayscale image was supplied as its own edit target to give every tier a distinct color. The central white/silver shuttlecock, shield, and tier-specific ornament remain recognizable. Color is an intentional exception to the surrounding monochrome interface; names and distinct shapes remain visible as additional cues.

The artwork was exported with aspect-preserving browser-canvas downscaling and WebP encoding, with no post-generation visual edits. Alpha transparency is preserved and checked after encoding. Ornament increases from a plain shield to small fins, a winged star, angular twin stars, a faceted diamond, and a crowned winged shield.

## Delivered assets

| Tier | Color | Asset | Size |
| --- | --- | --- | --- |
| 브론즈 | Copper | [bronze.webp](../apps/web/public/crests/bronze.webp) | 29,196 bytes |
| 실버 | Cool steel | [silver.webp](../apps/web/public/crests/silver.webp) | 31,894 bytes |
| 골드 | Yellow gold | [gold.webp](../apps/web/public/crests/gold.webp) | 46,610 bytes |
| 플래티넘 | Emerald | [platinum.webp](../apps/web/public/crests/platinum.webp) | 38,618 bytes |
| 다이아몬드 | Blue | [diamond.webp](../apps/web/public/crests/diamond.webp) | 49,042 bytes |
| 마스터 | Violet | [master.webp](../apps/web/public/crests/master.webp) | 58,668 bytes |

All files are 384 × 384 WebP with transparency. Combined size is **254,028 bytes** (about 248 KiB). The UI displays compact crests: **64px** on Home/profile tier cards, **56px** in the guide, and **24px** beside tier names in standings. Player avatars remain the main identity image in standings. Reserved dimensions prevent layout shifts. The current player's crest loads eagerly; list crests load lazily. The tier guide loads the full family when opened.

## Generation prompts

The exact final edit prompts, original generation prompts, palette midtones, generation method, file paths, and delivery settings are stored in [rank-crest-prompts.json](assets/rank-crest-prompts.json). Each recolor was a separate built-in image_gen call with the corresponding grayscale crest as its edit target. No CLI/API fallback or client-side color filter was used. The prompt set contains no credentials or workstation-specific source paths.

Tier behavior and thresholds live in [ranks.ts](../apps/web/src/lib/ranks.ts) and [SPEC.md](../SPEC.md). The images decorate server-supplied Elo; they are not a second rating model.
