<script lang="ts">
  import { Button, Icon } from "$lib/ui"

  /**
   * The arrival plate (RFD 5, "Arrival"): what a link opened, said once, at the
   * top of the scene. A link that widened the window says so, because the
   * reader's window is not the chapter's default any more; a link to a record
   * the chapter does not have says that it opened the chapter at its start
   * instead, rather than silently showing something else.
   *
   * The workspace clears it on the reader's next action, so it never stays to
   * describe a view the reader has since changed.
   */
  let {
    title,
    detail,
    tone,
    onDismiss,
  }: {
    title: string
    detail: string | null
    tone: "arrived" | "missing"
    onDismiss: () => void
  } = $props()
</script>

<div
  role="status"
  data-testid="atlas-arrival"
  class={[
    "pointer-events-auto flex max-w-md min-w-0 items-start gap-2.5 rounded-plate border bg-lacquer-glass py-2 pr-1.5 pl-3 shadow-plate backdrop-blur-md",
    tone === "missing" ? "border-ink-faint" : "border-frame",
  ]}
>
  <Icon
    name={tone === "missing" ? "outside" : "arrow-right"}
    size={16}
    class="mt-0.5 {tone === 'missing' ? 'text-ink-dim' : 'text-gold-bright'}"
  />
  <div class="min-w-0 flex-1">
    <p class="font-serif text-body-sm text-ink">{title}</p>
    {#if detail}
      <p class="text-caption text-ink-dim">{detail}</p>
    {/if}
  </div>
  <Button variant="icon" icon="close" size="sm" label="Dismiss" onclick={onDismiss} />
</div>
