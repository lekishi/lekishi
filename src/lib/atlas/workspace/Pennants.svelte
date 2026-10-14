<script lang="ts">
  import { focusRing, transition } from "$lib/ui"
  import type { Pennant } from "../card"

  /**
   * The people of the chapter's story (RFD 1's pennants): a medallion per
   * person the events name more than once. Pressing one filters the events
   * list to that person, and pressing it again clears the filter; the
   * medallion's character is the name's first, in the record's own script,
   * and the full name is its label.
   */
  let {
    people,
    active,
    onToggle,
  }: {
    people: readonly Pennant[]
    /** The actor id the list is filtered to, or null. */
    active: string | null
    onToggle: (actorId: string | null) => void
  } = $props()
</script>

{#if people.length > 0}
  <div role="group" aria-label="People in this chapter" class="flex flex-wrap items-center gap-1.5">
    {#each people as person (person.actor.id)}
      {@const pressed = active === person.actor.id}
      <button
        type="button"
        aria-pressed={pressed}
        title="{person.actor.label} · {person.events} events"
        data-testid="atlas-pennant"
        onclick={() => onToggle(pressed ? null : person.actor.id)}
        class={[
          "group inline-flex h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-full border pr-2.5 pl-0.5",
          transition,
          focusRing,
          pressed
            ? "border-gold bg-gold-tint text-gold-bright"
            : "border-frame bg-lacquer-glass text-ink-dim hover:bg-lacquer-raised hover:text-ink",
        ]}
      >
        <span
          aria-hidden="true"
          lang={person.actor.lang ?? undefined}
          class={[
            "inline-flex size-7 shrink-0 items-center justify-center rounded-full border font-serif text-body-sm",
            pressed ? "border-gold bg-gold text-on-gold" : "border-rule bg-lacquer text-ink",
          ]}>{person.mark}</span
        >
        <span lang={person.actor.lang ?? undefined} class="truncate font-serif text-body-sm"
          >{person.actor.label}</span
        >
        <span class="sr-only">, {person.events} events{pressed ? ", filtering the list" : ""}</span>
      </button>
    {/each}
  </div>
{/if}
