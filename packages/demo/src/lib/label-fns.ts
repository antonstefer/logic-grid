import type { Category } from "logic-grid";
import type { PuzzleLocalization } from "./puzzle-state.svelte";

/**
 * Pure label-resolution functions used by `PuzzleGrid.svelte`. Pulled into
 * a sibling module so the throw paths can be unit-tested without standing
 * up Svelte component-test infrastructure for a single component.
 *
 * Behaviour summary:
 *  - `displayLabels` (when present on an ordered category) wins over both
 *    localization and canonical values — it's the consumer's chosen visual
 *    form for the grid (e.g. House `1/2/3/4`), language-independent.
 *  - When `localization` is set, every canonical key MUST have a non-empty
 *    entry. A missing entry indicates corrupted output that bypassed the
 *    structural validator; throw rather than render a half-localized grid.
 *  - When `localization` is `null`, fall through to the canonical name /
 *    value (the English-locale path).
 */

export function categoryLabel(
  name: string,
  localization: PuzzleLocalization | null,
): string {
  if (localization === null) return name;
  const localized = localization.categoryNames[name];
  if (localized === undefined) {
    throw new Error(
      `Localization is missing categoryNames entry for "${name}"`,
    );
  }
  return localized;
}

export function valueLabel(
  cat: Category,
  valIdx: number,
  localization: PuzzleLocalization | null,
): string {
  const canonical = cat.values[valIdx];
  // displayLabels (when present) is the consumer's chosen visual form.
  // Universal abbreviations like House `1/2/3/4` stay numeric across
  // locales; AI-translated forms still appear in clue text where they
  // read naturally.
  if (cat.ordered === true && cat.displayLabels) {
    const label = cat.displayLabels[valIdx];
    if (label === undefined) {
      throw new Error(
        `Category "${cat.name}" has displayLabels of length ${cat.displayLabels.length} but values has ${cat.values.length} entries (index ${valIdx} out of range)`,
      );
    }
    return label;
  }
  if (localization === null) return canonical;
  const localized = localization.valueLabels[canonical];
  if (localized === undefined) {
    throw new Error(
      `Localization is missing valueLabels entry for "${canonical}"`,
    );
  }
  return localized;
}
