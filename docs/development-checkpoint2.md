# Al-Midan development checkpoint 2 — NOT production-ready

This branch is under active development. No owner production approval or Firebase control-plane write is implied. Do not merge or deploy functions/rules yet.

## Preview/data isolation

- Local development and non-official preview origins default to `disabled`: setup can be inspected, but game authentication/actions reject with an explicit Arabic preview message. No production backend is silently used.
- Only production builds on exactly `qtrgame.net` or `www.qtrgame.net` select the existing production Firebase project. This is deployment routing, NOT a replacement for backend authorization.
- `VITE_BACKEND_MODE=emulator npm run dev` opts into local loopback emulators with project `demo-al-midan`: Authentication9099, Database9000, Functions5001. All three client SDKs are connected. Emulator end-to-end execution is NOT yet verified; a working isolated Firebase CLI/Java/emulator suite remains a release gate. Query-string `?emu=1` is no longer the configuration contract.
- Separate hosted staging is not configured. Keep preview protection enabled. A disabled-backend preview is not a played multiplayer match or proof of deployed backend fixes.

## Compatibility and rollback gate

Frontend ordinary answers now require `questionId`, `attemptId`, `revision`, `requestId`. Old clients/backend versions are not an approved mixed release. Remaining transition contracts and an explicit capabilities gate are still pending. Vercel frontend publication does not deploy Firebase functions, rules or the bank.

Before any separately authorized production release:

1. Record exact frontend commit, function source+dependency lock hashes, rules hash and bank revision in a release manifest; read the deployed Firebase versions through appropriately scoped access.
2. Run full check and real Firebase emulator/rules suite, including concurrent joins, stale transitions, tie/exhaustion and recovery. Current VM tests are not emulator evidence.
3. Use coordinated maintenance/version gating to avoid old clients sending context-free answers. Deploy only to an approved isolated test target first and read back the exact target.
4. Obtain owner publication approval, then deploy approved functions/rules/bank and matching frontend as a coordinated release. Do not copy generic README deployment commands into an unattended production shell.
5. Keep the previously approved matching frontend/functions/rules/bank artifact set. Roll back as a matching set after checking room compatibility; do not revert only the frontend while strict backend contracts remain. No rollback or live data deletion is authorized by this document.

## Corrective game decisions

- Public four-character audience code remains view-only. Only the presenter or a viewer holding the issued keyed TV link can enumerate invitations. Public TV lobby explains how to request a team invitation; it does not spin forever waiting for private QR data.
- Team reservations enforce lobby status and capacity atomically. The private UID mapping is finalized after a committed public reservation; a deterministic room-scoped opaque player ID permits a retry to repair a lost mapping. Legacy membership still resolves through existing access mappings. This is not a general claim-lease redesign.
- Assistance and timed memory-prompt reveal recheck question and revision in a match transaction. Public TV can still trigger the deterministic prompt reveal after its server deadline; this grants no team membership or early answer disclosure.
- A tied deciding cycle resets section cooldown and grants one extra section-cap unit. Existing scoring counts/card economy remain unchanged. This fixes the demonstrated cap deadlock when fresh questions exist; it does NOT reserve real bank inventory, solve cross-match exhaustion or bound indefinite repeated ties. Those gates remain open.

## Controlled editorial refresh

Never bulk-delete a live custom bank. For each small batch: retrieve primary public sources; archive passages in the mission evidence; record ID, exact answer, source URL, evidence quote, concept family, Arabic ambiguity rationale and reviewer. Add a failing regression before inserting items. Check normalized options, ID uniqueness, source-to-answer mapping, counts, bank revision, selection and history migration. Only then publish a reviewed source batch through an approved release.

`src/data/editorialSportsBatch1.json` records four original Arabic questions (410001–410004) from two Olympics.com articles. Difficulty is an editorial estimate, NOT measured performance. Two conservative event families prevent four closely related facts from masquerading as four independent anti-repeat assets. No source image was copied. These are a modest first batch, not a comprehensive expansion.

`conceptId` adds editorial paraphrase grouping while retaining aliases of historic text hashes. Existing history is read compatibly rather than reset. Initial legacy groups:62/899 and826/839. New sports events form two further groups. Custom questions retain lexical fallback; cross-device identity/history and safe exhaustion handling still need work. No all-bank manual fact-check is claimed.

## Verification boundary

One-shot self-review exception applies: there is no independent reviewer approval. Full actual test results, RED/GREEN logs, browser screenshots, exact remaining gates and version handles are maintained outside the checkout in the mission `evidence/`, `acceptance.md`, `state.json`, and `final-report.md`.
