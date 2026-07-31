# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/kotuke/bitizen/security/advisories/new)
rather than in a public issue. Expect a first response within seven days.

## In scope

- Anything that lets an attacker recover `AVATAR_SECRET` or the original `userId`
  from generated images or from the HTTP endpoint.
- Crashes, hangs or unbounded memory use triggered by untrusted `userId`,
  `size` or `style` input.
- Output that escapes the SVG or PNG structure, for example injected markup.

## Out of scope

- Visual collisions between avatars. Any finite identicon has them; see the
  uniqueness note in the README for the recommended mitigation.
- Running the generator without a secret, or with a secret that is shipped to
  the client. The README explains why the secret has to stay on the backend.
- Denial of service from generating very large images on purpose — cap `size`
  at your own edge.

## Supported versions

The latest release on `main` is supported.
