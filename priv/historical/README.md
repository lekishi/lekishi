# Historical content contract (v0)

This directory holds the renderer-independent contract that the first chapter
depends on: stable identities, revisions and publication, claims and reuse,
names and romanization, time and uncertainty, geometry, and stories.

The rationale, decisions, worked examples, and open owner decisions are in
[`rfd/0002/CONTRACTS.adoc`](../../rfd/0002/CONTRACTS.adoc). Read that first.

## Layout

```
priv/historical/v0/
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
```

The contract version string is `lekishi-historical-contract/v0`. Every document
carries it, and extending a vocabulary or a rule requires a new version.

## Examples are synthetic

Every file under `examples/` is a fixture for the contract, not historical
content. Example ids contain `example-`, their `editorial_notes` say they are
synthetic, and they must never be imported as atlas content or cited as evidence.

## Validate

```bash
mix test test/historical
```

The tests validate the examples as one content tree, run every vector, and check
that every code the vectors expect is documented by the reference semantics.
`mix precommit` runs the full check.

## Reseal the examples after editing content

Hashes are the anchor that keeps approved content from being rewritten silently.
After editing an example revision or a source document, recompute them:

```bash
MIX_ENV=test mix run --no-start -e 'Lekishi.Historical.Contract.Seal.seal_all!()'
```

Sealing rewrites each source document's `source_hash`, each revision's
`revision_hash`, the record's publication mirror, and the publication set's
member and source pins. Replacement is positional, so an author's placeholder
(`sha256:000...001`) or a stale hash is replaced either way and the
hand-written formatting is preserved. The tests fail if a revision or source no
longer matches its stored hash, or if a publication set pin no longer matches the
content it approved.

Approved source metadata is immutable: correcting a title or a license means
adding a new source document (new `source_id`, optional `supersedes_source_id`),
citing it from a new revision, and publishing a set that pins it. The earlier
source and set stay in the tree, so resealing an edited approved source still
fails the pin rather than silently rewriting what review approved.
