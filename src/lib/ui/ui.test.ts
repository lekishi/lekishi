// @vitest-environment jsdom
import { createRawSnippet, flushSync, mount, unmount, type Component } from "svelte"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  Badge,
  BADGES,
  Button,
  CitationLine,
  DateLine,
  EmptyState,
  Field,
  Icon,
  Logo,
  NameForm,
  Orb,
  Plate,
  Sheet,
  Tabs,
  type BadgeKind,
} from "."

/**
 * The primitives' behaviour contract: accessible names, states that do not
 * rest on colour, keyboard paths, and the distinctions the history depends on
 * (the two empty states, the name before its romanization). How they look is
 * reviewed on the `/dev/design` page; this pins what must not regress.
 */

let target: HTMLElement
let mounted: ReturnType<typeof mount> | undefined

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const text = (html: string) => createRawSnippet(() => ({ render: () => html }))

function render<Props extends Record<string, unknown>>(
  component: Component<Props>,
  props: Props,
): HTMLElement {
  mounted = mount(component, { target, props })
  flushSync()
  return target
}

function key(element: Element, name: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true })
  element.dispatchEvent(event)
  flushSync()
  return event
}

beforeEach(() => {
  target = document.createElement("div")
  document.body.append(target)
})

afterEach(() => {
  if (mounted) unmount(mounted)
  mounted = undefined
  target.remove()
})

describe("Icon", () => {
  it("is hidden without a label and an image with one", () => {
    render(Icon, { name: "play" })
    expect(target.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    unmount(mounted!)
    mounted = undefined
    render(Icon, { name: "play", label: "Play" })
    const svg = target.querySelector("svg")!
    expect(svg.getAttribute("role")).toBe("img")
    expect(svg.getAttribute("aria-label")).toBe("Play")
    expect(svg.hasAttribute("aria-hidden")).toBe(false)
  })
})

describe("Logo", () => {
  it("is hidden without a label and an image with one", () => {
    render(Logo, {})
    expect(target.querySelector("[data-logo]")?.getAttribute("aria-hidden")).toBe("true")
    unmount(mounted!)
    mounted = undefined
    render(Logo, { label: "Lekishi", wordmark: true })
    const logo = target.querySelector("[data-logo]")!
    expect(logo.getAttribute("role")).toBe("img")
    expect(logo.getAttribute("aria-label")).toBe("Lekishi")
    expect(logo.querySelectorAll("svg")).toHaveLength(2)
  })

  it("draws the small cuts at small sizes, in the SVG namespace", () => {
    render(Logo, { size: 16 })
    const logo = target.querySelector("[data-logo]")!
    expect(logo.getAttribute("data-logo")).toBe("tiny")
    for (const shape of logo.querySelectorAll("circle, ellipse, path"))
      expect(shape.namespaceURI).toBe("http://www.w3.org/2000/svg")
  })

  it("gives each logo on a page its own playhead mask", () => {
    render(Logo, {})
    mount(Logo, { target, props: {} })
    flushSync()
    const masks = [...target.querySelectorAll("mask")].map((mask) => mask.id)
    expect(masks).toHaveLength(2)
    expect(new Set(masks).size).toBe(2)
    for (const id of masks) expect(target.querySelector(`g[mask="url(#${id})"]`)).not.toBeNull()
  })
})

describe("Button", () => {
  it("renders a button, or a link when given an href", () => {
    render(Button, { variant: "primary", children: text("<span>Begin</span>") })
    expect(target.querySelector("button")?.getAttribute("type")).toBe("button")
    unmount(mounted!)
    mounted = undefined
    render(Button, { href: "/atlas", children: text("<span>Open</span>") })
    expect(target.querySelector("a")?.getAttribute("href")).toBe("/atlas")
    expect(target.querySelector("button")).toBeNull()
  })

  it("names an icon button by its label", () => {
    render(Button, { variant: "icon", icon: "close", label: "Close the card" })
    const button = target.querySelector("button")!
    expect(button.getAttribute("aria-label")).toBe("Close the card")
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("stays focusable but inert while busy, and says so", () => {
    const onclick = vi.fn()
    render(Button, { busy: true, onclick, children: text("<span>Save</span>") })
    const button = target.querySelector("button")!
    expect(button.disabled).toBe(false)
    expect(button.getAttribute("aria-busy")).toBe("true")
    expect(target.querySelector('[data-testid="button-busy"]')).not.toBeNull()
    button.click()
    expect(onclick).not.toHaveBeenCalled()
  })

  it("drops a disabled link's href instead of leaving it live", () => {
    render(Button, { href: "/atlas", disabled: true, children: text("<span>Open</span>") })
    const link = target.querySelector("a")!
    expect(link.hasAttribute("href")).toBe(false)
    expect(link.getAttribute("role")).toBe("link")
    expect(link.getAttribute("aria-disabled")).toBe("true")
  })
})

describe("Orb", () => {
  it.each([
    [false, "false"],
    [true, "true"],
    ["mixed", "mixed"],
  ] as const)("states pressed=%s as aria-pressed=%s", (pressed, expected) => {
    render(Orb, { icon: "journeys", label: "Journeys", pressed })
    expect(target.querySelector("button")?.getAttribute("aria-pressed")).toBe(expected)
  })

  it("turns a mixed layer fully on, and an on layer off", () => {
    const onchange = vi.fn()
    render(Orb, { icon: "diplomacy", label: "Diplomacy", pressed: "mixed", onchange })
    target.querySelector("button")!.click()
    expect(onchange).toHaveBeenLastCalledWith(true)
    unmount(mounted!)
    render(Orb, { icon: "diplomacy", label: "Diplomacy", pressed: true, onchange })
    target.querySelector("button")!.click()
    expect(onchange).toHaveBeenLastCalledWith(false)
  })
})

describe("Badge", () => {
  it.each(Object.keys(BADGES) as BadgeKind[])("draws %s as a glyph and a word", (kind) => {
    render(Badge, { kind })
    const badge = target.querySelector(`[data-badge="${kind}"]`)!
    expect(badge.querySelector("svg")?.dataset.icon).toBe(BADGES[kind].icon)
    expect(badge.textContent?.trim()).toBe(BADGES[kind].text)
  })
})

describe("Tabs", () => {
  const tabs = [
    { id: "events", label: "Events", count: 24 },
    { id: "story", label: "Story" },
    { id: "sources", label: "Sources", count: 11 },
  ]

  function renderTabs(onselect = vi.fn()) {
    render(Tabs, {
      tabs,
      selected: "events",
      label: "Chapter exploration",
      idPrefix: "test",
      onselect,
      children: createRawSnippet((id: () => string) => ({
        render: () => `<p data-panel="${id()}">${id()}</p>`,
      })),
    })
    return [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  }

  it("keeps only the selected tab in the tab order and labels the panel by it", () => {
    const [events, story] = renderTabs()
    expect(events.tabIndex).toBe(0)
    expect(story.tabIndex).toBe(-1)
    const panel = target.querySelector('[role="tabpanel"]')!
    expect(panel.getAttribute("aria-labelledby")).toBe(events.id)
    expect(events.getAttribute("aria-controls")).toBe(panel.id)
    // A panel whose content may hold nothing focusable is itself a tab stop.
    expect((panel as HTMLElement).tabIndex).toBe(0)
  })

  it("moves selection and focus with the arrow keys, wrapping, and Home and End", async () => {
    const onselect = vi.fn()
    const [events, , sources] = renderTabs(onselect)
    events.focus()
    key(events, "ArrowLeft")
    expect(onselect).toHaveBeenLastCalledWith("sources")
    expect(document.activeElement).toBe(sources)
    expect(sources.getAttribute("aria-selected")).toBe("true")
    expect(target.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby")).toBe(
      sources.id,
    )
    key(sources, "ArrowRight")
    expect(onselect).toHaveBeenLastCalledWith("events")
    key(events, "End")
    expect(onselect).toHaveBeenLastCalledWith("sources")
    key(sources, "Home")
    expect(onselect).toHaveBeenLastCalledWith("events")
    await flush()
  })
})

describe("Field", () => {
  it("labels the input and describes it by its hint", () => {
    render(Field, { label: "Search the chapter", hint: "A name, a place, a year" })
    const input = target.querySelector("input")!
    expect(target.querySelector(`label[for="${input.id}"]`)?.textContent?.trim()).toBe(
      "Search the chapter",
    )
    const hint = document.getElementById(input.getAttribute("aria-describedby")!)
    expect(hint?.textContent).toBe("A name, a place, a year")
  })

  it("offers a clear action only when there is something to clear", () => {
    const onclear = vi.fn()
    render(Field, { label: "Search", value: "鑒眞", onclear })
    const clear = target.querySelector<HTMLButtonElement>('button[aria-label="Clear search"]')!
    clear.click()
    flushSync()
    expect(onclear).toHaveBeenCalledOnce()
    expect(target.querySelector("input")?.value).toBe("")
    expect(document.activeElement).toBe(target.querySelector("input"))
    expect(target.querySelector('button[aria-label="Clear search"]')).toBeNull()
  })

  it("clears a search with Escape", () => {
    const oninput = vi.fn()
    render(Field, { label: "Search", value: "han", oninput })
    const event = key(target.querySelector("input")!, "Escape")
    expect(event.defaultPrevented).toBe(true)
    expect(oninput).toHaveBeenLastCalledWith("")
    expect(target.querySelector("input")?.value).toBe("")
  })
})

describe("Sheet", () => {
  it("steps through the detents from its handle and drops back to peek", () => {
    const ondetent = vi.fn()
    render(Sheet, {
      title: "Explore",
      placement: "bottom",
      detent: "peek",
      ondetent,
      children: text("<p>list</p>"),
    })
    const section = target.querySelector("section")!
    const heading = document.getElementById(section.getAttribute("aria-labelledby")!)
    expect(heading?.tagName).toBe("H2")
    expect(heading?.textContent).toBe("Explore")
    const handle = () => target.querySelector<HTMLButtonElement>("section > button")!
    expect(handle().getAttribute("aria-label")).toBe("Expand Explore")
    handle().click()
    flushSync()
    expect(section.dataset.detent).toBe("half")
    handle().click()
    flushSync()
    expect(section.dataset.detent).toBe("full")
    expect(handle().getAttribute("aria-label")).toBe("Collapse Explore")
    handle().click()
    flushSync()
    expect(ondetent.mock.calls.map(([detent]) => detent)).toEqual(["half", "full", "peek"])
  })

  it("closes from its close button and from Escape inside it", () => {
    const onclose = vi.fn()
    render(Sheet, { title: "About", onclose, children: text("<p>status</p>") })
    target.querySelector<HTMLButtonElement>('button[aria-label="Close About"]')!.click()
    key(target.querySelector("p")!, "Escape")
    expect(onclose).toHaveBeenCalledTimes(2)
  })

  it("stays open when Escape clears a search field inside it", () => {
    const onclose = vi.fn()
    const oninput = vi.fn()
    // The real Field, mounted as the sheet's content, so the test follows its
    // Escape handling rather than a hand-made cancelled event.
    const field = createRawSnippet(() => ({
      render: () => "<div></div>",
      setup: (element) => {
        const child = mount(Field, {
          target: element,
          props: { label: "Search", value: "han", oninput },
        })
        return () => unmount(child)
      },
    }))
    render(Sheet, { title: "Explore", onclose, children: field })
    key(target.querySelector("input")!, "Escape")
    expect(oninput).toHaveBeenLastCalledWith("")
    expect(onclose).not.toHaveBeenCalled()
  })
})

describe("Plate", () => {
  it("is a labelled region when titled", () => {
    render(Plate, { title: "Sources", count: 11, children: text("<p>x</p>") })
    const section = target.querySelector("section")!
    expect(section.getAttribute("aria-label")).toBe("Sources")
    expect(section.querySelector("h2")?.textContent).toContain("11")
  })
})

describe("NameForm", () => {
  it("leads with the name in its script and keeps the modern name on request", () => {
    render(NameForm, {
      name: "秋妻屋浦",
      lang: "ja",
      romanization: "Akimeya no ura",
      modern: "坊津 (a proposed identification)",
      modernLang: "ja",
    })
    const [name, romanization] = target.querySelectorAll("[data-name-form] > span")
    expect(name.getAttribute("lang")).toBe("ja")
    expect(name.textContent).toBe("秋妻屋浦")
    expect(romanization.textContent).toBe("Akimeya no ura")
    const toggle = target.querySelector("button")!
    const modern = document.getElementById(toggle.getAttribute("aria-controls")!)!
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(modern.hidden).toBe(true)
    toggle.click()
    flushSync()
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(modern.hidden).toBe(false)
    expect(modern.getAttribute("lang")).toBe("ja")
    expect(modern.textContent).toBe("坊津 (a proposed identification)")
  })
})

describe("DateLine", () => {
  it("lays out both calendars and the precision without reformatting them", () => {
    render(DateLine, {
      year: "753",
      calendar: "天寶十二載",
      day: "12月20日",
      precision: "to the day",
    })
    const time = target.querySelector("time")!
    expect(time.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "753 · 天寶十二載 · 12月20日 to the day",
    )
    expect(time.querySelector('[lang="zh-Hant"]')?.textContent).toBe("天寶十二載")
  })
})

describe("CitationLine", () => {
  it("opens the quote when it can, and is plain text when it cannot", () => {
    const onopen = vi.fn()
    render(CitationLine, {
      source: "唐大和上東征傳",
      sourceLang: "zh-Hant",
      terms: "public domain",
      onopen,
    })
    target.querySelector("button")!.click()
    expect(onopen).toHaveBeenCalledOnce()
    unmount(mounted!)
    mounted = undefined
    render(CitationLine, { source: "續日本紀", sourceLang: "ja", terms: "public domain" })
    expect(target.querySelector("button, a")).toBeNull()
    expect(target.querySelector("[data-citation]")?.textContent).toContain("public domain")
  })
})

describe("EmptyState", () => {
  it("keeps 'not yet covered' and 'no results with these filters' distinct", () => {
    render(EmptyState, { kind: "uncovered" })
    const uncovered = target.textContent
    unmount(mounted!)
    mounted = undefined
    render(EmptyState, { kind: "filtered" })
    const filtered = target.textContent
    expect(uncovered).toContain("Not yet covered")
    expect(uncovered).toContain("not evidence that nothing happened")
    expect(filtered).toContain("No results with these filters")
    expect(filtered).not.toEqual(uncovered)
  })
})
