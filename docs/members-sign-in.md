# Members' sign-in

Signed-in members of the `lekishi` GitHub organization see the chapters the
published site leaves out: drafts and chapters whose approval no longer matches
their content ([RFD 6](../rfd/0006/README.adoc)). Everyone else sees approved
chapters only. Pull-request previews show every draft without sign-in.

The design follows [renga-dcim/rfd](https://github.com/renga-dcim/rfd), which
does the same for private RFDs on Cloudflare Pages.

## How it works

- Every public page is prerendered and served as a file. `build/_routes.json`
  sends the Pages worker `/chapters/*`, `/auth/*` and `/drafts*` only, and
  excludes every prerendered chapter by name.
- A production build compiles the chapters it leaves out into the worker's
  bundle only (`virtual:lekishi-drafts`). No file in `build/` names them, which
  `scripts/check-static-build.mjs` checks.
- **Members sign in** in the home page's footer, or from the not-found page of a
  chapter address. `/auth/login` sends the reader to GitHub with the `read:org`
  scope; `/auth/callback` exchanges the code, checks that the reader is an
  `active` member of `GITHUB_ORG`, and drops the token.
- A member gets `__Host-lekishi_session`, their login and an expiry signed with
  `SESSION_SECRET` (HMAC-SHA-256), `HttpOnly`, `Secure`, `SameSite=Lax`, for 12
  hours. A readable `lekishi_member=1` cookie, which holds no credential, tells
  the prerendered pages to ask the worker for the drafts' cards and search.
- Someone removed from the organization keeps access until their session
  expires. Changing `SESSION_SECRET` signs everyone out.
- The worker answers a draft to a member and a 404 to anyone else, the same 404
  as an address that does not exist. Its responses are `Cache-Control: private,
no-store`, vary on `Cookie`, and carry `X-Robots-Tag: noindex`.

## Setting it up (owner)

1. **Create the OAuth App.** In the `lekishi` organization's **Settings →
   Developer settings → OAuth Apps**, create an app with homepage
   `https://lekishi.pages.dev` and authorization callback
   `https://lekishi.pages.dev/auth/callback`. Generate a client secret.
2. **Allow it,** if the organization restricts OAuth apps: **Settings →
   Third-party access → OAuth application policy**. Otherwise the membership
   check fails for everyone.
3. **Add the secrets** to the Pages project under **Settings → Variables and
   Secrets**, for **Production** only:

   | Name                   | Value                                           |
   | ---------------------- | ----------------------------------------------- |
   | `GITHUB_CLIENT_ID`     | the OAuth App's client ID                       |
   | `GITHUB_CLIENT_SECRET` | the client secret                               |
   | `SESSION_SECRET`       | a long random string: `openssl rand -base64 32` |
   | `GITHUB_ORG`           | optional; defaults to `lekishi`                 |

   Without the first three, `/auth/login` answers 503 and nobody is signed in,
   so nothing unapproved is served.

4. **Check it** after the next production deploy, with a draft chapter `<id>`:

   ```sh
   curl -s -o /dev/null -w '%{http_code}\n' https://lekishi.pages.dev/chapters/<id>  # 404
   curl -s https://lekishi.pages.dev/ | grep -c '<id>'                                # 0
   ```

   Then sign in from the home page's footer: the draft's card appears after the
   approved ones, and its page carries the Draft banner. Signing in as someone
   outside the organization ends on "Only members of lekishi can sign in."

## Trying it locally

The dev server serves every draft to everyone, as previews do. To run a
production build's worker as Pages does,
put a `SESSION_SECRET` (and, for the real GitHub flow, a second OAuth App's
credentials with callback `http://localhost:8788/auth/callback`) in `.dev.vars`,
which Git ignores, then:

```sh
pnpm build
pnpm exec wrangler pages dev build --port 8788
```

`pnpm check:worker` does this without GitHub, and CI's `production` job runs
it. It makes one approved chapter stale for a single production build by
retitling its manifest, restoring the file once the build has read it. Then it
serves `build/` under `wrangler pages dev` with a throwaway session key and
checks two things. A member's session opens the draft's page and data, and
neither may be cached. Without a session, or with a forged or expired one, the
reader gets exactly the answer an unknown chapter gets. It leaves `build/` as
that stale build.
