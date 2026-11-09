---
name: cloud-env-tooling
description: How to get jj and Wikidata data in the Lekishi cloud container when nix develop and the Wikimedia APIs fail (2026-10-21)
metadata:
  type: reference
  modified: 2026-10-21T15:18:50.971Z
---

Observed 2026-10-21 in the default cloud environment:

- `nix develop` fails: fetching the flake inputs from GitHub is refused for this session. jj is not on PATH.
  Workaround: download the static binary from GitHub releases (this works through the proxy):
  `curl -sSL https://github.com/jj-vcs/jj/releases/download/v0.34.0/jj-v0.34.0-x86_64-unknown-linux-musl.tar.gz | tar xz -C /tmp && mv /tmp/jj ~/.local/bin/`,
  then `jj git init --colocate` and set `user.name`/`user.email` with `jj config set --repo`.
- Node 22 and pnpm are preinstalled at /opt/node22 (the flake pins Node 24; CI uses 24).
- Wikidata `api.php` (wbsearchentities) and Wikipedia `api.php` return HTTP 429 when many threads run at once.
  What still works, with ~2 s spacing: `https://www.wikidata.org/wiki/Special:ItemByTitle/enwiki/<Title>` (302 to the Q-id)
  and `https://www.wikidata.org/wiki/Special:EntityData/<Q>.json` (labels, P625, `lastrevid` for pinning).
- zh.wikisource `index.php?action=raw` for 通典, 資治通鑑, 舊唐書, 新唐書 juan pages works without throttling.

- Playwright's pinned headless shell isn't in /opt/pw-browsers. Launch with `executablePath: "/opt/pw-browsers/chromium"` and args `--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader`. Screenshots of the globe pages fail locally, but DOM reads work.
- Never `pkill -f` or grep `ps` for a pattern that also appears in your own command line. It kills the shell (exit 144). Match /proc/<pid>/cmdline from a separate script instead.
- Before a first `pnpm build`, run `pnpm sync:globe` and `sync:fonts`. Together they take about 10 minutes and need the 600 s timeout plus a background run.
- Never run `pkill -f <pattern>` here: the pattern matches the Bash tool's own command line, so it kills the calling shell (exit 144). Kill by PID from `pgrep` instead.
- The preinstalled Playwright browsers in /opt/pw-browsers are revision 1194, but the repo's Playwright 1.63 wants 1243. Point `PLAYWRIGHT_BROWSERS_PATH` at a scratch folder holding `chromium-1243/chrome-linux64` and `chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell` symlinked to the 1194 files; e2e then runs locally (2026-10-21).

Related: [[authoring-format-decisions-2026-10-18]]
