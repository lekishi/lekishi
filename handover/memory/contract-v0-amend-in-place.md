---
name: contract-v0-amend-in-place
description: Darwin's rule (2026-10-22) — until launch, contract changes amend v0 in place; no v1, and nothing is "sealed" without his say-so
metadata:
  type: feedback
---

On 2026-10-22 Darwin said: "Amend the rules for v0 and put conventional there as well. This project isn't live so makes no sense to bump the version because of this. Nothing is sealed unless I agree to it. All PRs changing to v1 need to amend."

**Why:** the atlas is not live; a version bump only splits chapters between two contracts.
**How to apply:**
- New vocabulary values, kinds or fields go into `historical/v0/` (schema, vectors, CONTRACTS.adoc), never a new version directory.
- The shared wording in rfd/0002/CONTRACTS.adoc (used by #56, #53, #52): "Until the atlas launches, extending a vocabulary or adding a kind amends v0 in place, because no published content depends on it yet (owner decision, 2026-10-22). After launch, it requires a new contract version."
- Don't describe the contract as sealed or frozen to Darwin; that's his call.
- Adding a vector file means updating VECTOR_FILES and the pinned total in src/lib/historical/contract/examples.test.ts.

Related: [[authoring-format-decisions-2026-10-18]], [[journeys-contract-v1]].
