# Checkpoint 3 — owner rotation contract, not release acceptance

## Authority and boundaries

OWNER-UPDATE.md in the mission workspace authorizes official publication after verification. It supersedes earlier no-production instructions and the fifteen-game interpretation. This checkpoint is still development-only: no main merge, production publication, Firebase control-plane write, new production QA room or history deletion. Remaining reliability/emulator/full-game gates are not waived by passing unit tests.

## Implemented policy

- All bank-backed types, including flags and mixed classic showdown pools, share `questionRotation/{hostUid}`. There is no separate active flag-cycle selector.
- Within an eligible section, consume without replacement until every currently enabled editorial asset in that section has been consumed. Exhaustion permits considering a new cycle; it does NOT override the recent-game restriction or current-match uniqueness.
- A question consumed in g0 stays unavailable in g1 through g10. g11 is the first possible return, and only if its section cycle is exhausted. The ledger retains eleven consumed-game records (ten previous plus the current record), separately from persistent per-section cycle usage.
- First successful reservation registers the competition. Empty lobby creation and starting without a bank-backed draw do not age history. Reservation is conservative consumption: a crash before publication can leave an unseen question unavailable, not secretly recycle it. Full publication/lease recovery is still an open gate.
- Ordinary selection, classic showdown and swap cards pass the full active-bank universe, not the candidate subset after current-match filtering. Thus a narrowed pool cannot falsely declare section exhaustion.
- Editorial concept aliases include historical text hashes and image aliases. Identical image URLs remain one asset even when stems/IDs differ. Different photographs are grouped only when explicit shared concept metadata exists; there is no perceptual-image similarity claim.
- A private per-game request receipt replays the identical selected question and shuffled answer mapping for concurrent/lost-response retries. No answers are sent to a public history node. Empty acting choices are restored after RTDB prunes empty arrays.

## Non-destructive compatibility

Old questionRotation game records are preserved as `legacyGames` and their assets seed missing section cycles through `legacyAssets`. Existing unrelated fields survive. Old `flagRotation/v1/{hostUid}` is read, copied once as migration metadata, and NOT overwritten/deleted. Undated legacy flag usage is treated conservatively as a synthetic prior consumed competition, requiring ten new consumed competitions before recent-window eligibility; the current flag cycle also survives. Exact dates cannot be reconstructed from that old schema. Old binaries must be drained before release to avoid writers continuing on the old flag path. Do not roll back by clearing history or restoring an old empty database.

## Capacity and recovery — deliberately partial

Creation performs a read-only eligibility preflight using the same cycle/recent-history predicate. It discounts semantic/image siblings and rejects insufficient base-game capacity before writing a lobby. No history reservations are made by preflight. Unknown/empty bank-backed types have zero capacity; generated punishment retains its separate capacity contract. The check is conservative and does not promise availability from a future mid-game rollover.

Sections marked rotationBlocked no longer trap the other still-playable sections behind section cooldown; backend/client agree. There is no hidden repeat fallback. Player wording states both constraints and advises another section or stopping with the presenter to choose another configuration.

Still OPEN: start-time/concurrent-game revalidation, an explicit all-sections-exhausted pause/recovery UI, marking pure current-match empty-pool exhaustion as blocked, finite fair tie inventory and swap reserve, atomic match-state publication/selection leases and stale-transition recovery. The helper receipt does not make these cross-node operations atomic. A small pool that cannot sustain the ten-game restriction must be rejected/paused honestly, not silently recycled. These are mandatory release gates, not optional postrelease work.

## Identity scope and honest limits

The established series scope is the host's Firebase UID loaded from private matchAccess. `ensureAuth` restores persisted browser authentication before creating an anonymous user, supporting ordinary consecutive games on the same official origin/profile. Existing offline selection tests use separate newly created matches with the same host UID; auth tests cover restoring the persisted identity. This is not yet an emulator/browser proof of a full series. Another browser/device, private browsing or cleared auth can create a new UID and therefore a separate history. No verified account/series cross-device continuity is claimed. Unrelated hosts remain isolated; no new global history policy was introduced.

## Evidence and review

Mission evidence lives outside the repository under ../evidence. Regression-first records include rotation-cycle-red.log (early repeat at draw15), rotation-boundary-red.log (g11 incorrectly blocked by fifteen-game history), rotation-flags-empty-red.log (recent flags replayed; empty lobbies destroyed cycles), rotation-migration-red.log, rotation-mixed-red.log, rotation-retry-red.log (five reservations for one request), rotation-image-concept-red.log, rotation-legacy-quarantine-red.log, rotation-capacity-red.log, rotation-cooldown-red.log, rotation-copy-red.log and rotation-acting-receipt-red.log. Intermediate logs are retained honestly, including failed attempts; use the final full-check log for current totals.

The all-bank traversal fixture tests all ten eligible built-in types through their current editorial asset pools without replacement. Boundary, small-pool, changed/disabled/restored bank, flag migration, independent hosts, mixed showdown, concurrency, retry and no-write preflight cases run offline, not against production. Existing swap/tie tests remain, but do not constitute full finite-reserve acceptance.

requesting-code-review one-shot self-review exception applies: no independent approval, no verified commit prefix. Self-review found RTDB empty-array receipt pruning and cold-null transaction-cache starvation; both have regression tests and were corrected. A historical concurrency fixture used nonexistent type mcq; it now uses actual multiple_choice so the audience-code collision test reaches the intended transaction after strict capacity validation.

## Release order and rollback

Keep checkpoint2 preview isolation. No preview should connect to production Firebase by default. Before release: finish open gates, run real isolated emulator/rules and complete multi-role gameplay; establish exact scoped Firebase access; verify current capabilities/rules/bank and record backups/rollback manifests; drain incompatible clients/functions; deploy a compatible backend/rules/bank/frontend sequence with maintenance/capability handling; read back official domain, deployment SHA and behavior. Source success alone is not live success. OWNER-UPDATE.md must be reread at final acceptance. Production permission is already granted and must not be requested again.
