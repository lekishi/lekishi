# 玄奘's journey to India, 629–645

The manifest is [`xuanzang-journey-629-645.yaml`](xuanzang-journey-629-645.yaml),
a **draft** with no approval block. Dev and pull-request previews serve it, and
production builds do not. What the sources support, the editorial choices, and the
follow-ups are in
[`rfd/0002/XUANZANG_JOURNEY_FEASIBILITY.adoc`](../../rfd/0002/XUANZANG_JOURNEY_FEASIBILITY.adoc).

## Coverage model

- **Primary window 629–645**, from the departure from 長安 to the audience at
  洛陽 and the start of the translation work at 弘福寺.
- **Two coda steps**: the 大唐西域記 presented in 646 and 玄奘's death in 664.
  Both are labelled in their captions.
- **Step order is the biography's narrative order.** It is presentation order,
  not a dated sequence.

## Inventory

| Kind | Count | Folder | Notes |
| --- | --- | --- | --- |
| Places | 77 | `places/xuanzang/` | 53 with a Wikidata display anchor, 24 with an `unknown` position. 長安 and 洛陽 are the shared records in `places/ennin/`. |
| Actors | 16 | `actors/xuanzang/` | 玄奘, the emperor 太宗, the kings 麴文泰, 戒日王 and 鳩摩羅王, the 葉護可汗, the teachers 戒賢, 勝軍, 般若羯羅 and 僧稱, and the officials and guides on the way. |
| Events | 98 | `events/xuanzang/` | One per stop or incident. Each has exactly one `site` place. |
| Relationships | 9 | `relationships/xuanzang/` | Travel, the 高昌 brotherhood and letters, three teachings, two royal patronages, the audience, and the transmission of the texts. |
| Sources | 3 | `sources/` | `cien-zhuan`, `xiyu-ji` and `jiu-tangshu-fangji`, plus `wikidata`. |

## Evidence and uncertainty

- Every name, date and position carries a cited claim. Each quotation was
  checked against the transcription it was taken from.
- **91 of the 98 events carry an editorial window.** The window is reckoned from
  the stays the biography states, and its notes say so. Only the departure,
  the 645 return, the 646 presentation and the 664 death carry a source date.
- **Two disputes** are recorded and not merged: the departure month (八月,
  四月 or 貞觀初) and the death year (664 or 661).
- **No route is drawn.** Display anchors are label positions only, and 24
  places have no position at all.
- Wonders, dreams and the desert deity belong to the biography's devotional
  frame. The records report movements, meetings, teachings and gifts, not
  miracles.

## Regenerating

These records were written from a spec of quotations, ids and windows. They are
reviewed and edited as ordinary record files. Nothing regenerates them at build
time.
