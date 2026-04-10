import { describe, it, expect } from "vitest";
import {
  samePosition,
  notSamePosition,
  nextTo,
  notNextTo,
  leftOf,
  between,
  notBetween,
  before,
  exactDistance,
  atPosition,
  notAtPosition,
} from "./constraints";

describe("constraint factories", () => {
  it("samePosition", () => {
    expect(samePosition("Red", "Cat")).toEqual({
      type: "same_position",
      a: "Red",
      b: "Cat",
    });
  });

  it("notSamePosition", () => {
    expect(notSamePosition("Red", "Cat")).toEqual({
      type: "not_same_position",
      a: "Red",
      b: "Cat",
    });
  });

  it("nextTo", () => {
    expect(nextTo("Red", "Cat", "House")).toEqual({
      type: "next_to",
      a: "Red",
      b: "Cat",
      axis: "House",
    });
  });

  it("notNextTo", () => {
    expect(notNextTo("Red", "Cat", "House")).toEqual({
      type: "not_next_to",
      a: "Red",
      b: "Cat",
      axis: "House",
    });
  });

  it("leftOf", () => {
    expect(leftOf("Blue", "Green", "House")).toEqual({
      type: "left_of",
      a: "Blue",
      b: "Green",
      axis: "House",
    });
  });

  it("between", () => {
    expect(between("Red", "Cat", "Blue", "House")).toEqual({
      type: "between",
      outer1: "Red",
      middle: "Cat",
      outer2: "Blue",
      axis: "House",
    });
  });

  it("notBetween", () => {
    expect(notBetween("Red", "Cat", "Blue", "House")).toEqual({
      type: "not_between",
      outer1: "Red",
      middle: "Cat",
      outer2: "Blue",
      axis: "House",
    });
  });

  it("before", () => {
    expect(before("Blue", "Green", "House")).toEqual({
      type: "before",
      a: "Blue",
      b: "Green",
      axis: "House",
    });
  });

  it("exactDistance", () => {
    expect(exactDistance("Red", "Cat", 2, "House")).toEqual({
      type: "exact_distance",
      a: "Red",
      b: "Cat",
      distance: 2,
      axis: "House",
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
