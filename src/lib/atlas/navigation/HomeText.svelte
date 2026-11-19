<script lang="ts">
  let { text }: { text: string } = $props()
  // Keep the surrounding English in the page language. These are Han-script
  // historical forms in otherwise English titles and captions.
  const runs = $derived(text.split(/(\p{Script=Han}+)/u))
</script>

{#each runs as run, index}{#if index % 2}<span lang="lzh">{run}</span>{:else}{run}{/if}{/each}
