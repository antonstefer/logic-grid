import { describe, it, expect } from "vitest";
import {
  sameHouse,
  notSameHouse,
  nextTo,
  notNextTo,
  leftOf,
  between,
  atPosition,
  notAtPosition,
} from "./constraints";

describe("constraint factories", () => {
  it("sameHouse", () => {
    expect(sameHouse("Red", "Cat")).toEqual({
      type: "same_house",
      a: "Red",
      b: "Cat",
    });
  });

  it("notSameHouse", () => {
    expect(notSameHouse("Red", "Cat")).toEqual({
      type: "not_same_house",
      a: "Red",
      b: "Cat",
    });
  });

  it("nextTo", () => {
    expect(nextTo("Red", "Cat")).toEqual({
      type: "next_to",
      a: "Red",
      b: "Cat",
    });
  });

  it("notNextTo", () => {
    expect(notNextTo("Red", "Cat")).toEqual({
      type: "not_next_to",
      a: "Red",
      b: "Cat",
    });
  });

  it("leftOf", () => {
    expect(leftOf("Blue", "Green")).toEqual({
      type: "left_of",
      a: "Blue",
      b: "Green",
    });
  });

  it("between", () => {
    expect(between("Red", "Cat", "Blue")).toEqual({
      type: "between",
      outer1: "Red",
      middle: "Cat",
      outer2: "Blue",
    });
  });

  it("atPosition", () => {
    expect(atPosition("Red", 0)).toEqual({
      type: "at_position",
      value: "Red",
      position: 0,
    });
  });

  it("notAtPosition", () => {
    expect(notAtPosition("Red", 2)).toEqual({
      type: "not_at_position",
      value: "Red",
      position: 2,
    });
  });
});
