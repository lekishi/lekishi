---
name: chapter-selection
description: How new chapters are being chosen (method, ranked candidates, Wikidata findings); proposed 2026-10-21, awaiting Darwin's pick
metadata:
  type: project
  modified: 2026-10-21T14:52:16.090Z
---

On 2026-10-21 the "Finding new chapters" thread proposed a method and a ranked list in the Claude Doc "Choosing Lekishi's next chapters" (https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV). Nothing was decided yet.

Method: fill the two existing time slices (740–770 CE beside Tang, 240–210 BCE beside Qin) across the globe with journey-shaped chapters. Criteria are a followable shape (RFD 1's bar), dated and placed stops, sources under the commercial-use rule, era overlap, not only war, and engine fit (journeys before territories). Each finalist gets a half-day feasibility note like rfd/0002/TANG_MISSION_FEASIBILITY.adoc before Darwin picks, then a hero mock.

Ranked: 1) Pope Stephen II's journey to the Franks 753–754; 2) Hannibal 218–216 BCE; 3) 玄奘 629–645; 4) Ashoka's edicts; 5) 杜環's 經行記 751–762.

Checked facts: Wikidata has about 101 dated, placed non-eclipse items for 740–770 and 62 for 240–210 BCE. Both are mostly Western battles, with zero Qin items, so Wikidata serves as a lead list and gazetteer and not as an event source. Its SPARQL output gives BCE years astronomically (-0217 = 218 BCE).

RFD 1 says the next chapter comes from reader demand after Tang is public, so picking one now means amending RFD 1.

**Why:** if a later thread doesn't know this, it will repeat the survey.
**How to apply:** check the doc and Darwin's answer before proposing chapters again. See [[authoring-format-decisions-2026-10-18]].

**Update 2026-10-21 15:05:** Darwin's answer was "do all of it". That means threads for candidates 1–5 and for the three deepening tracks (Tang missions network, 圓仁, Qin six states). On top of that he wants as many chapters before 100 CE as possible, including Egypt, 周, Mesopotamia and Rome. He said "region or era first, whatever is easier". The doc now lists 31 candidates from before 100 CE. I asked the coordinator for one thread per region (A ancient China, B Qin–Han and steppe, C Mesopotamia/Levant, D Egypt/Nile, E Greece/Persia, F Rome/Med, G voyages, H Americas) so that shared places are minted once. The goal is volume of data for testing data handling and engine improvements. A dev-only /dev fixture of 696 Wikidata items before 100 CE is being built in the "Finding new chapters" thread.

**Update 2026-10-21 21:03:** PR #28 merged. It adds `/dev/wikidata` (720 Wikidata items before 100 CE, CC0, dev and previews only; refresh with `NODE_USE_ENV_PROXY=1 node scripts/dev/fetch-wikidata-ancient.mjs`). Engine findings from it that are still unfixed:
- Labels collide at density.
- Timeline ticks drop BCE after year zero ("50, 26").
- Items with an end time after 100 CE stretch the chapter strip to 2015.
- An empty story opens an empty Story tab.
