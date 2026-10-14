# Lekishi design system

The working reference for building Lekishi's interface. The decisions and their
reasons are in [RFD 5](../rfd/0005/README.adoc); this page is how to apply them.
When the two disagree, RFD 5 is right and this page is out of date.

The system has four parts, and each one is the specification for its layer:

| Part       | Where                                                                    | What it owns                                                                                      |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Tokens     | `src/app.css` (`@theme static`)                                          | Every colour, type size, family, radius, shadow, easing, duration and z-layer the interface uses. |
| Primitives | `src/lib/ui/` (`$lib/ui`)                                                | The only components that combine tokens into a look: plates, buttons, badges, fields, sheets.     |
| Reference  | `/dev/design`, rendered by `src/lib/ui/reference/DesignReference.svelte` | Every token and primitive in its states, on real chapter content. Dev and PR previews only.       |
| Guard      | `src/lib/ui/design-system.test.ts`                                       | Fails on a raw palette colour, a hex value, a default type size or an off-scale radius in `src/`. |

Open the reference while you work: `pnpm dev`, then `/dev/design`. On a pull
request, the Cloudflare Pages preview serves it at `/dev/design` too. It is one
of the `/dev` pages, the prefix for every page that is not for readers; `/dev`
lists them. Production never carries them: `scripts/dev-pages.mjs` decides,
`scripts/build-app.mjs` omits their directory before SvelteKit discovers routes,
and the build invariant checks the artifact both ways. A local
production-shaped build with the pages: `LEKISHI_DEV_PAGES=1 pnpm build`.

## Rules of thumb

1. **The scene is the page.** Chrome lives in fixed regions at the edges and
   never floats over the centre of the globe.
2. **One material, one accent.** Chrome is lacquer with a hairline gold frame.
   Gold means _current_: the selection, the playhead, the primary action, focus.
   Never use gold to decorate.
3. **Never colour alone.** Every state has a shape, a dash, a glyph or a word as
   well as a hue. A `Badge` carries a glyph and a word; an `Orb` changes its ring.
4. **The name leads.** A historical name is set in its own script first, with its
   `lang`, and the romanization follows beneath it (`NameForm`).
5. **Compose primitives; don't restyle them.** A screen picks a `variant` or
   `tone`. If no variant fits, change the primitive (and the reference), not the
   call site.
6. **Tokens only.** If a value you need is not a token, add a token in
   `src/app.css` with a comment saying what it is for, or use an existing one.

## Colour

All colours are tokens; use them as utilities (`bg-lacquer`, `text-ink-dim`,
`border-frame`) or, outside markup, as custom properties (`var(--color-gold)`).

| Role          | Tokens                                                                          | Use                                                             |
| ------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Surfaces      | `abyss`, `lacquer`, `lacquer-glass`, `lacquer-raised`                           | Page, solid chrome, chrome over the scene, hover and inputs.    |
| Lines         | `frame`, `rule`                                                                 | The gold hairline around plates; dividers inside them.          |
| Text          | `ink`, `ink-dim`, `ink-faint`                                                   | Primary, secondary, tertiary. All pass AA on lacquer.           |
| Current       | `gold`, `gold-bright`, `on-gold`, `gold-tint`                                   | Selection, playhead, primary action, focus ring, selected rows. |
| Errors        | `danger`                                                                        | The renderer failed. Never a historical state.                  |
| Evidence      | `evidence-attested`, `-identified`, `-schematic`, `-overland`, `-reconstructed` | RFD 1's visual forms. Shared by the map and the interface.      |
| Relationships | `rel-transmission`, `-diplomacy`, `-conflict`, `-trade`, `-institution`         | Relationship arcs and their legend.                             |

Contrast is measured against `lacquer`, and `/dev/design` prints each figure from
the stylesheet's own values. Keep body text at AA (4.5:1) or better. `ink-faint`
passes on `lacquer` but not on `lacquer-raised` (4.44:1), so text on a raised,
selected or hovered surface steps up to `ink-dim`. Glass lets the scene show
through, so its contrast depends on the terrain beneath: tertiary text on glass
uses `ink-dim` too (a glass `Plate` already does this for its count), and
`ink-faint` stays on solid `lacquer`.

"Possible", "disputed" and "outside the window" are **states**, not hues. They
modify whatever mark they apply to (hollow, split, dimmed) and always say so in
words.

## Typography

Three families: **Cinzel** (`font-display`) for Latin display titles only,
**Noto Serif JP** (`font-serif`) for historical names, quotations and narrative,
and **Noto Sans JP** (`font-interface`) for interface text and numbers. The
families are opt-in until each legacy screen migrates, so adding the tokens does
not change reader screens on its own. They are to be self-hosted and subset;
until that step lands, each family falls back to a system face. No font is ever
fetched from a provider.

| Utility         | Size / line   | Use                                                                       |
| --------------- | ------------- | ------------------------------------------------------------------------- |
| `text-label`    | 11 / 14, caps | Section labels, Latin only (`SectionLabel`). Never CJK, never a sentence. |
| `text-caption`  | 12 / 16       | Metadata, attribution, romanization under a name.                         |
| `text-body-sm`  | 13 / 20       | Rows, card details. The minimum for CJK.                                  |
| `text-body`     | 15 / 24       | Narrative and descriptions.                                               |
| `text-title-sm` | 17 / 24       | Event titles in rows and the card header.                                 |
| `text-title`    | 22 / 28       | Card title, place title on the scene.                                     |
| `text-display`  | 32 / 36       | Chapter title, the scene's place banner.                                  |

Nothing is set below 12 px except the Latin caps label, and no CJK below 13 px.
Dates and counts use `tabular-nums`. Always set `lang` on historical text
(`ja`, `lzh`, `zh-Hant`), so the right glyph forms are used and screen readers
read it correctly.

## Space, shape and depth

- **Space:** Tailwind's 4 px base, at steps 1, 2, 3, 4, 6, 8 and 12. Prefer
  `gap-*` on a flex or grid parent over margins on children.
- **Radius:** `rounded-control` (4 px) for buttons, inputs and badges;
  `rounded-plate` (6 px) for plates, the card and rows; `rounded-full` for orbs,
  the dial and medallions. Nothing else.
- **Depth:** two levels. `Plate tone="glass"` (glass over the scene, gold frame,
  `shadow-plate`) and `tone="solid"` or `Sheet` (lacquer, `shadow-sheet`).
- **Z-order:** a fixed ladder, `z-(--z-scene)` 0, `--z-markers` 10,
  `--z-labels` 11, `--z-chrome` 20, `--z-sheet` 30, `--z-alert` 40. Never write
  a bare z-index.

## Interaction

- **Focus:** one ring on every interactive element, on `:focus-visible` only:
  `focusRing` from `$lib/ui` (2 px `gold-bright`, 2 px offset), or
  `focusRingOnGold` on a gold fill.
- **Motion:** `transition` from `$lib/ui` for colour and opacity changes;
  durations are `duration-(--motion-fast)` 120 ms for hover and press,
  `--motion-base` 200 ms for panels and sheets, `--motion-slow` 400 ms for the
  dial; the easing is `ease-ui`. Under `prefers-reduced-motion` the durations
  are zero. Playback still advances: time is content, not decoration.
- **Targets:** controls are at least 32 px (`size="sm"`) and 36 px by default;
  layer orbs are 44 px.
- **Keyboard:** tablists rove (arrows, Home, End); search fields clear on
  Escape; sheets close on Escape and change detents from a real button.

## Icons

`Icon` is one inline SVG set on a 24 px grid with a 2 px round stroke:
utility glyphs (play, step, close, search, chevrons, list, link), the layer
glyphs (journeys, transmission, diplomacy, territory, sources) and the evidence
glyphs a `Badge` and the globe's markers share. An icon with no `label` is
decorative and hidden from assistive technology; an icon-only button takes its
name from `Button`'s `label`. Add a glyph to `ICONS` in `Icon.svelte`; the
reference shows it automatically.

## Components

Import from `$lib/ui`:

```svelte
<script lang="ts">
  import { Badge, Button, Plate } from "$lib/ui"
</script>

<Plate title="Sources" count={11}>
  <Badge kind="attested" />
  <Button variant="primary" icon="play" onclick={play}>Begin the story</Button>
</Plate>
```

| Primitive      | Use it for                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `Plate`        | Every chrome surface. `tone` glass or solid; a titled plate is a labelled region.                                   |
| `SectionLabel` | The caps heading with an optional count.                                                                            |
| `Button`       | `primary` (one per surface), `secondary`, `ghost`, `icon` (needs `label`). `href` makes a link; `busy` keeps focus. |
| `Orb`          | Layer toggles: `pressed` true, false or `"mixed"`.                                                                  |
| `Badge`        | An evidence form or a state, as glyph plus word. Kinds in `BADGES`.                                                 |
| `Tabs`         | A tablist with one panel; the panel is a snippet that receives the selected id.                                     |
| `Field`        | Search or text input with label, hint and a clear action.                                                           |
| `Sheet`        | Side panel, or bottom sheet with `peek`, `half`, `full` detents. Non-modal.                                         |
| `NameForm`     | A historical name, its romanization, and the modern name on request (`modern` never inside a button or link).       |
| `DateLine`     | A date in both calendars with its precision. Takes formatted parts; formatting is RFD 2's.                          |
| `CitationLine` | A source, its locator and reuse terms on one line; opens the quote.                                                 |
| `EmptyState`   | `uncovered` ("not yet covered") or `filtered` ("no results with these filters"). Never mix them.                    |
| `Icon`         | The glyph set.                                                                                                      |

Primitives know nothing about history or the atlas. Behaviour (what a click
selects, what the playhead does) lives in the atlas compositions in
`src/lib/atlas/workspace/`, which are built from these.

## Accessibility

- Every state has a non-colour cue, and the states the history depends on are
  in words: "disputed account", "outside the window", "not yet covered".
- Every control has an accessible name; every region has a label.
- Every interactive element shows the focus ring.
- Layouts are checked at 1440, 820, 390 and 320 px with no horizontal scroll and
  no overlapping overlays.

## Changing the system

1. **A new value:** add the token to `src/app.css` with a comment saying what
   it is for, and check it on `/dev/design` (contrast is computed there).
2. **A new primitive or variant:** add it to `src/lib/ui/`, export it from
   `index.ts`, cover its accessible behaviour in `ui.test.ts`, and add it to
   the reference in its states.
3. **A decision that changes a rule here** (a new family, a new colour role, a
   new radius): record it in RFD 5 first, then update this page.
4. **Screenshots:** capture `/dev/design` at the four widths into
   `.amp/in/artifacts/` for review when a change is visual.

### The legacy ratchet

Screens written before the tokens still use Tailwind's own palette, sizes and
radii, so the defaults are not cleared yet. `design-system.test.ts` lists those
files in `LEGACY` with their exact violation counts:

- A file **not** in `LEGACY` may not have any violation. New files never join.
- A legacy file's count must match exactly. When you remove violations, lower
  its number in the same change; at zero, delete the entry.
- Deliberate exceptions (the WebGL scene's lighting colours) are in `ALLOWED`
  with the reason.

When `LEGACY` is empty, `src/app.css` clears Tailwind's defaults
(`--color-*: initial`, `--text-*: initial`, `--radius-*: initial`) and an
off-system class stops compiling into anything at all.
