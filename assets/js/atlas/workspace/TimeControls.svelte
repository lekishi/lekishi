<script lang="ts">
  import type { TimeWindow } from "../domain"

  let {
    timeWindow,
    playhead,
    playing,
    onWindowChange,
    onPlayheadChange,
    onStep,
    onTogglePlaying,
  }: {
    timeWindow: TimeWindow
    playhead: number
    playing: boolean
    onWindowChange: (window: TimeWindow) => void
    onPlayheadChange: (year: number) => void
    onStep: (direction: 1 | -1) => void
    onTogglePlaying: () => void
  } = $props()

  function updateWindow(field: "start" | "end", value: string) {
    const year = Number.parseInt(value, 10)

    if (Number.isNaN(year)) {
      return
    }

    onWindowChange({ ...timeWindow, [field]: year })
  }
</script>

<div
  class="pointer-events-auto flex max-w-full flex-col gap-2 rounded-2xl border border-slate-700/70 bg-slate-950/80 px-3 py-2.5 shadow-xl shadow-slate-950/40 backdrop-blur sm:gap-3 sm:px-4 sm:py-3"
  data-testid="atlas-time-controls"
>
  <div class="flex items-end gap-2 sm:gap-3">
    <label class="flex flex-col gap-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
      Window start
      <input
        id="atlas-window-start"
        type="number"
        value={timeWindow.start}
        step="1"
        oninput={(event) => updateWindow("start", (event.currentTarget as HTMLInputElement).value)}
        class="w-16 rounded-lg border border-slate-700 sm:w-24 bg-slate-900 px-2 py-1 text-sm font-medium tabular-nums text-slate-100 focus:border-amber-300 focus:outline-none"
      />
    </label>

    <label class="flex flex-col gap-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
      Window end
      <input
        id="atlas-window-end"
        type="number"
        value={timeWindow.end}
        step="1"
        oninput={(event) => updateWindow("end", (event.currentTarget as HTMLInputElement).value)}
        class="w-16 rounded-lg border border-slate-700 sm:w-24 bg-slate-900 px-2 py-1 text-sm font-medium tabular-nums text-slate-100 focus:border-amber-300 focus:outline-none"
      />
    </label>

    <div class="flex items-center gap-1 pb-0.5">
      <button
        id="atlas-step-back"
        type="button"
        onclick={() => onStep(-1)}
        class="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
        aria-label="Step back to the previous event in the window"
      >
        ←
      </button>
      <button
        id="atlas-play-toggle"
        type="button"
        onclick={onTogglePlaying}
        aria-pressed={playing}
        class={[
          "rounded-lg border px-3 py-1.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300",
          playing
            ? "border-emerald-300/70 bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/25"
            : "border-amber-300/70 bg-amber-300/15 text-amber-100 hover:bg-amber-300/25",
        ]}
      >
        {playing ? "Pause" : "Play"}
      </button>
      <button
        id="atlas-step-forward"
        type="button"
        onclick={() => onStep(1)}
        class="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
        aria-label="Step forward to the next event in the window"
      >
        →
      </button>
    </div>
  </div>

  <div class="flex items-center gap-2 sm:gap-3">
    <label class="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400" for="atlas-playhead">
      Playhead
    </label>
    <input
      id="atlas-playhead"
      type="range"
      min={timeWindow.start}
      max={timeWindow.end}
      step="1"
      value={playhead}
      oninput={(event) => onPlayheadChange(Number.parseFloat((event.currentTarget as HTMLInputElement).value))}
      class="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
    />
    <output
      id="atlas-playhead-value"
      class="w-16 rounded-md bg-slate-900 px-2 py-0.5 text-right text-sm font-semibold tabular-nums text-amber-200"
    >
      {Math.round(playhead)}
    </output>
  </div>
</div>
