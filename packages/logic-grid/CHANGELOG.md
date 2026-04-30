# Changelog

## [3.0.0](https://github.com/antonstefer/logic-grid/compare/logic-grid-v2.0.0...logic-grid-v3.0.0) (2026-04-30)


### ⚠ BREAKING CHANGES

* generate({ categoryNames: [...] }) now throws when no category has ordered: true. Migration: prepend defaultHouseCategory(size) to categoryNames, or mark a domain-relevant category as ordered: true with orderingPhrases.

### Features

* require ordered axis in custom categoryNames ([#21](https://github.com/antonstefer/logic-grid/issues/21)) ([07b59ef](https://github.com/antonstefer/logic-grid/commit/07b59ef850d23fa3ad10706e74a003e5eab31c7a))
