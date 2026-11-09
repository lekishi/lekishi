---
name: journey-records
description: Journey records are part of contract v0 (no v1); PR #53 layout, rules and gotchas for historical/journeys
metadata:
  type: project
  modified: 2026-10-22T20:38:40.573Z
---

Darwin chose "Build it as proposed" for the journey record on 2026-10-22. On the same day Darwin ruled there is no contract v1: until the atlas launches, adding a kind or extending a vocabulary amends v0 in place ("Nothing is sealed unless I agree to it"). PR #53 (merged 2026-10-22 23:50 UTC) built journeys that way, next to #59's territory kind:

- The journey kind lives in `historical/v0/schema` (record_id pattern, kind enum, `journey_content`/`journey_stop` in kinds.schema.json). Its 21 vectors are in `historical/v0/vectors/journeys.json`. `examples.test.ts` VECTOR_FILES pins each file's count plus the total, so every PR adding vectors bumps that total and conflicts trivially with the others.
- The versioning sentence in rfd/0002/CONTRACTS.adoc (lines 16–17) is shared by #52, #53 and #56; keep it byte-identical.
- Authoring: `historical/journeys/**` with `historical/schema/journey.schema.json`. A stop is an event id or `{event, place?, by?, driven?, toward?, cite?}`. `route:` is decided but NOT built yet (the schema rejects it).
- A leg is drawn only between two located stops (no display-anchor/unknown places); `driven` legs are dotted; `toward` shows on the card only.
- Tang includes jianzhen-to-nara-753, kibi-no-makibi-753, fujiwara-no-kiyokawa-753 plus a new event huangsipu-departure-753, which makes Tang's approval stale until Darwin re-approves.
- Curated (hand-written) journeys remain only for komaro-embassy and hanfei-embassy.
- Every file in historical/journeys/ is compiled and contract-checked by compile.test.ts, even when no chapter includes it, so a malformed draft journey breaks the tests (e.g. `sources:` needs 2+ entries; use inline source/at for one).
- Journey ids may equal event ids (hanno-voyage, pliny-india-route): an `include` then writes `journey:<id>` (the reference pattern allows it since #53).
- #33's Lapita and Pliny journey sketches don't fit the decided record (population movement + route:, no travellers); #53 moved them to rfd/0002/journey-counterexamples/ (not compiled). Hanno's stays in historical/journeys/.
- Adding a Tang event changes hard-coded e2e counts (TANG_WINDOW_EVENTS in e2e/atlas.spec.ts, "N + 5 coda" and "Story 7 of N" in e2e/chapters.spec.ts).

**Why:** the project isn't live, so Darwin sees no reason to bump the contract version.
**How to apply:** put new kinds and vocabulary in `historical/v0/`, never a new version folder, and amend the RFD wording that says "v1". Related: [[tang-multi-story]], [[voyage-chapters]].
