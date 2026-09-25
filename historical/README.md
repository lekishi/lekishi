# Historical content contract (v0)

This directory holds the renderer-independent contract that the first chapter
depends on: stable identities, revisions and publication, claims and reuse,
names and romanization, time and uncertainty, geometry, and stories.

The rationale, decisions, worked examples, and open owner decisions are in
[`rfd/0002/CONTRACTS.adoc`](../rfd/0002/CONTRACTS.adoc). Read that first.

The directory lives at the repository root rather than under a framework's
private tree: it is content and contract, not a build input for one toolchain.
The TypeScript reference semantics that validate it live in
`src/lib/historical/contract`.

## Layout

```
historical/v0/
  schema/              JSON Schema (2020-12 subset) documents
    common.schema.json          shared definitions: ids, time, claims, geometry, names, review
    kinds.schema.json           content per record kind: place, actor, event, relationship, story
    record.schema.json          the record envelope and its revisions
    source.schema.json          cited works, datasets, and media with reuse terms and a sealed source_hash
    publication-set.schema.json the atomic publication unit, including source pins
  examples/            a synthetic content tree that validates as a whole
    records/                    places, actors, events, relationships, stories
    sources/                    two cited works with different reuse terms
    publication-sets/           one set publishing every example revision and pinning both sources
  vectors/             machine-readable boundary vectors with expected results
    time.json ordering.json names.json geometry.json documents.json publication.json
historical/chapters/
  tang-mission-750-754/  the reviewed first chapter (see its README)
    records/                    the chapter's places, actors, events, relationships, story
    sources/                    the cited works and datasets, with reuse terms
    publication-sets/           the set that publishes the chapter and pins its sources
  qin-conquest-han-233-226/  the bounded Qin comparison fixture (see its README)
    records/ sources/ publication-sets/   the same tree shape, prepared as a
                              comparison-only snapshot rather than a launch chapter
```

The contract version string is `lekishi-historical-contract/v0`. Every document
carries it, and extending a vocabulary or a rule requires a new version.

## Examples are synthetic, chapters are reviewed content

Every file under `examples/` is a fixture for the contract, not historical
content. Example ids contain `example-`, their `editorial_notes` say they are
synthetic, and they must never be imported as atlas content or cited as evidence.

Reviewed chapter content lives under `historical/chapters/<name>/` in the same
tree shape and is loaded through the content boundary in
`src/lib/historical/chapter.ts`, which hands it to the contract's own
`Publication.checkAll`. The first chapter is
`historical/chapters/tang-mission-750-754/`; its README records the coverage
model, the inventory, the evidence, and the review status. The bounded Qin
comparison fixture is `historical/chapters/qin-conquest-han-233-226/`: it is
source-checked content in the same contract, recorded as a preparation snapshot
rather than a release, loadable through the browser-safe comparison catalog
(`src/lib/atlas/chapter-catalog.ts`) and deliberately not rendered by the
production atlas.

The publication approval gate covers every chapter tree: a set that
`rfd/0002/PUBLICATION_APPROVAL.adoc` does not name fails the build, and the
Tang chapter's set carries the owner's recorded release approval while the
comparison fixture's set carries preparation self-review only.

## Validate

```bash
pnpm test
```

The suite validates the examples as one content tree, runs every vector (187
cases across `time`, `ordering`, `names`, `geometry`, `documents`, and
`publication`), checks that every code and caveat the vectors expect is
documented by the reference semantics, and validates the reviewed Tang chapter
with its own coverage, coda, and exclusion checks. The Qin comparison fixture
has its own suite with scope, exclusion, uncertainty, dispute, geometry, and
comparison-loadability checks. `pnpm verify` runs the full check.

## Reseal synthetic examples after editing them

Hashes are the anchor that keeps approved content from being rewritten silently.
After editing a synthetic example revision or source document, recompute it:

```bash
pnpm seal
```

Sealing rewrites each synthetic source document's `source_hash`, each revision's
`revision_hash`, the record's publication mirror, and the publication set's
member and source pins. Replacement is positional, so an author's placeholder
(`sha256:000...001`) or a stale hash is replaced either way and the hand-written
formatting is preserved.

`pnpm seal` refuses reviewed chapter directories. Chapter corrections require a
new revision or source document and a new publication set; the existing hashes
and review metadata remain immutable. Tests fail if an approved revision or
source no longer matches its stored hash or publication pin.

Approved source metadata is immutable: correcting a title or a license means
adding a new source document (new `source_id`, optional `supersedes_source_id`),
citing it from a new revision, and publishing a set that pins it. The earlier
source and set stay in the tree, so resealing an edited approved source still
fails the pin rather than silently rewriting what review approved.

## Canonical encoding

A hash is the SHA-256 of the canonical JSON encoding of a revision or source
body without its own hash field: object keys sorted recursively, no insignificant
whitespace, numbers in their shortest form. The encoding is what makes "the exact
revision approved" checkable, and the TypeScript implementation in
`src/lib/historical/contract/canonical.ts` defines it now. The port from the
retired Elixir implementation changed one representation: a number written
`31.0` is encoded as `31` (the same number, shortest form). The worked examples
were resealed with `pnpm seal` for that reason, and the seal, pin, and
tamper-detection tests verify the new hashes.
