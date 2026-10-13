/**
 * The design system's primitives (RFD 5, "Components"; the working reference
 * is `docs/design-system.md`). They know nothing about history or the atlas:
 * atlas compositions in `$lib/atlas/workspace/` combine them and own the
 * behaviour. This is the only place raw tokens are combined into a look.
 */
export { default as Badge, BADGES, type BadgeKind } from "./Badge.svelte"
export { default as Button } from "./Button.svelte"
export { default as CitationLine } from "./CitationLine.svelte"
export { default as DateLine } from "./DateLine.svelte"
export { default as EmptyState, EMPTY_STATES, type EmptyKind } from "./EmptyState.svelte"
export { default as Field } from "./Field.svelte"
export { default as Icon, ICONS, type IconName } from "./Icon.svelte"
export { default as NameForm } from "./NameForm.svelte"
export { default as Orb } from "./Orb.svelte"
export { default as Plate } from "./Plate.svelte"
export { default as SectionLabel } from "./SectionLabel.svelte"
export { default as Sheet, DETENTS, type Detent } from "./Sheet.svelte"
export { default as Tabs } from "./Tabs.svelte"
export { focusRing, focusRingOnGold, transition } from "./classes"
