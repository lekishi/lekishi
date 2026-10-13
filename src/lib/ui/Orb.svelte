<script lang="ts">
  import Icon, { type IconName } from "./Icon.svelte"
  import { focusRing, transition } from "./classes"

  /**
   * A round toggle with a glyph (RFD 5, `Orb`): the layer controls. `mixed`
   * is a layer partly shown (some of its relationships filtered out).
   *
   * The state never rests on colour: on is a heavier solid ring with a tinted
   * fill, mixed is a dashed ring, off is the hairline frame, and
   * `aria-pressed` states it for assistive technology. The label is the
   * accessible name and the tooltip; `showLabel` also prints it beneath.
   */
  let {
    icon,
    label,
    pressed = false,
    disabled = false,
    showLabel = false,
    class: className,
    onchange,
  }: {
    icon: IconName
    label: string
    pressed?: boolean | "mixed"
    disabled?: boolean
    showLabel?: boolean
    class?: string
    /** Called with the next state; a mixed orb turns fully on. */
    onchange?: (next: boolean) => void
  } = $props()
</script>

<span class={["inline-flex flex-col items-center gap-1", className]}>
  <button
    type="button"
    aria-pressed={pressed === "mixed" ? "mixed" : pressed ? "true" : "false"}
    aria-label={label}
    title={label}
    {disabled}
    onclick={() => onchange?.(pressed !== true)}
    class={[
      "inline-flex size-11 cursor-pointer items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-50",
      transition,
      focusRing,
      pressed === true && "border-2 border-gold bg-gold-tint text-gold-bright",
      pressed === "mixed" && "border-2 border-dashed border-gold bg-lacquer-glass text-gold",
      pressed === false &&
        "border border-frame bg-lacquer-glass text-ink-dim hover:bg-lacquer-raised hover:text-ink",
    ]}
  >
    <Icon name={icon} size={20} />
  </button>
  {#if showLabel}
    <span aria-hidden="true" class="text-caption text-ink-dim">{label}</span>
  {/if}
</span>
