import { describe, expect, it } from "vitest"
import { encode, isHash, revisionHash, sha256, sourceHash } from "./canonical"

/**
 * The canonical encoding is what makes an approved revision immutable: the stored
 * hashes in `historical/v0/examples` were produced by the reference
 * implementation, so these tests pin the encoding rules the hashes depend on
 * (recursive key sorting, no insignificant whitespace, UTF-8 byte key order).
 */

describe("canonical encoding", () => {
  it("sorts object keys recursively and emits no insignificant whitespace", () => {
    expect(encode({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}',
    )
  })

  it("sorts keys by UTF-8 byte order, not by locale", () => {
    expect(encode({ Z: 1, a: 2, é: 3 })).toBe('{"Z":1,"a":2,"é":3}')
  })

  it("hashes a revision without its own revision_hash field", () => {
    const revision = { revision_id: "lks:rev:1", content: { summary: "s" } }
    const sealed = { ...revision, revision_hash: revisionHash(revision) }

    expect(sealed.revision_hash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(revisionHash(sealed)).toBe(sealed.revision_hash)
    expect(revisionHash({ ...sealed, content: { summary: "edited" } })).not.toBe(
      sealed.revision_hash,
    )
  })

  it("hashes a source without its own source_hash field", () => {
    const source = { source_id: "lks:source:1", title: "A chronicle" }

    expect(sourceHash({ ...source, source_hash: "sha256:0000" })).toBe(sourceHash(source))
    expect(sourceHash({ ...source, title: "Edited" })).not.toBe(sourceHash(source))
  })

  it("recognizes the contract's hash shape", () => {
    expect(isHash(`sha256:${"a".repeat(64)}`)).toBe(true)
    expect(isHash(`sha256:${"a".repeat(63)}`)).toBe(false)
    expect(isHash("sha256:ABCDEF")).toBe(false)
    expect(isHash(42)).toBe(false)
  })

  it("hashes UTF-8 text with lowercase hex", () => {
    expect(sha256("長安")).toBe("706108acdf2dde65de621626c3fc7a026882897b0e12683e363c8e7aa1ff079f")
  })
})
