# November 22, 2026

The owner asked how to configure Kakao Login on the Pi, requested a square icon based on the Kokko mascot, and configured optional nickname consent. The owner confirmed a real Kakao callback worked and reported that signing in directly had started a separate signup. The Pi still had public signup disabled, and a read-only check verified the unfinished signup had no profile or membership.

[v2.0.1](https://github.com/injoonH/kokko/releases/tag/v2.0.1) lets an existing member sign in with the original provider and complete **설정 → 로그인 계정 연결** to recover a second provider from an unfinished signup. The link requires proof of both accounts through the usual sign-in and linking flows. It discards the unused signup only after moving the verified login and preserves the original account and game data. Active and suspended accounts cannot be combined through this flow.

[Issue #14](https://github.com/injoonH/kokko/issues/14) tracks the remaining live provider checks and the deployment receipt. The successful Kakao callback does not verify open registration, which remains gated while [#16](https://github.com/injoonH/kokko/issues/16) is in progress.
