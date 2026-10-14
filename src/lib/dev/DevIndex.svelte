<script lang="ts">
  import { Icon, focusRing, transition } from "$lib/ui"
  import { DEV_PAGES } from "./pages"

  /**
   * The `/dev` index. Development pages are tools for whoever changes the site
   * and are built on the dev server and pull-request previews only, so this
   * page says so before it lists them.
   */
</script>

<div class="min-h-dvh bg-abyss font-interface text-ink" data-dev-page="index">
  <main class="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10 lg:px-8">
    <header class="flex flex-col gap-2">
      <p class="text-label font-semibold uppercase text-gold">Lekishi · dev</p>
      <h1 class="font-display text-display font-semibold">Development pages</h1>
      <p class="max-w-prose text-body text-ink-dim">
        Working pages for building the site. They are built in development and on pull-request
        previews only; production never carries them.
      </p>
    </header>
    <ul class="flex flex-col gap-3">
      {#each DEV_PAGES as page (page.slug)}
        <li>
          <a
            href="/dev/{page.slug}"
            class={[
              "group flex items-center gap-4 rounded-plate border border-rule bg-lacquer px-4 py-3 no-underline hover:border-frame hover:bg-lacquer-raised",
              transition,
              focusRing,
            ]}
          >
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="font-serif text-title-sm font-semibold text-ink">{page.title}</span>
              <span class="text-body-sm text-ink-dim">{page.description}</span>
              <span class="text-caption text-ink-faint">/dev/{page.slug}</span>
            </span>
            <Icon name="chevron-right" size={18} class="text-ink-faint group-hover:text-gold" />
          </a>
        </li>
      {/each}
    </ul>
  </main>
</div>
