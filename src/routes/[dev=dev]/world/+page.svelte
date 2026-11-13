<script lang="ts">
  import WorldTurn from "$lib/dev/WorldTurn.svelte"

  let { data } = $props()
</script>

<svelte:head>
  <title>The world as a turn · Lekishi</title>
  <meta
    name="description"
    content="A prototype: the atlas's globe tilted like a strategy map, every chapter alive in a year at once."
  />
  <meta name="robots" content="noindex" />
</svelte:head>

<div data-dev-route="world">
  {#if data.chapters.length > 0}
    <WorldTurn chapters={data.chapters} named={data.named} reach={data.reach} />
  {/if}
</div>
