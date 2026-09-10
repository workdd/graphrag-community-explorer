// Keyboard movement inside a table of selectable rows.
//
// Every row being its own tab stop reads as an improvement on a sample with 29 of them and as a
// wall on an index with 1,537: a keyboard user would press Tab 1,537 times to reach whatever is
// under the table. So the table holds one stop, the arrows move inside it, and Enter or Space
// selects. This is the pattern the view strip already uses, applied to rows.
import type { KeyboardEvent } from "react";

/**
 * Which row of a set carries the tab stop. The selected one, or the first when the selection is not
 * in this set: filtering must never leave a table nobody can reach.
 */
export const rowIsTabbable = (index: number, id: string, selectedId: string | null, ids: string[]): boolean =>
  selectedId !== null && ids.includes(selectedId) ? id === selectedId : index === 0;

/** Enter and Space select; the arrows, Home and End move focus without selecting. */
export function onRowKeys(event: KeyboardEvent<HTMLTableRowElement>, select: () => void): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    select();
    return;
  }
  const row = event.currentTarget;
  const body = row.parentElement;
  if (!body) return;
  const rows = [...body.children].filter((el): el is HTMLTableRowElement => el instanceof HTMLTableRowElement);
  const at = rows.indexOf(row);
  const next =
    event.key === "ArrowDown" ? rows[at + 1]
    : event.key === "ArrowUp" ? rows[at - 1]
    : event.key === "Home" ? rows[0]
    : event.key === "End" ? rows[rows.length - 1]
    : undefined;
  if (!next) return;
  event.preventDefault();
  next.focus();
}
