import { describe, expect, it } from "vitest";
import { forwardShare, layerOrder, typeFlow } from "./layers";

describe("layerOrder", () => {
  it("puts pure senders first and pure receivers last", () => {
    // User -> Role -> Menu -> Page, plus Menu -> Menu which says nothing about order.
    const flow = typeFlow([
      { from: "User", to: "Role" }, { from: "Role", to: "Menu" }, { from: "Role", to: "Menu" },
      { from: "Menu", to: "Page" }, { from: "Menu", to: "Menu" },
    ]);
    expect(layerOrder(["Page", "Menu", "Role", "User"], flow)).toEqual(["User", "Role", "Menu", "Page"]);
    expect(forwardShare(layerOrder(["Page", "Menu", "Role", "User"], flow), flow)).toEqual({ forward: 4, total: 4 });
  });

  it("keeps a heavy edge forward when a cycle forces a choice", () => {
    // A -> B carries far more than B -> A, so A must come first.
    const flow = typeFlow([...Array(20).fill({ from: "A", to: "B" }), { from: "B", to: "A" }]);
    const order = layerOrder(["A", "B"], flow);
    expect(order).toEqual(["A", "B"]);
    expect(forwardShare(order, flow)).toEqual({ forward: 20, total: 21 });
  });

  it("orders every type even when nothing connects them", () => {
    const flow = typeFlow([]);
    expect(layerOrder(["b", "a"], flow).sort()).toEqual(["a", "b"]);
    expect(forwardShare(["a", "b"], flow)).toEqual({ forward: 0, total: 0 });
  });

  it("ignores relationships inside one type", () => {
    const flow = typeFlow([{ from: "A", to: "A" }, { from: "A", to: "B" }]);
    expect(flow.size).toBe(1);
    expect(layerOrder(["A", "B"], flow)).toEqual(["A", "B"]);
  });
});
