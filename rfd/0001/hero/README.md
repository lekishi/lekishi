# The Tang chapter's hero

Owner-approved on 2026-10-10 ("Yup this is what I'm looking for"), against the
interactive mock published at <https://claude.ai/artifact/9iGo5aGtJUiHd1CLmHLuLZ>.
These captures are the bar RFD 1 sets for the chapter's visualization; the
served page is compared with them side by side.

| Screen            | Capture                                                 | What it fixes as the target                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diorama, the hero | `diorama-akimeya-753.jpg`                               | Tilted 3D terrain from open elevation (130 m, raised 2.2×), symbolic forest, fields, and houses placed by terrain, a schematic 遣唐使船 on the attested landfall with its dashed path, and the chrome: a date bar in both calendars, round layer orbs, a journal, pennants for the people in the story, a minimap, and a circular next-event dial that is also the playhead. |
| Phone tier        | `diorama-pixel-tier.jpg`, `diorama-pixel-phone-390.jpg` | The same diorama rendered at a quarter resolution with nearest-neighbour upscaling and an 8-level dithered palette: the first candidate for the phone's own 2D tier (RFD 1), toggled on the diorama screen.                                                                                                                                                                  |
| Region            | `region-east-china-sea.jpg`                             | Painted relief, places-first markers, the voyage as a dashed schematic through dated landfalls, the transmission arc, the story ribbon, the two-row timeline. The 2D fallback and the map the diorama sits in.                                                                                                                                                               |
| Globe             | `globe.jpg`                                             | The painted relief on a globe; chapters with counts; parchment outside the chapters' coverage.                                                                                                                                                                                                                                                                               |
| Local             | `local-heijo-kyo.jpg`                                   | Schematic 条坊 grid, temples at attested sites, glyph landmarks. To be remade in the diorama register.                                                                                                                                                                                                                                                                       |

## Rebuilding the mock

The page is `template.html` with four data URIs injected: the region basemap
and the globe texture painted by `paint.py`, and the diorama heightmap built by
`heightmap.py`. Both scripts read open data fetched at build time: Terrarium
elevation tiles (AWS Open Data, Mapzen/Nextzen terms), Natural Earth 50m and
110m coastlines, rivers, and lakes (public domain). Run the scripts with
Python 3, Pillow, and NumPy, then replace `__REGION__`, `__GLOBE__`,
`__HEIGHT__`, `__REGIONJSON__`, and `__HEIGHTJSON__` in the template.

What is real and what is symbolic is stated on every screen. Nothing in the
mock is historical content: positions come from the chapter's records or a
cited gazetteer, and the figures, buildings, and vegetation are symbols.
