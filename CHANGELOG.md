# Changelog

All notable changes to this project are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-07-31

First public release.

### Added

- Two styles in one package: `plain` (grid background, one paint, always
  mirrored) and `rich` (plain black, body cutouts, a second color, about half of
  the figures asymmetric).
- Style selection through the `style` option, the `--style` CLI flag and the
  `?style=` query parameter; the `ETag` keeps the two styles apart.
- Deterministic SVG and PNG output seeded by HMAC-SHA-256, with the raw `userId`
  never reaching the image.
- Browser entry point (`src/browser.mjs`) that renders byte-identical SVG
  without `node:crypto`, plus a live demo and gallery under `docs/`.
- Zero runtime dependencies; Node.js 20+.

[1.0.0]: https://github.com/kotuke/bitizen/releases/tag/v1.0.0
