import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { createPuzzleState } from "./puzzle-state.svelte";
import { defaultHouseCategory, type Category, type Clue } from "logic-grid";

/**
 * Locks in the originalClues invariant: every translatePuzzle call sends
 * the snapshot of the original English clues, not whatever happens to be
 * in `puzzle.clues` at the time. Without this, a German→French sequence
 * would send German text to the API under a "from English to French"
 * prompt header, misleading both the translator and the validator.
 *
 * `puzzle-state.svelte.ts` is excluded from coverage (Svelte 5 runes need
 * a DOM-aware harness in general), but vitest + the sveltekit plugin do
 * load runes in `.svelte.ts` for direct unit-style probes — enough to
 * lock in this single state-machine invariant via fetch-mock recording.
 */

const SAMPLE_CATEGORIES: Category[] = [
  defaultHouseCategory(3),
  {
    name: "Name",
    values: ["Alice", "Bob", "Carol"],
    noun: "",
    subjectPriority: 2,
  },
  {
    name: "Color",
    values: ["Red", "Blue", "Green"],
    noun: "house",
    verb: ["lives in the", "does not live in the"],
    valueSuffix: "house",
    lowercase: true,
    positionAdjective: ["is", "is not"],
    subjectPriority: -1,
  },
];

/** The part of a /api/translate request body these tests read. */
type TranslateRequest = { locale: string; puzzle: { clues: Clue[] } };

function makeValueLabels(
  categories: Category[],
  fn: (v: string) => string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cat of categories) {
    for (const v of cat.values) {
      out[v] = fn(v);
    }
  }
  return out;
}

describe("createPuzzleState — originalClues invariant", () => {
  let fetchMock: Mock<typeof fetch>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** The JSON body that the `n`th fetch call sent. */
  function sentBody(n: number): TranslateRequest {
    return JSON.parse(
      fetchMock.mock.calls[n][1]?.body as string,
    ) as TranslateRequest;
  }

  it("sends English source clues on every translatePuzzle call, even after a prior translation", async () => {
    const state = createPuzzleState();

    // Generate a puzzle. newPuzzle defers via setTimeout(0); no theme or
    // clueStyle means no /api/* fetches inside that path.
    state.newPuzzle({
      size: 3,
      categories: 3,
      customCategories: SAMPLE_CATEGORIES,
    });
    await vi.runAllTimersAsync();

    const puzzle = state.puzzle;
    expect(puzzle).not.toBeNull();
    const englishClues = puzzle!.clues;
    expect(englishClues.length).toBeGreaterThan(0);

    // First translation: respond with mock German.
    const germanText = englishClues.map((c, i) => ({
      ...c,
      text: `[de] clue ${i + 1}`,
    }));
    fetchMock.mockResolvedValueOnce(
      Response.json({
        clues: germanText,
        categoryNames: { House: "Haus", Name: "Name", Color: "Farbe" },
        valueLabels: makeValueLabels(SAMPLE_CATEGORIES, (v) => `[de]${v}`),
      }),
    );
    state.translatePuzzle("German");
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstBody = sentBody(0);
    expect(firstBody.locale).toBe("German");
    // First request: source clues match the canonical English text.
    expect(firstBody.puzzle.clues.map((c: { text: string }) => c.text)).toEqual(
      englishClues.map((c) => c.text),
    );

    // After first translation, puzzle.clues now hold the German text.
    expect(state.puzzle!.clues[0].text).toBe("[de] clue 1");

    // Second translation: respond with mock French.
    fetchMock.mockResolvedValueOnce(
      Response.json({
        clues: englishClues.map((c, i) => ({
          ...c,
          text: `[fr] clue ${i + 1}`,
        })),
        categoryNames: { House: "Maison", Name: "Nom", Color: "Couleur" },
        valueLabels: makeValueLabels(SAMPLE_CATEGORIES, (v) => `[fr]${v}`),
      }),
    );
    state.translatePuzzle("French");
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = sentBody(1);
    expect(secondBody.locale).toBe("French");
    // Critical assertion: still English, NOT the previously-translated
    // German text. This is the regression guard.
    expect(
      secondBody.puzzle.clues.map((c: { text: string }) => c.text),
    ).toEqual(englishClues.map((c) => c.text));
    expect(secondBody.puzzle.clues[0].text).not.toContain("[de]");
  });

  it("preserves originalClues when a regenerate attempt fails (theme 503)", async () => {
    const state = createPuzzleState();

    state.newPuzzle({
      size: 3,
      categories: 3,
      customCategories: SAMPLE_CATEGORIES,
    });
    await vi.runAllTimersAsync();
    const firstClues = state.puzzle!.clues.map((c) => c.text);

    // Attempt a themed regenerate that fails — /api/theme returns 503.
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { error: "AI theme generation is unavailable" },
        { status: 503 },
      ),
    );
    state.newPuzzle({
      size: 3,
      categories: 3,
      theme: "pirate adventure",
    });
    await vi.runAllTimersAsync();

    // Old puzzle stays visible because the assignment never happened in
    // the failed try block.
    expect(state.puzzle!.clues.map((c) => c.text)).toEqual(firstClues);

    // Critical: originalClues should still match the still-current
    // (first) puzzle, NOT have been wiped by the failed regenerate.
    // The Translate button must keep working.
    fetchMock.mockResolvedValueOnce(
      Response.json({
        clues: firstClues.map((_, i) => ({
          constraint: state.puzzle!.clues[i].constraint,
          text: `[de] ${i}`,
        })),
        categoryNames: { House: "Haus", Name: "Name", Color: "Farbe" },
        valueLabels: makeValueLabels(SAMPLE_CATEGORIES, (v) => `[de]${v}`),
      }),
    );
    state.translatePuzzle("German");
    await vi.runAllTimersAsync();

    // Body's source clues should be the (still-active) first puzzle's.
    const body = sentBody(1);
    expect(body.puzzle.clues.map((c: { text: string }) => c.text)).toEqual(
      firstClues,
    );
  });

  it("clears originalClues on regenerate so a stale snapshot can't leak", async () => {
    const state = createPuzzleState();

    state.newPuzzle({
      size: 3,
      categories: 3,
      customCategories: SAMPLE_CATEGORIES,
    });
    await vi.runAllTimersAsync();
    const firstClues = state.puzzle!.clues.map((c) => c.text);

    // Regenerate with a different seed effectively (different puzzle).
    state.newPuzzle({
      size: 3,
      categories: 3,
      customCategories: SAMPLE_CATEGORIES,
    });
    await vi.runAllTimersAsync();
    const secondClues = state.puzzle!.clues.map((c) => c.text);

    // Translate the second puzzle and verify the request uses the
    // SECOND puzzle's English clues, not the first.
    fetchMock.mockResolvedValueOnce(
      Response.json({
        clues: secondClues.map((_, i) => ({
          constraint: state.puzzle!.clues[i].constraint,
          text: `[de] ${i}`,
        })),
        categoryNames: { House: "Haus", Name: "Name", Color: "Farbe" },
        valueLabels: makeValueLabels(SAMPLE_CATEGORIES, (v) => `[de]${v}`),
      }),
    );
    state.translatePuzzle("German");
    await vi.runAllTimersAsync();

    const body = sentBody(0);
    expect(body.puzzle.clues.map((c: { text: string }) => c.text)).toEqual(
      secondClues,
    );
    // If originalClues had leaked from puzzle 1, the bodies would match
    // firstClues; deduce passing this assertion means the snapshot was
    // refreshed correctly.
    if (firstClues.join("|") !== secondClues.join("|")) {
      expect(
        body.puzzle.clues.map((c: { text: string }) => c.text),
      ).not.toEqual(firstClues);
    }
  });
});
