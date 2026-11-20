<script lang="ts">
  import SiteFrame from "$lib/atlas/navigation/SiteFrame.svelte"
  import Places from "$lib/places/Places.svelte"
  import type { PageProps } from "./$types"

  let { data }: PageProps = $props()
</script>

<svelte:head>
  <title>Places · Lekishi</title>
  <meta
    name="description"
    content="Explore the places that connect chapters of the historical atlas."
  />
</svelte:head>

<SiteFrame current="/places">
  <main>
    <Places catalogue={data.catalogue} />
  </main>
</SiteFrame>
