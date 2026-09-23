// Phoenix entry point for the application bundle.
//
// The LiveView client powers the existing Phoenix pages (theme toggle, flash,
// LiveView navigation). The atlas workspace is its own entry
// (`js/atlas/entry.ts`): the atlas page loads that entry in addition to this one,
// so this bundle never downloads Cesium, and neither entry imports the other
// (see vite.config.ts).

import "phoenix_html"
import { Socket } from "phoenix"
import { LiveSocket } from "phoenix_live_view"
import { hooks as colocatedHooks } from "phoenix-colocated/lekishi"
import topbar from "../vendor/topbar"

declare global {
  interface Window {
    liveSocket: LiveSocket
    liveReloader?: LiveReloader
  }
}

/** Payload of the LiveView client's `phx:live_reload:attached` event. */
type LiveReloader = {
  enableServerLogs(): void
  openEditorAtCaller(target: EventTarget | null): void
  openEditorAtDef(target: EventTarget | null): void
}

const csrfToken = document.querySelector("meta[name='csrf-token']")?.getAttribute("content")

const liveSocket = new LiveSocket("/live", Socket, {
  longPollFallbackMs: 2500,
  params: { _csrf_token: csrfToken },
  hooks: { ...colocatedHooks },
})

// Show progress bar on live navigation and form submits
topbar.config({ barColors: { 0: "#29d" }, shadowColor: "rgba(0, 0, 0, .3)" })
window.addEventListener("phx:page-loading-start", () => topbar.show(300))
window.addEventListener("phx:page-loading-stop", () => topbar.hide())

liveSocket.connect()
window.liveSocket = liveSocket

// The lines below enable quality of life phoenix_live_reload
// development features:
//
//     1. stream server logs to the browser console
//     2. click on elements to jump to their definitions in your code editor
//
if (import.meta.env.DEV) {
  window.addEventListener("phx:live_reload:attached", (event) => {
    const reloader = (event as CustomEvent<LiveReloader>).detail

    // Enable server log streaming to client.
    // Disable with reloader.disableServerLogs()
    reloader.enableServerLogs()

    // Open configured PLUG_EDITOR at file:line of the clicked element's HEEx component
    //
    //   * click with "c" key pressed to open at caller location
    //   * click with "d" key pressed to open at function component definition location
    let keyDown: string | null = null
    window.addEventListener("keydown", (event) => (keyDown = event.key))
    window.addEventListener("keyup", () => (keyDown = null))
    window.addEventListener(
      "click",
      (event) => {
        if (keyDown === "c") {
          event.preventDefault()
          event.stopImmediatePropagation()
          reloader.openEditorAtCaller(event.target)
        } else if (keyDown === "d") {
          event.preventDefault()
          event.stopImmediatePropagation()
          reloader.openEditorAtDef(event.target)
        }
      },
      true,
    )

    window.liveReloader = reloader
  })
}
