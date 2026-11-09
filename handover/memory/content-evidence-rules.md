---
name: content-evidence-rules
description: Darwin's corrections to the crossings records (2026-10-21) — how far a window, a role date, a participant and a supporting cite may go beyond the source
metadata:
  type: feedback
  modified: 2026-10-21T23:17:26.201Z
---

On 2026-10-21 Darwin fixed the 鑒眞 crossings records on PR #27 (commit ed04678, "keep the crossings records within what their sources say"). The rules behind the fixes:

- **Bound windows only by the source's own dated anchors.** An undated event between 天寶三載 and 天寶七載 is a window over `744..748`. Narrowing it to 744..745 from narrative feel is a guess.
- **A role date needs both ends attested.** If the death is only a window, the role carries no date, and the note says why.
- **No participant from an alternative account.** If only the conflicting source names someone (e.g. 業行 in 續日本紀), keep that as an alternative claim on `cites.participants`. Don't list them as a participant.
- **A supporting cite states exactly what it supports.** "Supports the year 748, not the month or the place."
- **A different place in a second source is a dispute.** Add a `dispute` plus an alternative cite under `cites.places`. Never quietly equate it with another place (日南 ≠ 振州 unless a source says so).

**Why:** publication is owner-gated, and Darwin reviews whether each claim stays inside its evidence.

**How to apply:** check every new record against these rules before pushing. See [[authoring-format-decisions-2026-10-18]] and [[tang-multi-story]].
