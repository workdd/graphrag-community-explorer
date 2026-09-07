import React, { useMemo } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import { Entity } from "../models/entity";
import { Community } from "../models/community";

export default function CommunityMap({ entities, communities }: { entities: Entity[]; communities: Community[] }) {
  const elements = useMemo(() => {
    const out: any[] = communities.map((c) => ({ data: { id: `c-${c.id}`, label: `${c.title} (${c.size ?? 0})`, level: c.level } }));
    const seen = new Set<string>();
    entities.forEach((e) => {
      const c = communities.find((x) => (x.entity_ids ?? []).includes(e.id));
      if (!c || seen.has(e.id)) return;
      seen.add(e.id); out.push({ data: { id: e.id, label: e.title, parent: `c-${c.id}`, kind: e.type } });
    });
    return out;
  }, [entities, communities]);
  return <CytoscapeComponent elements={elements} style={{ width: "100%", height: "calc(100vh - 140px)" }} layout={{ name: "cose", animate: false } as any} stylesheet={[{ selector: "node", style: { label: "data(label)", "font-size": 8, "background-color": "#4f46e5", color: "#172033", "text-wrap": "wrap", "text-max-width": 100 } }, { selector: ":parent", style: { "background-opacity": 0.12, "border-width": 2, "border-color": "#6366f1", shape: "roundrectangle", label: "data(label)", "text-valign": "top", "text-halign": "center" } }]} />;
}
