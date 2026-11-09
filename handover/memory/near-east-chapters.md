---
name: near-east-chapters
description: Mesopotamia and Levant draft chapters (PR #31, 2026-10-21) — which sources were reachable, the dating convention for regnal/year-name dates, and proposals sent to Darwin
metadata:
  type: project
---

On 2026-10-21 the "Mesopotamia and the Levant" thread drafted four chapters on branch claude/project-thread-nuwuyp (PR #31, merged into main 2026-10-22, still unapproved drafts): sennacherib-judah-701, nebuchadnezzar-jerusalem-597-586, hammurabi-year-names, sargon-of-akkad. Findings are in rfd/0002/NEAR_EAST_FEASIBILITY.adoc. No approvals were written.

Unreachable from the cloud container: archive.org, CDLI (both wikis), ETCSL, HathiTrust, British Museum, USCCB, Britannica. Reachable public-domain texts that worked: Gutenberg (KJV 10, King & Hall 17321, King 1910 49345, King 1918 2030, Smith 1880 60559), ISAC's Luckenbill PDF, jewishencyclopedia.com, catholic.com (Catholic Encyclopedia), the Hastings 1909 page text on students.cs.calvin.edu, and Avalon's King 1910 Code translation. Livius.org, The Bible Journey and the Louvre are cite-only.

Dating convention: the contract has no Babylonian or epoch-based regnal calendar, so the regnal day or year-name goes in `as_written` and the BCE year comes from a cited conversion. Year-named events take their reign's window. Competing chronologies are alternative claims on one `*-reign` process event. A record with any alternative or conflicting claim must also carry a `dispute`; the compiler fails otherwise.

Proposed to Darwin, not built: a tradition/legend evidence state, structured competing chronologies, a regnal calendar with an epoch, a Babylonian calendar, "about" in the notation, Hebrew font coverage, and Lachish and stele media.

**Why:** later threads would otherwise repeat the source hunt and re-derive the dating rule.
**How to apply:** reuse these sources and ids (see [[shared-record-ids]]), and check Darwin's answer on the proposals before building any of them. Related: [[chapter-selection]].
