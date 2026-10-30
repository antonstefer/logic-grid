# Changelog

## [3.0.0](https://github.com/antonstefer/logic-grid/compare/logic-grid-v2.0.0...logic-grid-v3.0.0) (2026-10-30)


### ⚠ BREAKING CHANGES

* logic-grid and logic-grid-ai now require Node.js 22 or newer. Migration: upgrade to Node.js 22+.
* generate({ categoryNames: [...] }) now throws when no category has ordered: true. Migration: prepend defaultHouseCategory(size) to categoryNames, or mark a domain-relevant category as ordered: true with orderingPhrases.

### Features

* require Node.js 22 or newer ([fc4ba28](https://github.com/antonstefer/logic-grid/commit/fc4ba28d5509cef2734604e2bbea45d07b432638))
* require ordered axis in custom categoryNames ([#21](https://github.com/antonstefer/logic-grid/issues/21)) ([07b59ef](https://github.com/antonstefer/logic-grid/commit/07b59ef850d23fa3ad10706e74a003e5eab31c7a))
