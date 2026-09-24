/**
 * The site is fully prerendered. The static build contains real HTML for every
 * route, so a direct request for `/atlas` works with no server process, and the
 * client mounts the atlas workspace on top of that shell.
 */
export const prerender = true
