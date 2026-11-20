# Accounts and social login

The v1.10.0 identity foundation implements the code portion of [#14](https://github.com/injoonH/kokko/issues/14). Public signup is **off by default** until the public groups and launch work in [#15](https://github.com/injoonH/kokko/issues/15)/[#16](https://github.com/injoonH/kokko/issues/16) is ready. Publishing an image neither enables signup nor configures a provider. Real Google/Kakao callbacks must still be checked using the deployment's credentials; automated tests use synthetic providers.

## Account contract

- One PocketBase `users` record owns the profile, memberships and global singles/doubles rating. A provider is identified by `(collection, provider, providerId)`, never by nickname or email.
- Only Google and Kakao are accepted. Credential pairs independently enable their buttons. A missing Kakao configuration does not disable Google or delete existing links.
- OAuth creates a **pending member** with no profile or membership. Client-supplied `createData`, IDs, email, verification, roles and status are ignored. Direct account creation and password login remain unavailable.
- `KOKKO_PUBLIC_SIGNUP=true` enables `POST /api/kokko/onboard` with a user-chosen 1–20 character nickname. Activation and profile creation commit together. No school email, service invitation, initial rating row or group membership is required. No implicit membership in private `legacy` is granted. Retried onboarding preserves an already active account's profile and privileges.
- `KOKKO_PUBLIC_SIGNUP=false` retains the existing invitation path. Invitations always select a particular private group; they are not a public-registration requirement when the switch is enabled. Both supported providers can redeem them.
- `/account` works without a group and supports profile editing, login linking and private invitations. Until #15, its empty state explains that group discovery/creation is forthcoming. It must not fall back to private group data. `/me` returns only the current account's profile, provider **names**, current memberships, service role/status and signup switch.
- Suspended accounts cannot log in, link, onboard, edit profiles or view private data, including with an older token. Logging in never reactivates an account or changes its service/group privileges.

## Explicit linking

Open **설정 → 로그인 계정 연결** (or `/account`), then choose the other provider. The browser binds its single-use, ten-minute OAuth state and PKCE verifier to the current account ID and callback origin. Account switches/logout, expired requests, invalid state, cancellations and missing codes invalidate the flow. Callback parameters and pending state are removed even on failure; React's duplicate effect does not exchange a code twice.

The OAuth request must carry the current bearer token and explicit `kokkoMode=link`. The server requires an active account and proof of the provider identity. An identity belonging to another user or a different identity for an already linked provider is rejected. Retrying the same successful link is harmless. Linking never replaces a profile, email, verification flag, role, membership or rating. A response is saved to the browser auth store only after its account binding is rechecked.

PocketBase v0.40.5 normally falls back to matching email and can delete previous links from an unverified record. kokko deliberately replaces that submit step in `identity.go`: PocketBase still exchanges/verifies the provider code, parses verified email and handles its standard auth rules/MFA/token response. kokko transactionally resolves/creates the stable identity and account itself. Returning identities retain their account even if the provider email changes. An unlinked identity whose verified email already belongs to an account receives instructions to log in with the existing method and link explicitly. Missing/unverified emails are supported without synthetic addresses. Provider access/refresh tokens and raw metadata are not returned to JavaScript.

There is no automatic account merge or self-service unlink. The generic PocketBase external-auth delete endpoint is blocked for ordinary users so they cannot remove their only login method. Operator recovery needs a backup and deliberate identity review; do not merge by matching names/email or rewrite rating ownership.

## Provider configuration

Use the same callback for both providers:

| Environment | Origin | Redirect URI |
| --- | --- | --- |
| Local Vite | `http://localhost:5173` | `http://localhost:5173/auth/callback` |
| Production | `https://kokko.yuwol.dev` | `https://kokko.yuwol.dev/auth/callback` |
| Isolated staging | Its own HTTPS origin | That origin plus `/auth/callback` |

Use an isolated database, credentials and URL for staging. Do not enable registration or run synthetic provider/load tests against the real friends group. Secrets belong in the host's protected `.env`/secret channel, not GitHub issues, chat, screenshots or Git. Keep the persistent `PB_ENCRYPTION_KEY` unchanged.

### Google

Create a Web application client, register the exact origin/redirect URI above, and set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. Review the external audience and publishing status in Google Cloud before inviting the public. Testing mode is not open production registration; Workspace policies may independently restrict users. See [Google's production-readiness guide](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).

### Kakao

1. Create/select the service's Kakao Developers app. Enable Kakao Login and register the web origin and exact redirect URI for each environment.
2. Use its **REST API key** as `KAKAO_CLIENT_ID`, and the key's enabled **Client Secret** as `KAKAO_CLIENT_SECRET`. A JavaScript/admin/native key is not a substitute. Confirm Kakao Login is allowed for that REST key. See [Kakao prerequisites](https://developers.kakao.com/docs/en/kakaologin/prerequisite).
3. Configure consent for **Nickname (`profile_nickname`)**. The pinned provider requests only this scope, with PKCE. Email, profile-image and Kakao Talk friends/messages consent are unnecessary. Since v0.40.5 has no provider-config scopes field, the factory wrapper changes only Kakao's default scopes; review this on a PocketBase upgrade.
4. The user chooses their public nickname in kokko; a provider name is never silently published during open onboarding. Kakao's current `kakao_account.profile.nickname` and older `properties.nickname` are supported. Login also succeeds with neither nickname nor email. See [Kakao REST API](https://developers.kakao.com/docs/en/kakaologin/rest-api).
5. Restart/recreate the app with the updated environment. `/api/kokko/auth` should list `kakao` without revealing credentials. Verify the actual provider redirect, callback, fresh signup, repeat login and explicit linking on staging. Never accept mock tests as evidence of a real callback.

The application remains monochrome; Kakao's action uses its prescribed yellow brand color and an official chat symbol, following the [button design guide](https://developers.kakao.com/docs/en/kakaologin/design-guide). `kakao-symbol.svg` retains the symbol path from the [official Korean login resource](https://developers.kakao.com/tool/images/resource/preview/login-complete-ko.svg), with a tight viewBox and black fill. It is a Kakao brand asset, not original mascot artwork or the Kakao Talk icon.

## Migration, validation and recovery

`1795132800_public_identity.go` makes the users email field optional. Existing addresses, uniqueness, auth rules, identities, profile/match/rating data and privileges are retained. No replay is required. Before upgrading v1.9.0, make a backup with that image and rehearse restoration/migration on a copy. Downgrade by restoring the old archive with the matching image; an image-only downgrade cannot support accounts without email or Kakao login.

Compose passes both credential pairs and defaults `KOKKO_PUBLIC_SIGNUP` to `false`. Configure only the providers ready for the deployment. Leave the public switch off on the Pi until #15/#16 and actual callback validation are complete. The existing production deployment uses its own proxy/port configuration; add the environment keys without replacing that topology or its data volume.

Tests cover both provider payloads, missing/unverified/conflicting email, forged signup data, identity ownership/conflicts, idempotent linking/onboarding, suspensions, private-group boundaries, generic unlink protection, and a populated-data migration/backup restore. Mobile tests exercise real application redirects/code exchange against a test-only provider, nickname onboarding, group-free profile editing, linking/conflicts and cancellation. Custom onboarding is limited to ten attempts per account and sixty per server-observed IP per minute; group-invitation attempts retain their separate stricter limit. Proxy/IP configuration and public workload validation remain #16.
