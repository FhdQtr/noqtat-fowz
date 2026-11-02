# Checkpoint 4 — real isolated emulator and reconnect evidence, NOT release acceptance

OWNER-UPDATE.md is incorporated. Production publication is already authorized after all gates; no further publication consent is required. Per-section exhaustion AND ten intervening consumed competitions remain mandatory. This checkpoint does not waive atomic match transitions, execution leases, finite fair tie/swap reserves, capacity revalidation or full release compatibility.

## Actual isolated execution

A project-local Firebase CLI 15.34.2 and SHA256-checked Temurin JRE21 were installed outside the repository under the mission tooling directory. No global package, Hermes configuration, shared Python environment, Nibras service or other profile was changed. A SHA256-checked official Node22 binary runs the Functions emulator using its configured major runtime; Vite/build/tests use Node24. Scheduled expiry is not emulated because Pub/Sub was deliberately not started.

firebase.emulators.json binds Auth9099, Database9000, Functions5001, Hub4400 and logging4500 to127.0.0.1 only. The demo-al-midan project cannot use real resources. Functions Admin initialization now uses the same demo-al-midan-default-rtdb namespace as the client and rejects a non-demo project or non-loopback DB emulator target; the production initialization is unchanged.

Reproduction (Java21+ and Node22 available; use Node24 for npm run check):

    npm ci --ignore-scripts
    npm ci --ignore-scripts --prefix functions
    npx --package=firebase-tools@15.34.2 firebase emulators:exec --config firebase.emulators.json --project demo-al-midan --only auth,database,functions 'FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 npm run test:emulators'

With these emulators already running, use a separate terminal with Node24:

    VITE_BACKEND_MODE=emulator npm run dev -- --host 127.0.0.1 --port 5190 --strictPort

Do not use these ports if occupied by another task. Never replace demo-al-midan with production to run tests. Ordinary preview/local builds remain disabled by default; no automatic staging or production Firebase access is implied.

## Rules and owner rotation evidence

Six actual RTDB rules tests (not JSON inspection) prove private-node denial, room-list denial with public issued-room viewing retained, no gameplay/custom-bank writes by ordinary players, owner-only presence and strict presence fields. Unknown fields, nested values, invalid statuses, wrong questions and invalid timestamps are rejected. awayAt uses serverTimestamp in the client; bounds permit nonnegative timestamps at most60 seconds ahead of emulator server time. Presence remains advisory, never anti-cheating proof or an automatic penalty.

Five real Admin SDK/RTDB transaction integration tests supplement, not replace, checkpoint3's fourteen offline owner cases. They verify full synthetic section traversal before reuse, g1–g10 rejection and earliestg11 reuse after exhaustion, current-match uniqueness, concurrent identical shuffled-question receipts/one reservation and different-request distinct selections, small/exhausted flags, host isolation, semantic/image aliases, empty acting-choice receipt restoration, and preservation of legacy15 and separate flag records. No test clears history; synthetic hosts are unique per run. These are tests of the selector and real persistence, not atomic publication to match state.

## Browser evidence

The mission's real Playwright harness drives localhost5190 only, with remote game-backend requests blocked and counted. Presenter1280, two independently authenticated team390 contexts and publicTV1920 join through issued UI codes. A game proceeds through eight ordinary questions, reveal/scoring/transitions, classic showdown and natural winner display. Ended status is read back through the authenticated subscription, not inferred only from clicking a button.

The same browser host identity is checked before/after reload, then across the ordinary 'new competition' UI. A second competition starts through issued-team joins and selects a question absent from the preceding game's used IDs; it is then ended through normal own-game UI with status readback. This bounded sample does NOT prove all semantic aliases/ten-game boundaries or cross-device continuity; separate offline/emulator fixtures cover the long history. No additional production rooms were created.

During a question, the player's actual RTDB transport is taken offline/online through Firebase SDK APIs. The reconnect warning appears after a successful earlier snapshot, controls recover, and gameplay continues. This is a reproducible RTDB transport-loss test, not a physical Wi-Fi/browser-suspension certification. No page/console errors or remote backend requests occurred in the final recorded sample. Physical-device acceptance remains open.

## Reconnect and timer changes

subscribeMatch observes .info/connected after initial success, restarts authenticated callable fallback on loss, reports failures after previous successful snapshots, backs off failed polls4/8/16/30 seconds with2-second healthy polling, rejects late superseded polling results, preserves warning/recovery during cached offline snapshots and cleans up both listeners/timers. Raw REST fallback with auth token in the URL was removed; callable fallback uses the same Auth/App Check and emulator routing contract as other actions. There is no claim to solve process death or host transition races.

New matches explicitly persist timerMode=advisory and the client requests it. Legacy missing settings retain advisory behavior. Strict/unknown mode requests are rejected rather than silently made advisory. No stricter answer deadline, point value, card price or showdown window was introduced. Full capability/version gating of the release is still pending.

## Review and release boundary

requesting-code-review's explicit one-shot self-review exception applies; this is NOT independent approval and commits must not use a verified prefix. Self-review added a failing test for an auth error delivered after unsubscribe and guarded that callback.

An exact-project read-only Firebase CLI request failed authentication ('have you run firebase login?'). This establishes that the available CLI cannot currently inspect/deploy this project. No password/key was requested or used, and no missing access was bypassed. It does not establish that every possible approved OAuth route is unavailable. Parent can arrange narrowly scoped legitimate access later; coding remains reachable.

Still mandatory before release: atomic contextual advance/pass/cards/selection publication and recoverable execution leases; start/concurrent-series capacity, all-exhausted pause and pure-empty marking; fair finite tie/swap reserves; full2/3/4-team tied/retry journeys; capability/version/rollback manifest and scoped Firebase access; remaining bounded content/presets/quick-start/accessibility/privacy work. The mobile gameplay sample visibly places the fixed wallet over part of the leave link; record/fix with regression evidence rather than a decorative redesign. The protected Vercel preview is not multiplayer staging. No main merge or production publication at this checkpoint.
