# One Smile Sprint Plan v2 — Aligned to Mila's Refinement

Replaces the draft-editing flow with direct Approve/Reject buttons.
Sprint 0 unblocks Mila's retest; Sprint 1 is simpler; Sprint 2 deferred.

---

## Sprint 0 — Blockers (do first, unblocks Mila retest)

### 0.7 Duplicate sends
- Diagnose via Twilio debugger: inbound webhook hit twice per MessageSid,
  or outbound firing twice?
- Fix root: (a) return webhook fast — move AI ack generation off the
  synchronous response path (slow Haiku → Twilio retry). Use waitUntil
  or respond-then-process pattern. (b) Idempotency: skip if MessageSid
  already processed. (c) Dedup guard on send path.
- Foundation for Sprint 2's waitUntil pattern — build right, reuse later.

### 0.8 Photo loop
- Prompt must check conversation for existing media_urls before asking
  for a photo. State must leave ask_for_photo the moment a photo lands.
- Once state = awaiting_candidacy_decision, AI never re-asks for photo.
- Dependency: photo-first state machine (shared with Sprint 1 item 4).

### 0.9 Resolve action
- Verify Resolve button exists in Live Inbox, surface for Mila.
- Must set status='resolved' with resolution_reason.
- Reject flow (Sprint 1) depends on resolution_reason field existing.

---

## Sprint 1 — Refined (simpler; builds on Sprint 0)

### 4. Photo-first state machine
Mila's full diagram:
- text → ask_for_photo
- photo → awaiting_candidacy_decision
- approve → collecting_contact_info
- reject → resolved
- capture → handed_off_to_human

Subsumes 0.8 work. conversations.candidacy_state CHECK must be expanded
to include these states.

### 5. Approve/Reject buttons
Visible when photo present + state = awaiting_candidacy_decision.
Trigger templated sends directly — NO draft, NO edit flow.

- **Approve** → send the locked Approve template (pull exact current
  accepted-candidate wording from config — Mila confirmed she likes it;
  don't regenerate) → state = collecting_contact_info
- **Reject** → send VERBATIM, character-for-character:
  `Unfortunately, you're not a good candidate.`
  Nothing appended → auto-resolve with resolution_reason='rejected'

### 6. Post-reject silence
AI handler guard: if status='resolved' AND resolution_reason='rejected',
generate no response. Mila handles "why" questions manually.

### 7. Contact capture (name + phone only, no email)
Conversational two-step:
1. "Great! Can I get your full name?"
2. "Got it. What's the best phone number to reach you at?"
   (pre-confirm SMS sender number; allow different one)
3. "Thanks. Our team will call you to schedule. Talk soon!"

Upsert existing contact/lead — don't create duplicate.
Set tag='approved_candidate', move to handed_off_to_human, AI stops.

---

## Sprint 2 — Vision (deferred, decisions locked)

Vision doesn't remove Mila's click — it pre-selects which button she'd
press. Classifier returns { route, confidence }, system renders her
verbatim template.

Settled decisions:
- Runs under waitUntil (reuses 0.7 fast-ACK foundation) + idempotency
- Minor check from contact data, never inferred from photo
- Confirm media_urls[0] is bucket-relative before createSignedUrl;
  transcode HEIC
- Signed-URL feed, candidacy_confidence in metadata
- Escalate split: reask-photo vs flag-Mila-no-draft
- Tier-label vs literal model ID in candidacy_model — recommendation
  stands (abstracted tier name, Sonnet underneath)

---

## Sequencing

Sprint 0 (0.7 + 0.8 + 0.9): ships first, unblocks Mila retest
Sprint 1 (4 + 5 + 6 + 7): builds on Sprint 0 state machine
Sprint 2: after Sprint 1 verified live

Beta-ready target: inside original 5-day estimate if Sprint 0 ships
tomorrow.

## Key architectural change from v1

The pending_approval draft + approval-bar edit flow is REPLACED by:
- Direct Approve/Reject buttons (no draft row, no edit textarea)
- Templated sends (locked wording, no AI generation in the send path)
- The existing candidacy-approve.js endpoint sends the template directly

Remove: draft insert at gate-trip, pending_approval status usage in
candidacy flow, approval bar textarea. Keep: the gate trigger, state
machine, AI suppression, leak guard (on any future AI-generated text).
