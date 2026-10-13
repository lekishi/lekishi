<script lang="ts">
  import Button from "./Button.svelte"
  import Icon from "./Icon.svelte"
  import { focusRing, transition } from "./classes"

  /**
   * A labelled text or search input (RFD 5, `Field`).
   *
   * The label is always present for assistive technology; `hideLabel` only
   * hides it visually where the surface already says what the field is for.
   * A non-empty field offers a clear button, and Escape clears a search field,
   * so emptying it never takes select-all and delete. Clearing returns focus
   * to the input.
   */
  let {
    label,
    value = $bindable(""),
    type = "search",
    hint,
    placeholder,
    hideLabel = false,
    id: givenId,
    class: className,
    oninput,
    onclear,
  }: {
    label: string
    value?: string
    type?: "search" | "text"
    hint?: string
    placeholder?: string
    hideLabel?: boolean
    id?: string
    class?: string
    oninput?: (value: string) => void
    onclear?: () => void
  } = $props()

  const generatedId = $props.id()
  const id = $derived(givenId ?? generatedId)
  let input: HTMLInputElement | undefined = $state()

  function clear() {
    value = ""
    oninput?.("")
    onclear?.()
    input?.focus()
  }
</script>

<div class={["flex flex-col gap-1.5", className]}>
  <label
    for={id}
    class={[hideLabel ? "sr-only" : "text-label font-semibold uppercase text-ink-dim"]}
  >
    {label}
  </label>
  <div class="relative flex items-center">
    {#if type === "search"}
      <Icon name="search" size={16} class="pointer-events-none absolute left-2.5 text-ink-faint" />
    {/if}
    <input
      bind:this={input}
      {id}
      {type}
      {placeholder}
      bind:value
      aria-describedby={hint ? `${id}-hint` : undefined}
      autocomplete="off"
      spellcheck="false"
      oninput={(event) => oninput?.(event.currentTarget.value)}
      onkeydown={(event) => {
        if (event.key === "Escape" && type === "search" && value !== "") {
          event.preventDefault()
          clear()
        }
      }}
      class={[
        "h-9 w-full min-w-0 rounded-control border border-rule bg-lacquer-raised font-sans text-body-sm text-ink placeholder:text-ink-faint hover:border-ink-faint focus:border-gold",
        "[&::-webkit-search-cancel-button]:appearance-none",
        transition,
        focusRing,
        type === "search" ? "pl-8" : "pl-2.5",
        value !== "" ? "pr-9" : "pr-2.5",
      ]}
    />
    {#if value !== ""}
      <Button
        variant="icon"
        icon="close"
        label="Clear {label.toLowerCase()}"
        size="sm"
        onclick={clear}
        class="absolute right-0.5"
      />
    {/if}
  </div>
  {#if hint}
    <p id="{id}-hint" class="text-caption text-ink-faint">{hint}</p>
  {/if}
</div>
