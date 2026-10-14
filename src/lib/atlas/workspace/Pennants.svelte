<script lang="ts">
  import { focusRing, transition } from "$lib/ui"
  import type { Pennant } from "../card"

  /**
   * The people of the chapter's story (RFD 1's pennants): a medallion per
   * person the events name more than once, in one row. The medallion carries
   * the name's first characters in the record's own script; the full name is
   * its label and tooltip, and is spelled out beside the medallion that is
   * pressed. Pressing one filters the events list to that person; pressing it
   * again clears the filter.
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
  <div
    role="group"
    aria-label="People in this chapter"
    class="pointer-events-auto flex items-center gap-1.5 overflow-x-auto py-0.5"
  >
    {#each people as person (person.actor.id)}
      {@const pressed = active === person.actor.id}
      <button
        type="button"
        aria-pressed={pressed}
        aria-label="{person.actor.label}, {person.events} events"
        title="{person.actor.label} · {person.events} events"
        data-testid="atlas-pennant"
        onclick={() => onToggle(pressed ? null : person.actor.id)}
        class={[
          "group inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border",
          transition,
          focusRing,
          pressed
            ? "border-gold bg-gold-tint pr-3 pl-0.5 text-gold-bright"
            : "border-frame bg-lacquer-glass p-0.5 text-ink hover:border-gold",
        ]}
      >
        <span
          aria-hidden="true"
          lang={person.actor.lang ?? undefined}
          class={[
            "inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full px-1 font-serif text-body-sm",
            pressed ? "bg-gold text-on-gold" : "bg-lacquer group-hover:text-gold-bright",
          ]}>{person.mark}</span
        >
        {#if pressed}
          <span
            aria-hidden="true"
            lang={person.actor.lang ?? undefined}
            class="font-serif text-body-sm whitespace-nowrap">{person.actor.label}</span
          >
        {/if}
      </button>
    {/each}
  </div>
{/if}
