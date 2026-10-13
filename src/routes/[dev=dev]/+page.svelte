<script lang="ts">
  let { data } = $props()
</script>

<svelte:head>
  <title>Development pages · Lekishi</title>
  <meta name="description" content="Working pages for building Lekishi, on previews only." />
  <!-- Working pages on previews, not pages for readers or search. -->
  <meta name="robots" content="noindex" />
</svelte:head>

{#if data.index}
  <data.index />
{/if}
