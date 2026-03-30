import type { DeductionStep, DeductionTechnique } from "logic-grid";

// Clue-based techniques use question templates with {target} replaced by the
// value being deduced. Structural techniques are plain statements (no target).
export const TECHNIQUE_HINTS: Record<DeductionTechnique, string> = {
  direct: "where must {target} go?",
  elimination: "can you cross off a position for {target}?",
  same_house: "what positions can you rule out for {target}?",
  not_same_house: "what positions can you rule out for {target}?",
  next_to: "where can {target} go?",
  not_next_to: "what positions can you rule out for {target}?",
  left_of: "which edge positions are ruled out for {target}?",
  before: "which edge positions are ruled out for {target}?",
  between: "which positions are possible for {target}?",
  not_between: "which positions can {target} not be in?",
  exact_distance: "which positions are possible for {target}?",
  naked_single: "look for a value that can only go in one position",
  hidden_single: "look for a position that can only hold one value",
  naked_pair: "look for two values sharing the same two possible positions",
  naked_triple: "look for three values restricted to the same three positions",
  hidden_pair: "look for two positions that can only hold the same two values",
  hidden_triple:
    "look for three positions that can only hold the same three values",
  contradiction:
    "try assuming a value is in a position and see if it leads to a contradiction",
};

export function buildNudgeText(step: DeductionStep): string {
  const hintTemplate = TECHNIQUE_HINTS[step.technique];

  // Clue-based steps reference specific clues and substitute {target}.
  // Structural steps (clueIndices empty) use plain statements with no placeholder.
  if (step.clueIndices.length > 0) {
    const clueRefs = step.clueIndices.map((i) => `Clue ${i + 1}`).join(" and ");

    const assignValues = [...new Set(step.assignments.map((a) => a.value))];
    const elimValues = [...new Set(step.eliminations.map((e) => e.value))];

    // If this step places a value, use placement phrasing regardless of technique.
    if (assignValues.length > 0) {
      return `Try looking at ${clueRefs} \u2014 where must ${assignValues[0]} go?`;
    }

    // assignValues branch above handles all assignment cases, so elimValues
    // is guaranteed non-empty here (every step has at least one effect).
    const target = elimValues[0];
    return `Try looking at ${clueRefs} \u2014 ${hintTemplate.replace("{target}", target)}`;
  }

  return `Try a different approach \u2014 ${hintTemplate}.`;
}
