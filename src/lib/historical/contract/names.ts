import { isList, isObject, isString } from "./types"

/**
 * Derives the reader-facing label from a revision's names.
 *
 * The label leads with the primary period-appropriate form and pairs a
 * local-script form with its romanization when one exists, following RFD 2's
 * "Chang'an · 長安" pairing. Modern equivalents are never used as the label, and a
 * romanization is never presented as evidence of historical pronunciation.
 */

/** Returns the map label for a names list, or null when no primary form is supported. */
export function mapLabel(names: unknown): string | null {
  if (!isList(names)) {
    return null
  }

  const primary = names.find((name) => isObject(name) && name["role"] === "primary")

  return primary === undefined ? null : labelFor(primary)
}

function labelFor(name: unknown): string | null {
  if (!isObject(name)) {
    return null
  }

  const form = name["form"]
  const romanization = isObject(name["romanization"]) ? name["romanization"]["value"] : undefined

  if (!isString(form)) {
    return null
  }

  return isString(romanization) ? `${form} · ${romanization}` : form
}
