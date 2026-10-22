# Historical content

This directory holds the atlas's historical content and the
renderer-independent contract it compiles to: stable identities, revisions and
publication, claims and reuse, names and romanization, time and uncertainty,
geometry, and stories.

The contract's rationale, decisions, and worked examples are in
[`rfd/0002/CONTRACTS.adoc`](../rfd/0002/CONTRACTS.adoc); the record-file format
an author writes is decided in
[`rfd/0002/AUTHORING_FORMAT.adoc`](../rfd/0002/AUTHORING_FORMAT.adoc). Read those
first.

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
    time.json calendars.json claims.json ordering.json names.json geometry.json
    documents.json publication.json
historical/schema/     JSON Schema for the record files an author writes
historical/places/ actors/ events/ relationships/
                       one YAML record per file, written once for every chapter;
                       the file name is the id, subfolders (tang/, qin/) are tidiness
historical/sources/    one YAML file per cited work or dataset, with its reuse terms
historical/chapters/
  tang-mission-750-754.yaml      a chapter manifest: card text, window, stories, approval
  tang-mission-750-754.md        the chapter's scope, evidence and review notes
  qin-conquest-han-233-226.yaml  the bounded Qin chapter
  qin-conquest-han-233-226.md
```

The contract version string is `lekishi-historical-contract/v0`. Every document
carries it. Until the atlas launches, extending a vocabulary or a rule amends v0
in place, because no published content depends on it yet (owner decision,
2026-10-22); after launch it requires a new version.

## Examples are synthetic, chapters are reviewed content

Every file under `examples/` is a fixture for the contract, not historical
content. Example ids contain `example-`, their `editorial_notes` say they are
synthetic, and they must never be imported as atlas content or cited as evidence.

Chapter content is authored as record files and compiled, never written as v0
JSON by hand. `src/lib/historical/authoring/` reads the tree, checks every file
against `historical/schema`, and compiles a chapter into complete v0 documents:
its manifest's stories, every record and source the stories and `include` reach,
one generated revision per record, and a publication set. A manifest with one
story writes `story:`; a chapter with several writes `stories:`, each with a
`key`, a `title` for the reader's story switcher and its own steps, and the
first is the story the chapter opens on (`rfd/0002/CHAPTER_STORIES.adoc`). The site compiles
the chapters at build time (`scripts/historical-chapters.mjs`) and ships one chunk per chapter;
nothing compiled is checked in. The Node content boundary,
`src/lib/historical/chapter.ts`, compiles the same bundles for the contract and
chapter tests and hands them to the contract's own `Publication.checkAll`.

The two chapters are the Tang mission of 750–754 and the bounded Qin episode of
233–226 BCE. Each chapter's `.md` notes record its coverage model, inventory,
evidence, and review history, including the history from before the record
files replaced the hand-written JSON tree on 2026-10-18.

## Publication is the owner's approval

A chapter is published only by the `approval` block in its manifest: the
digest of the manifest and of every record and source the chapter reaches,
who approved it, and on which day. Only the owner writes it. `pnpm approvals`
lists every chapter as approved, draft, or stale and shows the field-level
changes since the last approval; `pnpm approvals approve all` goes through each
chapter awaiting approval and asks the owner `y` or `n`.

- A chapter without an approval is a draft: it compiles and faces every
  contract test as a preview, and production does not serve it. Development
  and pull-request previews serve it, and a stale chapter too, under a draft
  banner, so the owner can open what they are asked to approve.
- An edit to anything an approved chapter reaches, a shared place included,
  makes the approval stale, and a stale approval fails the build until the owner
  approves the new content.
- The approval gate is `src/lib/historical/contract/publication-approval.test.ts`,
  run by `pnpm build` through `scripts/check-chapter.mjs`, and
  `.github/CODEOWNERS` requires the owner's review on every manifest.

The ledger in `rfd/0002/PUBLICATION_APPROVAL.adoc` records the decisions taken
on the hand-written JSON sets before the record files; it is history, and no
compiled set needs a row in it.

## Validate

```bash
pnpm test
```

The suite validates the examples as one content tree, runs every vector (201
cases across `time`, `calendars`, `claims`, `ordering`, `names`, `geometry`,
`documents`, and `publication`), checks that every code and caveat the vectors expect is
documented by the reference semantics, and validates the compiled Tang chapter
with its own coverage, coda, and exclusion checks. The Qin chapter has its own
suite with scope, exclusion, uncertainty, dispute, and geometry checks. The
compiler's own rules are pinned against a synthetic tree in
`src/lib/historical/authoring/compile.test.ts`. `pnpm verify` runs the full
check.

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

`pnpm seal` is for the synthetic examples only. Chapter content has no stored
hashes to reseal: the compiler generates every revision and source hash from the
record files, and the approval digest is what keeps approved content from being
rewritten silently.

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
