<script lang="ts">
  // Vite's root-relative path stays valid when the production build copies the
  // route tree without `/dev` before SvelteKit discovers it.
  import "/src/app.css"

  let { children } = $props()
</script>

{@render children()}
