# Fluri licensing

Current and future commercial releases use [Fluri Themes Commercial License 1.0](https://fluri.xyz/license/), included in `LICENSE`. A EUR 19 one-time Lifetime License covers all current and future Fluri themes on unlimited personal, business and client websites. Finished client projects may be delivered; selling or publicly redistributing the themes as a reusable library or template pack is prohibited. Private non-production evaluation is permitted before purchase. The full license controls.

| Package                   | Last MIT release | First commercial release |
| ------------------------- | ---------------- | ------------------------ |
| `@fluritheme/fluri`       | 0.2.1            | 0.3.0                    |
| `@fluritheme/fluri-react` | 0.2.1            | 0.3.0                    |
| `@fluritheme/spider`      | 0.2.1            | 0.3.0                    |
| `@fluritheme/grinch`      | 0.1.1            | 0.2.0                    |

The listed MIT releases remain MIT. No historical package, release tag or license grant is overwritten or revoked. `LICENSE-MIT-LEGACY` records the old notice; it does not grant an MIT option for current commercial releases. Third-party dependencies and fonts retain their own licenses.

The public npm package is downloadable for inspection and private evaluation. A paid license is required before production deployment or client delivery. There is no runtime license check or telemetry. Contact fluritheme@gmail.com to arrange a license; an automated checkout and customer download portal are separate work and are not represented as complete.

## New packages and release checks

Copy `LICENSE`, `LICENSE-MIT-LEGACY`, `LICENSING.md` and `licensing.json` from the Fluri collection repository. Set package.json `license` to `SEE LICENSE IN LICENSE` and `homepage` to `https://fluri.xyz/`. Include the license and licensing notes in the archive. Copy scripts/check-licensing.mjs and invoke it from prepublishOnly so a new package cannot silently revert to MIT. Preserve third-party notices. New themes are commercial from version 0.1.0 unless the owner explicitly selects a free edition. Never infer an MIT license from an old package or scaffold.
