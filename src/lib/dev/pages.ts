/**
 * The pages under `/dev`, listed on the `/dev` index. Each one is a route in
 * `src/routes/[dev=dev]/` gated by `__DEV_PAGES__`; `dev-pages.test.ts` checks
 * every entry here has its route. Imported only by the gated index, so the
 * list is not in a production build either.
 */
export type DevPage = {
  readonly slug: string
  readonly title: string
  readonly description: string
}

export const DEV_PAGES: readonly DevPage[] = [
  {
    slug: "design",
    title: "Design system",
    description:
      "Every token and $lib/ui primitive in its states, on real chapter content (RFD 5).",
  },
  {
    slug: "wikidata",
    title: "Wikidata before 100 CE",
    description:
      "The atlas on about 700 unreviewed Wikidata items dated before 100 CE, for stress tests. Not content.",
  },
]
