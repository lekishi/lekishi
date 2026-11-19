<script lang="ts">
  import WorldTurn from "$lib/dev/WorldTurn.svelte"

  let { data } = $props()
</script>

<svelte:head>
  <title>The world as a turn · Lekishi</title>
  <meta
    name="description"
    content="Follow the atlas's chapters across the globe, one turn a year from 750 to 762."
  />
</svelte:head>

<main aria-label="World campaign board">
  {#if data.chapters.length > 0}
    <WorldTurn chapters={data.chapters} named={data.named} reach={data.reach} />
  {:else}
    <div class="bg-abyss p-6 text-ink">
      <a href="/">Lekishi home</a>
      <h1 class="mt-4 font-display text-title">World</h1>
      <p class="mt-2 text-body text-ink-dim">No chapters are available for these turns yet.</p>
    </div>
  {/if}
</main>
