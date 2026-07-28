import { describe, expect, test } from "bun:test";
import {
  contextMenuTargets,
  extendSelectionRange,
  toggleAllSelection,
  toggleSelection,
} from "../src/lib/selection";

const order = ["a", "b", "c", "d", "e"];

describe("selection model", () => {
  test("toggles without mutating the prior selection", () => {
    const current = new Set(["a"]);
    const next = toggleSelection(current, "b");

    expect([...current]).toEqual(["a"]);
    expect([...next]).toEqual(["a", "b"]);
    expect([...toggleSelection(next, "a")]).toEqual(["b"]);
  });

  test("extends an inclusive range forward and backward", () => {
    expect([...extendSelectionRange(new Set(["b"]), "b", "e", order)]).toEqual([
      "b",
      "c",
      "d",
      "e",
    ]);
    expect([...extendSelectionRange(new Set(["d"]), "d", "a", order)]).toEqual([
      "d",
      "a",
      "b",
      "c",
    ]);
  });

  test("preserves an existing disjoint selection when extending a range", () => {
    expect([...extendSelectionRange(new Set(["a", "e"]), "e", "c", order)]).toEqual([
      "a",
      "e",
      "c",
      "d",
    ]);
  });

  test("falls back safely when the anchor is missing or stale", () => {
    expect([...extendSelectionRange(new Set(["a"]), null, "c", order)]).toEqual(["c"]);
    expect([...extendSelectionRange(new Set(["a"]), "missing", "c", order)]).toEqual([
      "a",
      "c",
    ]);
  });

  test("selects every row, then clears when every row is selected", () => {
    expect([...toggleAllSelection(new Set(["b"]), order)]).toEqual(order);
    expect([...toggleAllSelection(new Set(order), order)]).toEqual([]);
  });

  test("does not change selection when there are no rows", () => {
    expect([...toggleAllSelection(new Set(["stale"]), [])]).toEqual(["stale"]);
  });
});

describe("context-menu targets", () => {
  test("uses the full selection when right-clicking a selected row", () => {
    expect(contextMenuTargets("b", new Set(["a", "b", "c"]))).toEqual(["a", "b", "c"]);
  });

  test("uses only the clicked row when it is outside the selection", () => {
    expect(contextMenuTargets("d", new Set(["a", "b", "c"]))).toEqual(["d"]);
  });

  test("uses one target for an empty or single selection", () => {
    expect(contextMenuTargets("a", new Set())).toEqual(["a"]);
    expect(contextMenuTargets("a", new Set(["a"]))).toEqual(["a"]);
  });
});
