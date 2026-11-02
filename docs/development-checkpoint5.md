# Checkpoint5 — contextual ordinary transitions, not release acceptance

OWNER-UPDATE.md remains binding: same-section exhaustion AND exclusion through ten intervening consumed competitions, earliest g11 only when both conditions permit. Empty lobbies do not age history. Scope remains the established persisted host Firebase UID; unrelated hosts are isolated. No history deletion, production probes, main merge or production publication occurred in this checkpoint. Publication is already authorized after the complete gates, not waiting for renewed consent.

## Implemented contract

Presenter passToNextTeam, advanceTurn, revealAnswer and judgeVerbal require a transition object captured from the displayed state: questionId (or null), phase, round, attemptId, revision and requestId. The attempt format matches ordinary answer attempts. The presenter UID is checked before replay or mutation. Missing/stale context fails closed. This adds another frontend/backend compatibility requirement: old clients cannot use the new presenter transition endpoints. Do not deploy this backend alone to old active rooms.

Ordinary passing now commits in a room transaction, validates question/attempt/phase/revision against the loaded snapshot and increments revision. It cannot copy an older revealed question over a replacement. Ordinary progression and end/tie decisions commit in one room transaction from current scores, preserving concurrent score corrections. Advance requires a resolved question or an explicit presenter skipUnanswered=true for the displayed unanswered question. The existing visible skip control sends that flag. Skipping does not fabricate a wrong-answer statistic, change point values, or consume another question.

Reveal/adjudication compares the exact revision/phase at commit, so an answer or assistance accepted after its read is not scored with the old snapshot. Scoring and its revision increment are atomic. The last successful ordinary presenter transition stores a bounded public receipt (SHA256 request/context/command fingerprint plus public result); concurrent identical requests and one lost-response retry return that result without repeating the action. Changing the adjudication direction or skip flag cannot reuse a receipt. Receipts are only retained for the last presenter transition, not permanent event history; later requests from old screens must refresh. No answer secret or bearer credential is stored in a receipt.

The client freezes the displayed transition and request ID for one retry. Non-swap power-card effects now check current turn, claim ownership, membership, balance, card availability and relevant time/player constraints inside a room transaction before spending. They increment revision. This is NOT client-context or immutable-receipt coverage of every card, not a crash-recoverable card lease, and not swap publication atomicity.

Start rechecks the effective history-aware eligible capacity after lobby creation and conditionally commits the lobby-to-playing transition. Ended lobbies cannot be revived and current representative membership is rechecked inside the transaction. This is a second preflight, NOT a reservation guaranteeing capacity across concurrently running competitions; host-ledger reservations and match publication still require further work.

Optional empty classic-showdown fallback preserves an explicit skip and ordinary retry receipt. Actual classic/picture showdown publication remains a separate incomplete atomicity/lease gate; ordinary transition tests do not prove it.

## Verification boundaries

Regression-first logs in mission evidence/checkpoint5-*-red.log reproduce stale pass, concurrent pass/advance, missing client context, lost-response replay, reveal/assist races, non-swap card race, start-capacity drift, start-after-end and explicit skip. Existing offline owner rotation fixtures remain unchanged. Added real RTDB transaction tests cover concurrent identical pass/advance/adjudication, immutable replay and no double-scoring. These tests supply callable auth context in-process with the REAL Admin SDK/loopback database; they are not HTTP Auth/App Check enforcement tests. Separate browser journeys use the real Auth/Functions/DB emulators and public UI.

Use the exact isolated tooling and demo project described in development-checkpoint4.md. With own loopback emulators running:

    FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 npm run test:emulators
    npm run check

The multirole Playwright sample at presenter1280/team390/TV1920 completed ordinary selection, an explicit unanswered skip, wrong-answer pass, answers, reveal, scoring, classic showdown and natural finish; ended state was read back. Same browser identity survived reload/new competition, and the next game's question avoided the preceding used IDs. Post-snapshot transport loss/recovery was repeated. This is not physical-device certification, ten production rooms, finite tied-series proof or all2/3/4-team coverage. Actual mobile screenshots still show the wallet overlapping the leave control; that UX defect remains open.

## Mandatory continuation before publication

1. Recoverable execution ownership/leases and atomic reservation-to-match/secret publication for ordinary selection, swaps and showdown. Do not solve this by exposing secrets or a broad unguarded root transaction.
2. Concurrent-series capacity reservations; pure-empty marking/all-exhausted explicit pause/recovery; finite fair tie/swap reserves; full2/3/4-team tie/retry journeys. Current start preflight does not close these gates.
3. Remaining finite editorial/content/topic-difficulty presets/refresh, quick-start/onboarding/help/privacy/accessibility, wallet overlap and actionable presenter errors. Exact unreviewed IDs remain in the existing content ledger. No new question additions or fact-check claims in this checkpoint.
4. Final capability/version/bank/rules compatibility and drain/rollback plan, actual scoped Firebase access, final review and authorized compatible publication/readback. Protected preview is not multiplayer staging. Keep state running until reachable work is exhausted; do not mark this checkpoint ready_for_owner or accepted.
