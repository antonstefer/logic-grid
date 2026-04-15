import type { Category } from "./types";

/**
 * Default non-position category pool for the classic Einstein's riddle style.
 * When the user provides no `categoryNames`, `buildGrid` slices from this pool.
 * None of these are ordered — an ordered "House" category is auto-prepended
 * by `buildGrid` when no ordered category is present.
 */
export const DEFAULT_CATEGORIES: Category[] = [
  {
    name: "Name",
    noun: "",
    subjectPriority: 2,
    values: ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Hank"],
  },
  {
    name: "Color",
    noun: "house",
    verb: ["lives in the", "does not live in the"],
    subjectPriority: -1,
    lowercase: true,
    valueSuffix: "house",
    positionAdjective: ["is", "is not"],
    values: [
      "Red",
      "Blue",
      "Green",
      "Yellow",
      "White",
      "Orange",
      "Purple",
      "Pink",
    ],
  },
  {
    name: "Pet",
    noun: "owner",
    verb: ["owns the", "does not own the"],
    subjectPriority: 1,
    lowercase: true,
    values: [
      "Cat",
      "Dog",
      "Fish",
      "Bird",
      "Rabbit",
      "Turtle",
      "Hamster",
      "Snake",
    ],
  },
  {
    name: "Drink",
    noun: "drinker",
    verb: ["drinks", "does not drink"],
    subjectPriority: 1,
    lowercase: true,
    values: ["Tea", "Coffee", "Water", "Milk", "Juice", "Soda", "Wine", "Beer"],
  },
  {
    name: "Food",
    noun: "lover",
    verb: ["eats", "does not eat"],
    subjectPriority: 1,
    lowercase: true,
    values: [
      "Pizza",
      "Pasta",
      "Sushi",
      "Tacos",
      "Salad",
      "Steak",
      "Curry",
      "Soup",
    ],
  },
  {
    name: "Hobby",
    noun: "enthusiast",
    verb: ["enjoys", "does not enjoy"],
    subjectPriority: 1,
    lowercase: true,
    values: [
      "Reading",
      "Painting",
      "Knitting",
      "Gardening",
      "Photography",
      "Origami",
      "Pottery",
      "Woodwork",
    ],
  },
  {
    name: "Music",
    noun: "fan",
    verb: ["listens to", "does not listen to"],
    subjectPriority: 1,
    lowercase: true,
    values: ["Jazz", "Rock", "Pop", "Blues", "Folk", "Reggae", "Metal", "Punk"],
  },
  {
    name: "Sport",
    noun: "player",
    verb: ["plays", "does not play"],
    subjectPriority: 1,
    lowercase: true,
    values: [
      "Soccer",
      "Tennis",
      "Golf",
      "Baseball",
      "Rugby",
      "Cricket",
      "Hockey",
      "Basketball",
    ],
  },
];

/**
 * Build the auto-added House ordered category. Used by `buildGrid` when the
 * user supplies no ordered category. noun + valueSuffix both set so label()
 * yields "the first house" (subject form) and objectValue() yields "first
 * house" (object form). Combined with the verb this renders
 * `same_position(Alice, "first")` as "Alice lives in the first house" and
 * `same_position(Red, "first")` (via the positionAdjective rule on Color) as
 * "The first house is red" — recovering the classical rendering exactly.
 */
export function defaultHouseCategory(size: number): Category {
  const ordinals = [
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
  ];
  return {
    name: "House",
    noun: "house",
    verb: ["lives in the", "does not live in the"],
    valueSuffix: "house",
    ordered: true,
    values: ordinals.slice(0, size),
    // Grid headers show "1, 2, 3..." while clues use "first house, second house..."
    displayLabels: Array.from({ length: size }, (_, i) => String(i + 1)),
    orderingPhrases: {
      unit: ["house", "houses"],
      comparators: {
        before: ["lives somewhere left of", "lives somewhere right of"],
        left_of: ["lives directly left of", "lives directly right of"],
        next_to: "lives next to",
        not_next_to: "does not live next to",
        between: "lives somewhere between",
        not_between: "does not live somewhere between",
        exact_distance: "lives exactly",
      },
    },
  };
}
