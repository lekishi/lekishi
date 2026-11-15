<script lang="ts">
  import RegionTimeline from "$lib/dev/RegionTimeline.svelte"

  let { data } = $props()
</script>

<svelte:head>
  <title>Regions in time · Lekishi</title>
  <meta
    name="description"
    content="A prototype: every chapter in its region's row, time left to right, so chapters of the same years line up."
  />
  <meta name="robots" content="noindex" />
</svelte:head>

<div data-dev-route="timeline">
  {#if data.chapters.length > 0}
    <RegionTimeline chapters={data.chapters} threads={data.threads} />
  {/if}
</div>
