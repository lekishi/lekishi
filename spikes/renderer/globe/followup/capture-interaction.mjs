// Records the follow-up's interaction evidence: real mouse input (drag to turn,
// wheel to zoom at the cursor, right-drag to tilt, clicks to pick) driven
// through Playwright, one screenshot per input step, assembled into a video.
// Writes spikes/renderer/globe/out/followup/{interaction.mp4,pick-*.png,interaction.json}.
// Usage: node spikes/renderer/globe/followup/capture-interaction.mjs [baseURL]
//
// Frame by frame for the same reason as the flight capture: real-time
// recording loses the motion on the container's software GPU. A drawn cursor
// and a caption show which gesture produced each frame.
import { chromium } from "@playwright/test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { join } from "node:path"
const base = process.argv[2] ?? "http://127.0.0.1:4300"
const out = "spikes/renderer/globe/out/followup", frames = join(out, "interaction")
rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true })
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] })
const p = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []; p.on("pageerror", e => errors.push(e.message)); p.on("console", m => m.type() === "error" && errors.push(m.text().slice(0, 300)))
await p.goto(`${base}/spikes/renderer/globe/followup/`, { waitUntil: "load" })
await p.waitForFunction(() => window.spike, null, { timeout: 120000 }); await p.evaluate(() => window.spike.ready)
await p.addStyleTag({ content: `#cur{position:absolute;z-index:9;width:22px;height:22px;margin:-11px 0 0 -11px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 2px #0008;pointer-events:none;transition:none}
  #cur.down{background:#d2a94f99} #cur.right{border-color:#7ab8e0;background:#7ab8e099}
  #cap{position:absolute;z-index:9;left:50%;top:14px;transform:translateX(-50%);background:#0b1016e6;border:1px solid #d2a94f;border-radius:999px;padding:6px 16px;font:600 14px system-ui;color:#f3ead7;pointer-events:none}` })
await p.evaluate(() => { for (const id of ["cur", "cap"]) { const d = document.createElement("div"); d.id = id; document.body.append(d) } })
const ui = (x, y, cls = "", caption) => p.evaluate(([x, y, cls, caption]) => { const c = document.getElementById("cur"); c.style.left = x + "px"; c.style.top = y + "px"; c.className = cls; if (caption != null) document.getElementById("cap").textContent = caption }, [x, y, cls, caption])
const raf = n => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f) }), n)
let n = 0, mx = 640, my = 400
const snap = async (settleMs = 20000) => { await p.evaluate(ms => window.spike.settled(ms), settleMs); await p.screenshot({ path: join(frames, `f${String(n++).padStart(4, "0")}.png`) }) }
const hold = async k => { for (let i = 0; i < k; i++) await snap() }
const move = async (x, y, steps, cls, cap) => {
  for (let i = 1; i <= steps; i++) { mx += (x - mx) / (steps - i + 1); my += (y - my) / (steps - i + 1); await p.mouse.move(mx, my); await ui(mx, my, cls, cap); await raf(1); await snap() }
}
const drag = async (path, button, cap) => {
  const cls = button === "right" ? "right" : "down"
  await move(path[0][0], path[0][1], 4, "", cap); await p.mouse.down({ button }); await ui(mx, my, cls, cap)
  for (const [x, y] of path.slice(1)) await move(x, y, 6, cls, cap)
  await p.mouse.up({ button }); await ui(mx, my, "", cap)
  for (let i = 0; i < 6; i++) { await raf(3); await snap() }   // the controls' damping carries on after release
}
const wheel = async (x, y, steps, dy, cap) => { await move(x, y, 4, "", cap); for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, dy); await raf(3); await snap() } await raf(20); await snap() }
const picks = []
const click = async (x, y, cap, file) => {
  await move(x, y, 6, "", cap); await p.mouse.down(); await ui(x, y, "down", cap); await p.mouse.up(); await raf(3); await ui(x, y, "", cap); await snap()
  const s = await p.evaluate(() => window.spike.stats()); picks.push({ gesture: cap, x: Math.round(x), y: Math.round(y), card: s.lastPick })
  if (file) await p.screenshot({ path: join(out, `pick-${file}.png`) })
  await hold(5)
}
const at = (lon, lat, h = 0) => p.evaluate(([a, b, c]) => window.spike.screenOf(a, b, c), [lon, lat, h])

// 1. region view, turn the globe
await p.evaluate(() => window.spike.fly(0.44)); await p.evaluate(() => window.spike.settled(60000)); await p.evaluate(() => window.spike.explore())
await ui(mx, my, "", "Region view, 1,500 km"); await hold(6)
await drag([[820, 420], [560, 470], [700, 380]], "left", "Drag: turn the globe")
// 2. wheel-zoom at the landfall
let q = await at(130.232, 31.27)
await wheel(q.x, q.y, 9, -650, "Scroll at the cursor: zoom to the landfall")
// 3. right-drag to tilt
await drag([[640, 560], [640, 380]], "right", "Right-drag: tilt toward the horizon")
// 4. picks at the diorama
await p.evaluate(() => window.spike.fly(0.70)); await p.evaluate(() => window.spike.settled(60000)); await p.evaluate(() => window.spike.explore())
await ui(mx, my, "", "Click to inspect"); await hold(4)
const lbl = await p.evaluate(() => { const e = [...document.querySelectorAll(".lbl b")].find(b => b.textContent.startsWith("秋妻屋浦")); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
await click(lbl.x, lbl.y, "Click a label: the place card", "label")
q = await at(130.19, 31.244, 600); await click(q.x, q.y, "Click a ship: the symbol card", "ship")
// the shapes overlap on screen, so find a point for each card by asking the
// page's own picker over a grid, nearest the centre first
const findPick = name => p.evaluate(name => {
  const pts = []; for (let y = 140; y < 740; y += 20) for (let x = 40; x < 1240; x += 20) pts.push([x, y])
  pts.sort((a, b) => Math.hypot(a[0] - 640, a[1] - 420) - Math.hypot(b[0] - 640, b[1] - 420))
  for (const [x, y] of pts) { const h = window.spike.pick(x, y); if (h && h.name === name) return { x, y } }
  return null
}, name)
const clickByName = async (name, cap, file) => {
  const q = await findPick(name)
  if (q) await click(q.x, q.y, cap, file); else picks.push({ gesture: cap, card: null, note: "no point on screen picks " + name })
}
await clickByName("薩摩国", "Click inside the draped province", "polygon")
await clickByName("海", "Click the sea", "sea")
// 5. the arc, from farther out
await p.evaluate(() => window.spike.fly(0.28)); await p.evaluate(() => window.spike.settled(60000)); await p.evaluate(() => window.spike.explore())
await ui(mx, my, "", "Relationship arc across the sea"); await hold(4)
q = await p.evaluate(() => window.spike.arcScreen(0)); await click(q.x, q.y, "Click the arc: the relationship card", "arc")
// bare ground: at the diorama every bit of land outside the province carries
// trees or houses, which take the click first, so it is picked out here
await clickByName("地点", "Click the ground: position and height", "ground")

await browser.close()
writeFileSync(join(out, "interaction.json"), JSON.stringify({ frames: n, picks, errors }, null, 2))
console.log(JSON.stringify({ frames: n, picks, errors }, null, 2))
await new Promise((res, rej) => spawn("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "8", "-i", join(frames, "f%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-vf", "scale=1280:-2", join(out, "interaction.mp4")], { stdio: "inherit" }).on("exit", c => c ? rej(new Error("ffmpeg " + c)) : res()))
