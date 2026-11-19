import { loadPlaces } from "$lib/places/load.server"

export async function load() {
  return { catalogue: await loadPlaces() }
}
