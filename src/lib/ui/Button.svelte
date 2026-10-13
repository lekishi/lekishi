<script lang="ts">
  import type { Snippet } from "svelte"
  import Icon, { type IconName } from "./Icon.svelte"
  import { focusRing, focusRingOnGold, transition } from "./classes"

  /**
   * The one button (RFD 5, `Button`). `primary` is the gold fill and is kept
   * for the single current action on a surface; `secondary` is framed lacquer;
   * `ghost` is text on the plate; `icon` is a square glyph button that must
   * carry an accessible `label`. With an `href` it renders a link, so
   * navigation stays a real link in the prerendered HTML.
   *
   * `busy` keeps the button in place and focusable but inert, and says so with
   * `aria-busy`, so a slow action never moves focus or the layout.
   */
  type Common = {
    href?: string
    type?: "button" | "submit"
    disabled?: boolean
    busy?: boolean
    /** `sm` is for dense rows and controls inside a field. */
    size?: "md" | "sm"
    id?: string
    class?: string
    onclick?: (event: MouseEvent) => void
    "aria-controls"?: string
    "aria-expanded"?: boolean
    "data-testid"?: string
  }

  type Props = Common &
    (
      | { variant: "icon"; icon: IconName; label: string; children?: undefined }
      | {
          variant?: "primary" | "secondary" | "ghost"
          icon?: IconName
          label?: undefined
          children: Snippet
        }
    )

  let {
    variant = "secondary",
    icon,
    label,
    href,
    type = "button",
    disabled = false,
    busy = false,
    size = "md",
    class: className,
    onclick,
    children,
    ...rest
  }: Props = $props()

  const inert = $derived(disabled || busy)

  function click(event: MouseEvent) {
    // A disabled link has no `disabled` attribute to stop it, and a busy
    // button stays enabled so it keeps focus; both are stopped here.
    if (inert) {
      event.preventDefault()
      return
    }
    onclick?.(event)
  }
</script>

<svelte:element
  this={href ? "a" : "button"}
  {...rest}
  href={href && !disabled ? href : undefined}
  type={href ? undefined : type}
  disabled={!href && disabled ? true : undefined}
  aria-disabled={href && disabled ? "true" : undefined}
  aria-busy={busy ? "true" : undefined}
  aria-label={variant === "icon" ? label : undefined}
  title={variant === "icon" ? label : undefined}
  data-variant={variant}
  onclick={click}
  class={[
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control font-sans text-body-sm font-semibold no-underline select-none",
    transition,
    variant === "primary" ? focusRingOnGold : focusRing,
    variant === "icon"
      ? size === "sm"
        ? "size-8"
        : "size-9"
      : size === "sm"
        ? "h-8 px-2.5"
        : "h-9 px-3",
    variant === "primary" && "bg-gold text-on-gold hover:bg-gold-bright active:bg-gold",
    variant === "secondary" &&
      "border border-frame bg-lacquer-glass text-ink hover:border-gold hover:bg-lacquer-raised active:bg-lacquer",
    (variant === "ghost" || variant === "icon") &&
      "text-ink-dim hover:bg-lacquer-raised hover:text-ink active:bg-lacquer",
    busy ? "cursor-progress" : disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
    className,
  ]}
>
  {#if busy}
    <span
      aria-hidden="true"
      data-testid="button-busy"
      class="size-3.5 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
    ></span>
  {:else if icon}
    <Icon name={icon} size={variant === "icon" && size === "md" ? 18 : 16} />
  {/if}
  {#if children}
    {@render children()}
  {/if}
</svelte:element>
