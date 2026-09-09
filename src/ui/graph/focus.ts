import type cytoscape from "cytoscape";

/**
 * The elements a focus is allowed to fade.
 *
 * Cytoscape multiplies a compound container's opacity into everything inside it, so dimming the
 * type box or the community a record sits in fades that record too. Clicking one node would leave
 * the whole picture at a fraction of its opacity, including the node that was clicked. Containers
 * are therefore never dimmed: only the records and the links between them are.
 */
export function fadeable(cy: cytoscape.Core): cytoscape.CollectionReturnValue {
  return cy.elements().not(cy.nodes(":parent"));
}
