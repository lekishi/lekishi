<script lang="ts">
  import { focusRing } from "./classes"

  /**
   * A historical name as RFD 2's naming policy writes it (RFD 5, `NameForm`):
   * the name in its own script first, the romanization beneath, and the
   * modern name only on request, because a modern name is an identification
   * the record makes, not what the sources called the place or person.
   *
   * The name carries its `lang` so CJK text gets the right glyph forms and is
   * read correctly. Sizes follow the type scale; a CJK name is never set below
   * `body-sm`.
   *
   * Every element is phrasing content (spans and a button), so a name can sit
   * inside a paragraph or a heading. A `<details>` toggle would close an
   * enclosing `<p>` when the prerendered HTML is parsed, and hydration would
   * then meet a different tree from the one Svelte rendered. For the same
   * reason, pass `modern` only outside interactive containers: inside a row
   * that is itself a button or link, the toggle would nest one control in
   * another. Show the bare name there and the modern name in the card.
   */
  let {
    name,
    lang,
    romanization,
    modern = [],
    size = "title-sm",
    class: className,
  }: {
    name: string
    /** BCP 47 tag of the name's script and language, such as `zh-Hant` or `ja`. */
    lang: string
    romanization?: string
    /**
     * The modern names, revealed on request. Each carries its own `lang`, since
     * a place's modern names are often in other scripts than its historical one.
     */
    modern?: readonly { form: string; lang?: string }[]
    size?: "display" | "title" | "title-sm" | "body" | "body-sm"
    class?: string
  } = $props()

  const id = $props.id()
  let showModern = $state(false)
</script>

<span class={["inline-flex min-w-0 flex-col", className]} data-name-form>
  <span
    {lang}
    class={[
      "font-serif font-semibold text-ink",
      size === "display" && "text-display",
      size === "title" && "text-title",
      size === "title-sm" && "text-title-sm",
      size === "body" && "text-body",
      size === "body-sm" && "text-body-sm",
    ]}>{name}</span
  >
  {#if romanization}
    <span class="text-caption text-ink-dim">{romanization}</span>
  {/if}
  {#if modern.length > 0}
    <span class="flex flex-col items-start text-caption text-ink-faint">
      <button
        type="button"
        aria-expanded={showModern}
        aria-controls="{id}-modern"
        onclick={() => (showModern = !showModern)}
        class={[
          // The caption line is 16 px; the overlay widens the target to 32 px
          // without moving the layout.
          "relative cursor-pointer rounded-control underline decoration-dotted underline-offset-2 after:absolute after:-inset-x-1 after:-inset-y-2 hover:text-ink-dim",
          focusRing,
        ]}>{showModern ? "Today" : modern.length > 1 ? "Modern names" : "Modern name"}</button
      >
      <span id="{id}-modern" hidden={!showModern} class="text-ink-dim"
        >{#each modern as entry, index (index)}{index > 0 ? " · " : ""}<span
            lang={entry.lang}
            dir="auto">{entry.form}</span
          >{/each}</span
      >
    </span>
  {/if}
</span>
