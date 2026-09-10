// The strip that chooses a view.
//
// Nine views is a lot to read as one undifferentiated row, so they are grouped by what you came to
// do: ask something, look around the index, or take it apart. The groups are wrappers the assistive
// tree ignores, so the tablist still contains only tabs.
//
// Keyboard follows the tab pattern rather than making every view its own stop: one stop for the
// whole strip, arrow keys between the views, Home and End to the ends. Disabled views are stepped
// over, because landing on something that cannot be opened is a dead end.
import { useRef, type KeyboardEvent } from "react";

export interface TabSpec {
  id: string;
  /** Already translated by the caller, which owns the wording. */
  label: string;
  title?: string;
  disabled?: boolean;
  /** A number worth carrying on the tab, such as how many things an index has to fix. */
  badge?: number;
  /** What the badge means, for a reader who cannot see it sitting on the tab. */
  badgeLabel?: string;
  onSelect: () => void;
}

interface Props {
  groups: TabSpec[][];
  active: string;
  /** Names the strip for a screen reader; the visible grouping carries no text of its own. */
  label: string;
  /** The element the tabs control. One panel is shown at a time, so they all point at it. */
  panelId: string;
}

export function ViewTabs({ groups, active, label, panelId }: Props) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const order = groups.flat().filter((tab) => !tab.disabled);

  const move = (from: string, step: number | "first" | "last") => {
    if (order.length === 0) return;
    const at = order.findIndex((tab) => tab.id === from);
    const next =
      step === "first"
        ? order[0]
        : step === "last"
          ? order[order.length - 1]
          : order[(Math.max(0, at) + step + order.length) % order.length];
    next.onSelect();
    buttons.current.get(next.id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      move(id, step);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      move(id, event.key === "Home" ? "first" : "last");
    }
  };

  return (
    <div className="views" role="tablist" aria-label={label}>
      {groups.map((group, index) => (
        <div className="view-group" role="none" key={index}>
          {group.map((tab) => (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) buttons.current.set(tab.id, el);
                else buttons.current.delete(tab.id);
              }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active === tab.id}
              aria-controls={panelId}
              // One stop for the strip: only the open view is reachable with Tab, the rest with arrows.
              tabIndex={active === tab.id ? 0 : -1}
              className={active === tab.id ? "active" : ""}
              disabled={tab.disabled}
              title={tab.title}
              onClick={() => tab.onSelect()}
              onKeyDown={(event) => onKeyDown(event, tab.id)}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 ? (
                <span className="tab-badge" aria-label={tab.badgeLabel}>
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
