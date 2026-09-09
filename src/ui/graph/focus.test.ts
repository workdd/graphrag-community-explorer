import cytoscape from "cytoscape";
import { describe, expect, it } from "vitest";
import { fadeable } from "./focus";

/** Two records inside one container, joined to each other and to a third record outside it. */
function graph(): cytoscape.Core {
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    elements: [
      { data: { id: "box" } },
      { data: { id: "a", parent: "box" } },
      { data: { id: "b", parent: "box" } },
      { data: { id: "c" } },
      { data: { id: "ab", source: "a", target: "b" } },
      { data: { id: "bc", source: "b", target: "c" } },
    ],
    style: [{ selector: "node.dim, edge.dim", style: { opacity: 0.28 } }],
  });
  return cy;
}

describe("fadeable", () => {
  it("leaves the containers out, so a record is never dimmed by the box it sits in", () => {
    const cy = graph();
    expect(fadeable(cy).map((element) => element.id()).sort()).toEqual(["a", "ab", "b", "bc", "c"]);
    cy.destroy();
  });

  it("keeps the clicked record and its neighbours at full opacity", () => {
    const cy = graph();
    const node = cy.getElementById("a");
    fadeable(cy).not(node.closedNeighborhood()).addClass("dim");
    expect(cy.getElementById("a").effectiveOpacity()).toBe(1);
    expect(cy.getElementById("b").effectiveOpacity()).toBe(1);
    // and what is not in the neighbourhood is faded but still on screen
    expect(cy.getElementById("c").effectiveOpacity()).toBeCloseTo(0.28, 5);
    cy.destroy();
  });

  it("would fade the clicked record too if the container were dimmed", () => {
    const cy = graph();
    const node = cy.getElementById("a");
    cy.elements().not(node.closedNeighborhood()).addClass("dim");
    // the regression this guards: the container carries its opacity into its children
    expect(cy.getElementById("a").effectiveOpacity()).toBeCloseTo(0.28, 5);
    cy.destroy();
  });
});
