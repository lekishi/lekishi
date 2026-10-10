// Drives one spike page through the shared API: screenshots at desktop and phone
// quality, an orbit video, a playhead video, and the stats, written to out/<spike>/.
// Usage: node spikes/renderer/capture.mjs <three|cesium> [baseURL]
import { chromium } from "@playwright/test"
import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { join } from "node:path"
const spike = process.argv[2]; if (!spike) { console.error("usage: capture.mjs <spike>"); process.exit(1) }
const base = process.argv[3] ?? "http://127.0.0.1:4300"
const url = `${base}/spikes/renderer/${spike}/`
const out = join("spikes/renderer/out", spike); mkdirSync(out, { recursive: true })
const exe = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"]
const browser = await chromium.launch({ executablePath: exe, args })
const errors = []
async function page(ctx) { const p = await ctx.newPage(); p.on("pageerror", e => errors.push(e.message)); p.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 200)) }); return p }
async function ready(p, quality) { await p.goto(url, { waitUntil: "load" }); await p.waitForFunction(() => window.spike, null, { timeout: 120000 }); await p.evaluate(() => window.spike.ready); if (quality) await p.evaluate(q => window.spike.setQuality(q), quality); await p.waitForTimeout(1500) }
async function measure(p, seconds) { return p.evaluate(async s => { const t0 = performance.now(); let frames = 0; await new Promise(r => { const f = () => { frames++; if (performance.now() - t0 < s * 1000) requestAnimationFrame(f); else r() }; requestAnimationFrame(f) }); const st = window.spike.stats(); st.measuredFps = frames / ((performance.now() - t0) / 1000); return st }, seconds) }

// desktop stills and stats
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } })
let p = await page(desktop); const t0 = Date.now(); await ready(p); const loadMs = Date.now() - t0
await p.screenshot({ path: join(out, "desktop-hero.png") })
const statsFull = await measure(p, 4); statsFull.loadMsWall = loadMs
await p.evaluate(() => window.spike.orbit(0.25)); await p.waitForTimeout(800); await p.screenshot({ path: join(out, "desktop-orbit-90.png") })
await p.evaluate(() => window.spike.orbit(0.5)); await p.waitForTimeout(800); await p.screenshot({ path: join(out, "desktop-orbit-180.png") })
await p.evaluate(() => window.spike.orbit(0)); await p.evaluate(() => window.spike.playhead(1)); await p.waitForTimeout(800); await p.screenshot({ path: join(out, "desktop-landfall.png") })
await desktop.close()

// phone quality
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
p = await page(phone); await ready(p, "phone"); await p.screenshot({ path: join(out, "phone-quality.png") })
const statsPhone = await measure(p, 4); await phone.close()

// videos: orbit and playhead, 1280x800
async function video(name, seconds, step) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: out, size: { width: 1280, height: 800 } } })
  const v = await page(ctx); await ready(v)
  const frames = seconds * 10
  for (let i = 0; i <= frames; i++) { await v.evaluate(step, i / frames); await v.waitForTimeout(100) }
  const path = await v.video().path(); await ctx.close(); renameSync(path, join(out, `${name}.webm`))
}
await video("orbit", 8, t => window.spike.orbit(t))
await video("playhead", 6, t => window.spike.playhead(t))
await browser.close()
writeFileSync(join(out, "stats.json"), JSON.stringify({ full: statsFull, phone: statsPhone, errors, capturedAt: new Date().toISOString(), note: "software GPU in the capture container; fps is relative" }, null, 2))
// mp4 for playback outside Chrome, with Playwright's own ffmpeg
for (const name of ["orbit", "playhead"]) await new Promise(r => spawn(process.env.FFMPEG ?? "ffmpeg", ["-y", "-loglevel", "error", "-i", join(out, `${name}.webm`), "-vf", "scale=1280:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-preset", "veryfast", "-an", join(out, `${name}.mp4`)]).on("exit", r))
console.log(JSON.stringify({ full: statsFull, phone: statsPhone, errors }, null, 2))
