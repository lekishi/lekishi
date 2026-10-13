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
   */
  let {
    name,
    lang,
    romanization,
    modern,
    modernLang,
    size = "title-sm",
    class: className,
  }: {
    name: string
    /** BCP 47 tag of the name's script and language, such as `zh-Hant` or `ja`. */
    lang: string
    romanization?: string
    /** The modern name, revealed on request. */
    modern?: string
    modernLang?: string
    size?: "display" | "title" | "title-sm" | "body" | "body-sm"
    class?: string
  } = $props()
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
  {#if modern}
    <details class="group text-caption text-ink-faint">
      <summary
        class={[
          "w-fit cursor-pointer list-none rounded-control underline decoration-dotted underline-offset-2 hover:text-ink-dim [&::-webkit-details-marker]:hidden",
          focusRing,
        ]}
      >
        <span class="group-open:hidden">Modern name</span>
        <span class="hidden group-open:inline">Today</span>
      </summary>
      <span lang={modernLang} class="text-ink-dim">{modern}</span>
    </details>
  {/if}
</span>
