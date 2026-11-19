import { error } from "@sveltejs/kit"
import { homeStills } from "$lib/server/home-stills"
import tang from "$lib/server/home-stills/tang-mission.jpg?inline"
import world from "$lib/server/home-stills/world.jpg?inline"
import type { EntryGenerator, RequestHandler } from "./$types"

export const prerender = true

const images = new Map<string, string>()
if (homeStills.chapterId) images.set("tang-mission", tang)
if (homeStills.world) images.set("world", world)

export const entries: EntryGenerator = () => [...images.keys()].map((image) => ({ image }))

export const GET: RequestHandler = ({ params }) => {
  const image = images.get(params.image)
  if (!image) error(404, "Not found")

  return new Response(Buffer.from(image.split(",")[1], "base64"), {
    headers: { "content-type": "image/jpeg" },
  })
}
