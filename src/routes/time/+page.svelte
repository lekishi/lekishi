<script lang="ts">
  import SiteFrame from "$lib/atlas/navigation/SiteFrame.svelte"
  import RegionTimeline from "$lib/dev/RegionTimeline.svelte"

  let { data } = $props()
</script>

<svelte:head>
  <title>Regions in time · Lekishi</title>
  <meta
    name="description"
    content="Compare chapters by region and year, and see where their stories meet."
  />
</svelte:head>

<SiteFrame current="/time" viewport>
  <main class="h-full">
    {#if data.chapters.length > 0}
      <RegionTimeline chapters={data.chapters} threads={data.threads} />
    {:else}
      <h1 class="px-4 py-6 font-display text-title">Regions in time</h1>
      <p class="px-4 text-body text-ink-dim">No chapters are available yet.</p>
    {/if}
  </main>
</SiteFrame>
