<script lang="ts">
  let { data } = $props()
</script>

<svelte:head>
  <title>Design system · Lekishi</title>
  <meta
    name="description"
    content="The Lekishi design system's tokens and primitives in every state."
  />
  <!-- A working reference on previews, not a page for readers or search. -->
  <meta name="robots" content="noindex" />
</svelte:head>

<div data-dev-route="design">
  {#if data.reference}
    <data.reference />
  {/if}
</div>
