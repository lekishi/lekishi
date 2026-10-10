// Drives one globe spike through the shared API and writes stills, the flight
// video, and stats to spikes/renderer/globe/out/<spike>/.
// Usage: node spikes/renderer/globe/capture.mjs <cesium|tilesjs|custom> [baseURL]
//
// Every frame waits for the engine to report its tiles settled (capped), so the
// pictures show what each engine draws once data has arrived; the stats record
// how often the cap was hit. Videos are assembled frame by frame because
// real-time recording loses the motion on the container's software GPU.
import { chromium } from "@playwright/test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { join } from "node:path"
const spike = process.argv[2]; if (!spike) { console.error("usage: capture.mjs <spike>"); process.exit(1) }
const base = process.argv[3] ?? "http://127.0.0.1:4300"
const url = `${base}/spikes/renderer/globe/${spike}/`
const out = join("spikes/renderer/globe/out", spike); mkdirSync(out, { recursive: true })
const exe = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const browser = await chromium.launch({ executablePath: exe, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] })
const errors = []
// Software-GPU frames take seconds and tile engines refine level by level, so
// the diorama can need a minute to settle; the stats count frames that did not.
const SETTLE_MS = 60000, STILL_SETTLE_MS = 120000
const STILLS = { globe: 0.0, region: 0.44, local: 0.70 }
async function page(ctx) {
  const p = await ctx.newPage()
  p.on("pageerror", e => errors.push(e.message.slice(0, 300)))
  p.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 300)) })
  return p
}
async function open(p) {
  const t0 = Date.now()
  await p.goto(url, { waitUntil: "load" })
  await p.waitForFunction(() => window.spike, null, { timeout: 120000 })
  await p.evaluate(() => window.spike.ready)
  return Date.now() - t0
}
async function flyTo(p, t, ms = SETTLE_MS) {
  await p.evaluate(t => window.spike.fly(t), t)
  const settled = await p.evaluate(ms => window.spike.settled(ms), ms)
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  return settled
}
async function fps(p, seconds) {
  return p.evaluate(async s => { const t0 = performance.now(); let n = 0; await new Promise(r => { const f = () => { n++; if (performance.now() - t0 < s * 1000) requestAnimationFrame(f); else r() }; requestAnimationFrame(f) }); return +(n / ((performance.now() - t0) / 1000)).toFixed(2) }, seconds)
}

// desktop stills, frame rate at each altitude, traffic
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } })
let p = await page(desktop)
const loadMsWall = await open(p)
const altitudes = {}
for (const [name, t] of Object.entries(STILLS)) {
  const settled = await flyTo(p, t, STILL_SETTLE_MS)
  await p.screenshot({ path: join(out, `${name}.png`) })
  altitudes[name] = { t, settled, fps: await fps(p, 3), stats: await p.evaluate(() => window.spike.stats()) }
}
const trafficStills = altitudes.local.stats.traffic
await desktop.close()

// phone tier at the diorama
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
p = await page(phone); await open(p)
await p.evaluate(() => window.spike.setQuality("phone"))
const phoneSettled = await flyTo(p, STILLS.local, STILL_SETTLE_MS)
await p.screenshot({ path: join(out, "phone-local.png") })
const phoneStats = { settled: phoneSettled, fps: await fps(p, 3), stats: await p.evaluate(() => window.spike.stats()) }
await phone.close()

// the flight, frame by frame: globe, down across the sea, the diorama orbit, back out
const FPS = 10, SECONDS = +(process.env.FLIGHT_SECONDS ?? 14), frames = FPS * SECONDS  // FLIGHT_SECONDS shortens a dry run
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
p = await page(ctx); await open(p)
const dir = join(out, "flight-frames"); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir)
let unsettled = 0; const t0 = Date.now()
for (let i = 0; i < frames; i++) {
  if (!(await flyTo(p, i / (frames - 1)))) unsettled++
  await p.screenshot({ path: join(dir, `${String(i).padStart(4, "0")}.jpg`), type: "jpeg", quality: 90 })
}
const flightStats = { frames, unsettledFrames: unsettled, wallSeconds: Math.round((Date.now() - t0) / 1000), stats: await p.evaluate(() => window.spike.stats()) }
await ctx.close(); await browser.close()
await new Promise((r, j) => spawn(process.env.FFMPEG ?? "ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(dir, "%04d.jpg"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-preset", "veryfast", "-r", "24", join(out, "flight.mp4")]).on("exit", c => c === 0 ? r() : j(new Error(`ffmpeg exited ${c}`))))
rmSync(dir, { recursive: true, force: true })
const stats = { spike, loadMsWall, altitudes, phone: phoneStats, flight: flightStats, trafficAfterStills: trafficStills, errors, capturedAt: new Date().toISOString(), note: "software GPU in the capture container; fps is relative and noisy" }
writeFileSync(join(out, "stats.json"), JSON.stringify(stats, null, 2))
console.log(JSON.stringify({ loadMsWall, fps: Object.fromEntries(Object.entries(altitudes).map(([k, v]) => [k, v.fps])), phone: phoneStats.fps, unsettled, errors: errors.length }, null, 2))
