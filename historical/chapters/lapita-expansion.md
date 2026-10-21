# The Lapita expansion into Remote Oceania (about 1521–771 BCE)

Draft chapter, candidate #19 of the "Events up to 100 CE" list in
[Choosing Lekishi's next chapters](https://claude.ai/artifact/LRQKGU2H9qoKtyYS62t2QV).
It is the feasibility note and the scope record for the manifest
[`lapita-expansion.yaml`](lapita-expansion.yaml). Nothing here is approved; the
owner approves the manifest with `pnpm approvals`.

## Verdict

Feasible, and the first chapter with no text at all. Every event is a modelled
range of calibrated radiocarbon or U/Th dates for when an archaeological signal
begins at a site, and the scholars who model them disagree by up to two
centuries. That is the chapter's value: it tests the engine on wide,
overlapping, probabilistic windows, on places that are islands and island
groups rather than towns, and on undated arcs.

- 10 events (the expansion, 9 dated settlements and phases), 14 places, 1 actor
  (the Lapita culture), 4 obsidian arcs.
- A proposed v1 journey in
  [`historical/journeys/lapita-expansion.yaml`](../journeys/lapita-expansion.yaml)
  with the one `reconstructed_route` leg, not compiled.

## Sources and reuse

| Source | Id | Terms | Use |
|---|---|---|---|
| Petchey, Spriggs, Bedford and Valentin 2015 (JAS Reports 4) | `petchey-2015-teouma` | No reuse licence; cite-only | Teouma, and the regional summary on p. 103 that reports the other models |
| Denham, Bronk Ramsey and Specht 2012 (Archaeology in Oceania 47) | `denham-2012-lapita` | Cite-only, abstract read | Mussau, the Bismarcks, and the conflicting early dates for Vanuatu and Fiji |
| Sheppard, Chiu and Walter 2015 (JPA 6) | `sheppard-2015-santa-cruz` | Cite-only, abstract read | The crossing at about 3000 BP |
| Nunn and Petchey 2013 (JPA 4) | `nunn-petchey-2013-bourewa` | Cite-only, abstract read | Bourewa; Naigani as the earliest Fijian site |
| Burley, Weisler and Zhao 2012 (PLOS ONE 7) | `burley-2012-nukuleka` | CC BY | Nukuleka; quoted |
| Petchey 2001 (Radiocarbon 43) | `petchey-2001-mulifanua` | Cite-only, abstract read | Mulifanua's first date |
| Petchey and Kirch 2019 (PLOS ONE 14) | `petchey-kirch-2019` | CC0 | Mulifanua's revised date and the culture's span; quoted |
| Pofatu v1.4 | `pofatu` | CC BY 4.0 on the release; the repository's LICENSE file says CC BY-NC 4.0 | Site points and obsidian finds |
| GeoNames | `geonames` | CC BY 4.0 | Modern island and region points |

The cite-only articles are never quoted; their figures are paraphrased as
interpretations attributed to their authors. Quotations from the two open
articles were checked by script against the downloaded texts; Pofatu is
paraphrased, not quoted, while its terms are unresolved.
Wikidata was rate-limited for this whole pass (HTTP 429), so GeoNames and
Pofatu stand in for it.

**Pofatu needs an owner decision before approval:** its Zenodo release,
metadata and website say CC BY 4.0, but the GitHub repository's LICENSE file
says CC BY-NC 4.0. The register's rule does not adopt a source with a possible
non-commercial term by default, so the source record claims only what both
readings allow (attributed, non-commercial sharing, no quotation), and the
chapter is not ready for approval until the owner records a decision, the
maintainers resolve the LICENSE, or the Pofatu claims are replaced.

## Dates

Every range is converted from cal BP to BCE years as BCE = BP − 1949, since 0 BP
is 1950 CE and there is no year zero. Authors who give BC equivalents use BP −
1950, one year off; the records keep the authors' figures and probabilities in
`as_written`. Where models disagree, the site-based Bayesian chronologies are
the main reading and Denham et al.'s charcoal model is the conflicting one,
because Petchey et al. (2015, p. 103) argue it over-estimates the age of these
events.

| Event | Main window | Other reading |
|---|---|---|
| Lapita on Mussau | 1521–1301 BCE (Denham) | — |
| Across the Bismarcks | 1411–1291 BCE (Denham) | Early Lapita 3300–3000 BP (Summerhayes) |
| Into Remote Oceania | 1051 BCE, "around 3000 BP" (Petchey; Sheppard) | Vanuatu by 1301–1151 BCE (Denham) |
| Teouma settled | 971–921 BCE | 1251–1051 BCE, the first charcoal dates |
| Teouma cemetery | 991–771 BCE | — |
| Naigani, Fiji | 1070–914 BCE | Fiji by 1181–1061 BCE (Denham) |
| Bourewa | 888–837 BCE | — |
| Nukuleka, Tonga | 897–881 BCE | — |
| Mulifanua, Sāmoa | 1071–811 BCE (Petchey and Kirch) | 931–801 BCE (Petchey 2001) |

## Places

Sites come from Pofatu's sample coordinates; islands and groups from GeoNames.
Three places are label anchors only (`display_anchor`, unspecified precision):
the Bismarck Archipelago, Vanuatu, and Bourewa, which has no open coordinate
and is anchored on Viti Levu, where its cited title puts it.

## Evidence states the contract lacks

Proposed to the owner, not built:

1. **A modelled date.** The contract has `julian` and year precision, and
   nothing for "3470–3250 cal BP at 68.2% probability". A calibrated range
   with its probability and its BP figures, converted for the timeline but
   shown as a range, would stop these reading as documentary dates.
2. **An approximate year.** "Around 3000 BP" has to be written as the single
   year 1051 BCE, which reads more exact than the source. A circa marker, or a
   window the source states only loosely, would carry it.

## Findings for the journey proposal

The journey sketch is a population movement, not one party's voyage, and the
stops are first signals of settlement. The crossing's route runs between two
display anchors, so under the proposed drawing rules it is never drawn. Both
are noted in the file; together they suggest a separate dispersal kind with
branches.
