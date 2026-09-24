<script lang="ts">
  import { page } from "$app/state"

  let { status, error }: { status: number; error: { message: string } | null } = $props()
</script>

<svelte:head>
  <title>{status} · Lekishi</title>
</svelte:head>

<div
  class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-950 px-6 text-center"
>
  <p class="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">{status}</p>
  <h1 class="text-2xl font-semibold text-white">
    {status === 404 ? "This page is not part of the atlas" : "Something went wrong"}
  </h1>
  <p class="max-w-md text-sm leading-relaxed text-slate-400">
    {error?.message ?? "The requested page could not be rendered."}
  </p>
  <p class="text-xs text-slate-500">{page.url.pathname}</p>
  <a
    href="/atlas"
    class="mt-2 rounded-xl border border-amber-300/70 bg-amber-300/15 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/25"
  >
    Open the atlas
  </a>
</div>
