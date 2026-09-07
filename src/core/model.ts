// Common data contract. Every loader normalizes into this shape; every view reads only this.

export interface Entity {
  id: string;
  title: string;
  type: string;
  description?: string;
  /** Number of relationships touching the entity, counted after dangling ones are dropped. */
  degree: number;
  textUnitIds: string[];
}

export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  weight?: number;
  description?: string;
  textUnitIds: string[];
}

export interface Finding {
  summary: string;
  explanation: string;
}

export interface CommunityReport {
  summary: string;
  fullContent?: string;
  findings: Finding[];
  rank?: number;
  rankExplanation?: string;
}

/** Where the member list came from. GraphRAG <= 0.3 wrote no entity_ids, only relationship_ids. */
export type MembershipSource = "entity_ids" | "relationship_ids";

export interface Community {
  /** Community number as a string when numbers are unique across levels, otherwise the row id. Parent references use the same key. */
  id: string;
  /** Row id when the file carries one that differs from the number (GraphRAG >= 1.0 uses UUIDs). */
  uuid?: string;
  level: number;
  parentId: string | null;
  childIds: string[];
  title: string;
  entityIds: string[];
  relationshipIds: string[];
  size: number;
  membershipSource: MembershipSource;
  report?: CommunityReport;
  textUnitIds: string[];
}

export interface TextUnit {
  id: string;
  text: string;
  documentIds: string[];
  entityIds: string[];
  relationshipIds: string[];
  tokens?: number;
}

export interface Document {
  id: string;
  title: string;
  text?: string;
}

export interface Partition {
  id: string;
  label: string;
  communities: Map<string, Community>;
  /** Ascending. */
  levels: number[];
  /** Level of the parentless communities: 0 for GraphRAG, possibly the largest number for other sources. */
  rootLevel: number;
}

export type SourceKind = "graphrag" | "age-export" | "unknown";

export interface Dataset {
  source: { kind: SourceKind; files: string[] };
  entities: Map<string, Entity>;
  relationships: Relationship[];
  /** At least one when a communities table was loaded. Extra partitions come from `<label>_communities.parquet`. */
  partitions: Partition[];
  /** Source chunks and documents, when the index shipped them. */
  textUnits: Map<string, TextUnit>;
  documents: Map<string, Document>;
}
