<script lang="ts">
  /**
   * A date in both calendars with its precision (RFD 5, `DateLine`), such as
   * "753 · 天寶十二載 · 12月20日 · to the day".
   *
   * The parts arrive already formatted: RFD 2's contract owns how a date and
   * its precision are written, and this component only lays them out, so the
   * historical meaning cannot fork between surfaces. `datetime` is the
   * machine-readable form when the record has one at that precision.
   */
  let {
    year,
    calendar,
    calendarLang = "zh-Hant",
    day,
    precision,
    datetime,
    class: className,
  }: {
    /** The proleptic Julian or Gregorian year as the contract writes it. */
    year: string
    /** The regnal or era year in its own calendar. */
    calendar?: string
    calendarLang?: string
    /** Month and day in the source calendar. */
    day?: string
    precision?: string
    datetime?: string
    class?: string
  } = $props()
</script>

<time
  {datetime}
  class={["inline-flex flex-wrap items-baseline gap-x-1.5 text-body-sm text-ink", className]}
>
  <span class="font-semibold tabular-nums">{year}</span>
  {#if calendar}
    <span aria-hidden="true" class="text-ink-faint">·</span>
    <span lang={calendarLang} class="font-serif">{calendar}</span>
  {/if}
  {#if day}
    <span aria-hidden="true" class="text-ink-faint">·</span>
    <span lang={calendarLang} class="font-serif tabular-nums">{day}</span>
  {/if}
  {#if precision}
    <span class="text-caption text-ink-faint">{precision}</span>
  {/if}
</time>
