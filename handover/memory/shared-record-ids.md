---
name: shared-record-ids
description: Which region thread mints which shared place/actor/source ids (agreed between threads 2026-10-21) so global ids are written once
metadata:
  type: project
  modified: 2026-10-21T15:10:37.247Z
---

Ids are global (world-first layout), so threads agreed on 2026-10-21 who writes each shared file. Whichever PR merges second drops its same-id copy and rebases.

- **Greece and Persia** (branch claude/project-thread-dr9rbt): places athens, corinth, ephesus, miletus, sardis, persepolis, ecbatana, pasargadae, gaugamela, arbela, opis, thapsacus, cunaxa; actor persian-empire (Achaemenid); sources `pleiades` (CC BY 3.0, cites pinned to a dated dump) and `herodotus` (Macaulay 1890).
- **Mesopotamia and the Levant** (branch claude/project-thread-nuwuyp, PR #31; actual ids as pushed 2026-10-21): places under places/near-east/ incl. jerusalem, babylon, nineveh, ashur (not assur), agade (not akkad), lachish, ur, uruk, lagash, girsu, kish, nippur, mari, tuttul, ebla, sippar, larsa, isin, cutha, borsippa, dilbat, adab, mashkan-shapir, sidon, byblos, arvad, ashkelon, ashdod, ekron, pelusium, riblah, jericho, mizpah, tahpanhes, dilmun, cedar-forest, silver-mountains; actors kingdom-of-judah, neo-assyrian-empire, neo-babylonian-empire, elam, first-dynasty-of-babylon, akkadian-empire, saite-egypt, kushite-egypt; sources bible-kjv (whole Bible), luckenbill-annals-sennacherib, jewish-encyclopedia, catholic-encyclopedia, hastings-dictionary-bible, king-code-of-hammurabi, king-hall-history, king-sumer-akkad, king-legends-babylon-egypt, smith-chaldean-genesis. It does NOT mint tyre (Rome's) or susa (Greece carries it); it copies gaza and joppa from Egypt.
- **Rome and the Mediterranean**: philippi, thessalonica (Paul); reuses athens, corinth.
- **Egypt and the Nile**: memphis, thebes (Egypt), gaza, abydos-egypt.
- **Settled 2026-10-21 (Greece and Persia, draft PR #34)**: samos is Greece and Persia's (Egypt copied it). pelusium, babylon, sidon, byblos are Mesopotamia's (Greece and Persia copied babylon and pelusium). Greece and Persia carries tyre and susa at places/near-east/ and memphis at places/egypt/ for their owners to copy. Rome copies ephesus and miletus. Greece and Persia also owns kalhu (Nimrud), byzantium, trapezus, sinope, tarsus, issus, tyana, ilium, alexandria-egypt, siwa, bactra, maracanda (it dropped taxila and delphi for 玄奘's and Hannibal's); actors alexander-the-great, darius-iii, artaxerxes-ii, cyrus-the-younger, macedonian-kingdom. Ashoka mints the five Hellenistic kings, seleucid-empire and kandahar.
- Darwin dropped the unreferenced sparta, abdera and eleusis from claude/project-thread-dr9rbt in review (2026-10-21), so a later thread may mint them.
- **pleiades.yaml**: copy from the head of claude/project-thread-dr9rbt (prettier-formatted after 721388d2).
- **Tang-era East Asia** (existing: yangzhou, huangsipu, dazaifu, naniwa, heijo-palace, japan-state, tang-dynasty, kibi-no-makibi, abe-no-nakamaro):
  - 圓仁's diary thread: changan, luoyang, chuzhou, dengzhou, haizhou, qingzhou, wutaishan, taiyuan, korokan, shikanoshima; actors ennin, jang-bogo, tang-wuzong; events ennin-*.
  - Grow Tang content (branch claude/project-thread-8lbb62): yuezhou, fuzhou, hangzhou, huzhou, xuanzhou, guangzhou, jiangning, ayuwang-temple, guoqing-temple.
  - 玄奘 thread (claude/project-thread-o83o18): actor tang-taizong.
  - Tang missions network (claude/project-thread-nq1e2w): hakata, mingzhou, suzhou, heian-kyo, asuka; envoy actors incl. fujiwara-no-tsunetsugu, ono-no-takamura; events mission-<year>-*; relationships japan-tang-mission-<year>.
  - 杜環 thread (claude/project-thread-6jec9h, PR #37): places ferghana, merv, kufa, sham, fulin, molin, sri-lanka, xihai, baishi-ling, xiangzhou, xiangji-temple; actors gao-xianzhi, li-siye, dashi, abbasid-dynasty, umayyad-dynasty, karluks, uighurs, ferghana-state, shi-state, du-you; sources tongdian, zizhi-tongjian-tang, jiu-tangshu-tang-west, xin-tangshu-tang-west. Copies (never edits) changan, tongguan, guangzhou, chach, samarkand, suyab, talas verbatim from their owners.

**Why:** two files with one name under a kind fail the build.
**How to apply:** grep historical/ and this list before minting a place, actor or source. Related: [[content-layout-world-first]].

- Homophone romanizations collide (2026-10-22): #36 (圓仁, 鎮州) and #27 (鑒眞, 振州) both minted `zhenzhou`, which broke `main`'s compile after both merged. Check `historical/places/**/<id>.yaml` across *all* open PR branches, not only main, and add a disambiguator when two places share a pinyin. Fixed by PR #54, which renamed Tang's 振州 to `zhenzhou-hainan`; ennin keeps `zhenzhou`.
