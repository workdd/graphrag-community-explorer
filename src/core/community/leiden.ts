// Leiden (Traag, Waltman and van Eck 2019) over the loaded graph, written so every phase can be
// watched: local moving, refinement and aggregation each report a snapshot. Deterministic for a
// given seed, so the same run can be replayed and stepped through.
import type { Dataset } from "../model";
import { seededRandom } from "../graph/seed";

/** Undirected weighted graph in compressed rows. Aggregation produces the same shape. */
export interface Graph {
  n: number;
  /** neighbour slice of node i is [offsets[i], offsets[i + 1]) */
  offsets: Int32Array;
  targets: Int32Array;
  weights: Float64Array;
  /** Weight of the loop at each node, created when a community is aggregated into one node. */
  selfLoops: Float64Array;
  /** Weighted degree, counting a self loop twice, as modularity does. */
  strength: Float64Array;
  /** Sum of edge weights, self loops included once. */
  totalWeight: number;
}

export type Phase = "start" | "moving" | "refinement" | "aggregation" | "done";

export interface LeidenStep {
  phase: Phase;
  /** Aggregation round: 0 while the original nodes are still being moved. */
  round: number;
  /** Sweep number inside local moving. */
  pass: number;
  /** Nodes that changed community in this step. */
  moved: number;
  communities: number;
  modularity: number;
  /** Nodes and edges of the graph being worked on, which shrinks with every aggregation. */
  workNodes: number;
  workEdges: number;
  /** Community index per original node. Indices are compact but not stable between steps. */
  membership: Int32Array;
  /** Original nodes that moved in this step, for highlighting. */
  movedNodes: Int32Array;
}

export interface LeidenOptions {
  /** Higher splits the graph into more, smaller communities. */
  resolution?: number;
  /** Randomness of the refinement merge; 0 is greedy. */
  theta?: number;
  seed?: number;
  maxRounds?: number;
  /** Called for every phase, in order. */
  onStep?: (step: LeidenStep) => void;
}

export interface LeidenResult {
  /** One membership per aggregation round, finest first. */
  levels: Int32Array[];
  modularity: number;
  rounds: number;
}

/** Node order of the graph; entity ids in this order are what memberships index into. */
export interface BuiltGraph {
  graph: Graph;
  entityIds: string[];
}

/**
 * Entities become nodes and relationships become undirected edges. Parallel edges are summed,
 * self loops are dropped: they cannot change which community a node belongs to.
 */
export function buildGraph(dataset: Dataset, entityIds?: string[]): BuiltGraph {
  const ids = entityIds ?? [...dataset.entities.keys()];
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const pairs = new Map<number, number>();
  const key = (a: number, b: number) => (a < b ? a * n + b : b * n + a);
  for (const relationship of dataset.relationships) {
    const a = index.get(relationship.sourceId);
    const b = index.get(relationship.targetId);
    if (a === undefined || b === undefined || a === b) continue;
    const weight = relationship.weight !== undefined && Number.isFinite(relationship.weight) && relationship.weight > 0 ? relationship.weight : 1;
    const k = key(a, b);
    pairs.set(k, (pairs.get(k) ?? 0) + weight);
  }
  const degree = new Int32Array(n);
  for (const k of pairs.keys()) {
    degree[Math.floor(k / n)] += 1;
    degree[k % n] += 1;
  }
  const offsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + degree[i];
  const targets = new Int32Array(offsets[n]);
  const weights = new Float64Array(offsets[n]);
  const cursor = Int32Array.from(offsets.subarray(0, n));
  for (const [k, weight] of pairs) {
    const a = Math.floor(k / n);
    const b = k % n;
    targets[cursor[a]] = b;
    weights[cursor[a]++] = weight;
    targets[cursor[b]] = a;
    weights[cursor[b]++] = weight;
  }
  const selfLoops = new Float64Array(n);
  const strength = new Float64Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let e = offsets[i]; e < offsets[i + 1]; e++) sum += weights[e];
    strength[i] = sum;
    total += sum;
  }
  return { graph: { n, offsets, targets, weights, selfLoops, strength, totalWeight: total / 2 }, entityIds: ids };
}

/** Newman modularity of a membership, with the resolution the run used. */
export function modularity(graph: Graph, membership: Int32Array, resolution = 1): number {
  const m = graph.totalWeight;
  if (m === 0) return 0;
  const inside = new Map<number, number>();
  const total = new Map<number, number>();
  for (let i = 0; i < graph.n; i++) {
    const c = membership[i];
    total.set(c, (total.get(c) ?? 0) + graph.strength[i]);
    inside.set(c, (inside.get(c) ?? 0) + graph.selfLoops[i]);
    for (let e = graph.offsets[i]; e < graph.offsets[i + 1]; e++) {
      if (membership[graph.targets[e]] === c) inside.set(c, (inside.get(c) ?? 0) + graph.weights[e] / 2);
    }
  }
  let q = 0;
  for (const [c, weight] of inside) {
    const tot = total.get(c) ?? 0;
    q += weight / m - resolution * (tot / (2 * m)) ** 2;
  }
  return q;
}

/** Renumbers a membership so the indices are 0..k-1 in order of first appearance. */
function compact(membership: Int32Array): { membership: Int32Array; count: number } {
  const seen = new Map<number, number>();
  const out = new Int32Array(membership.length);
  for (let i = 0; i < membership.length; i++) {
    let id = seen.get(membership[i]);
    if (id === undefined) {
      id = seen.size;
      seen.set(membership[i], id);
    }
    out[i] = id;
  }
  return { membership: out, count: seen.size };
}

/** Weighted degree of each community, which the modularity gain needs. */
function communityStrength(graph: Graph, membership: Int32Array, size: number): Float64Array {
  const total = new Float64Array(size);
  for (let i = 0; i < graph.n; i++) total[membership[i]] += graph.strength[i];
  return total;
}

/**
 * One sweep of local moving: every node leaves its community and joins the neighbouring one with
 * the largest modularity gain. Returns how many nodes actually moved.
 */
function moveSweep(graph: Graph, membership: Int32Array, total: Float64Array, resolution: number, order: Int32Array): number {
  const m2 = 2 * graph.totalWeight;
  if (m2 === 0) return 0;
  const linkTo = new Map<number, number>();
  let moved = 0;
  for (const i of order) {
    const from = membership[i];
    linkTo.clear();
    linkTo.set(from, 0);
    for (let e = graph.offsets[i]; e < graph.offsets[i + 1]; e++) {
      const c = membership[graph.targets[e]];
      linkTo.set(c, (linkTo.get(c) ?? 0) + graph.weights[e]);
    }
    total[from] -= graph.strength[i];
    let best = from;
    let bestGain = (linkTo.get(from) ?? 0) - (resolution * graph.strength[i] * total[from]) / m2;
    for (const [c, weight] of linkTo) {
      if (c === from) continue;
      const gain = weight - (resolution * graph.strength[i] * total[c]) / m2;
      if (gain > bestGain + 1e-12) {
        bestGain = gain;
        best = c;
      }
    }
    total[best] += graph.strength[i];
    if (best !== from) {
      membership[i] = best;
      moved += 1;
    }
  }
  return moved;
}

/**
 * Leiden's refinement. Inside each community found by local moving, every node starts alone and
 * merges only with sub-communities of that same community, and only where the merge is an
 * improvement. This is what keeps every community internally connected, which plain Louvain does
 * not guarantee. The choice among improving merges is randomised by theta.
 */
function refine(graph: Graph, membership: Int32Array, resolution: number, theta: number, random: () => number): Int32Array {
  const refined = new Int32Array(graph.n);
  for (let i = 0; i < graph.n; i++) refined[i] = i;
  const total = new Float64Array(graph.n);
  for (let i = 0; i < graph.n; i++) total[i] = graph.strength[i];
  const m2 = 2 * graph.totalWeight;
  if (m2 === 0) return refined;
  const order = shuffled(graph.n, random);
  const linkTo = new Map<number, number>();
  for (const i of order) {
    // Only nodes still on their own can start a merge, which keeps sub-communities from drifting apart.
    if (total[refined[i]] !== graph.strength[i]) continue;
    const parent = membership[i];
    linkTo.clear();
    for (let e = graph.offsets[i]; e < graph.offsets[i + 1]; e++) {
      const j = graph.targets[e];
      if (membership[j] !== parent) continue;
      linkTo.set(refined[j], (linkTo.get(refined[j]) ?? 0) + graph.weights[e]);
    }
    const candidates: { community: number; gain: number }[] = [];
    for (const [c, weight] of linkTo) {
      if (c === refined[i]) continue;
      const gain = weight - (resolution * graph.strength[i] * total[c]) / m2;
      if (gain > 1e-12) candidates.push({ community: c, gain });
    }
    if (candidates.length === 0) continue;
    const pick = theta <= 0 ? bestOf(candidates) : sampleByGain(candidates, theta, random);
    total[refined[i]] -= graph.strength[i];
    total[pick] += graph.strength[i];
    refined[i] = pick;
  }
  return refined;
}

function bestOf(candidates: { community: number; gain: number }[]): number {
  let best = candidates[0];
  for (const candidate of candidates) if (candidate.gain > best.gain) best = candidate;
  return best.community;
}

/** Softmax over the gains: better merges are likelier, but not certain, which is how Leiden escapes local optima. */
function sampleByGain(candidates: { community: number; gain: number }[], theta: number, random: () => number): number {
  const top = Math.max(...candidates.map((c) => c.gain));
  const weights = candidates.map((c) => Math.exp((c.gain - top) / theta));
  const sum = weights.reduce((a, b) => a + b, 0);
  let roll = random() * sum;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i].community;
  }
  return candidates[candidates.length - 1].community;
}

function shuffled(n: number, random: () => number): Int32Array {
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return order;
}

/** Collapses each community into one node, keeping the weights between and inside them. */
function aggregate(graph: Graph, membership: Int32Array, size: number): Graph {
  const pairs = new Map<number, number>();
  const selfLoops = new Float64Array(size);
  for (let i = 0; i < graph.n; i++) {
    const a = membership[i];
    selfLoops[a] += graph.selfLoops[i];
    for (let e = graph.offsets[i]; e < graph.offsets[i + 1]; e++) {
      const j = graph.targets[e];
      const b = membership[j];
      if (a === b) {
        if (i < j) selfLoops[a] += graph.weights[e];
        continue;
      }
      if (a > b) continue;
      const k = a * size + b;
      pairs.set(k, (pairs.get(k) ?? 0) + graph.weights[e]);
    }
  }
  const degree = new Int32Array(size);
  for (const k of pairs.keys()) {
    degree[Math.floor(k / size)] += 1;
    degree[k % size] += 1;
  }
  const offsets = new Int32Array(size + 1);
  for (let i = 0; i < size; i++) offsets[i + 1] = offsets[i] + degree[i];
  const targets = new Int32Array(offsets[size]);
  const weights = new Float64Array(offsets[size]);
  const cursor = Int32Array.from(offsets.subarray(0, size));
  for (const [k, weight] of pairs) {
    const a = Math.floor(k / size);
    const b = k % size;
    targets[cursor[a]] = b;
    weights[cursor[a]++] = weight;
    targets[cursor[b]] = a;
    weights[cursor[b]++] = weight;
  }
  const strength = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    let sum = 2 * selfLoops[i];
    for (let e = offsets[i]; e < offsets[i + 1]; e++) sum += weights[e];
    strength[i] = sum;
  }
  return { n: size, offsets, targets, weights, selfLoops, strength, totalWeight: graph.totalWeight };
}

const edgeCount = (graph: Graph): number => graph.offsets[graph.n] / 2;

/**
 * Runs Leiden to convergence, reporting every phase. Each aggregation round is one level of the
 * hierarchy: the first is the finest grouping, the last is the coarsest.
 */
export function runLeiden(original: Graph, options: LeidenOptions = {}): LeidenResult {
  const resolution = options.resolution ?? 1;
  const theta = options.theta ?? 0.01;
  const maxRounds = options.maxRounds ?? 12;
  const onStep = options.onStep;
  const random = seededRandom(String(options.seed ?? 1));

  // Position of every original node in the graph currently being worked on.
  const place = new Int32Array(original.n);
  for (let i = 0; i < original.n; i++) place[i] = i;
  const project = (membership: Int32Array): Int32Array => {
    const out = new Int32Array(original.n);
    for (let i = 0; i < original.n; i++) out[i] = membership[place[i]];
    return out;
  };

  let graph = original;
  let membership: Int32Array = new Int32Array(graph.n);
  for (let i = 0; i < graph.n; i++) membership[i] = i;
  const levels: Int32Array[] = [];
  let previous = project(membership);
  const report = (phase: Phase, round: number, pass: number, moved: number): Int32Array => {
    const projected = project(membership);
    const { count } = compact(projected);
    if (onStep) {
      const changed: number[] = [];
      for (let i = 0; i < original.n; i++) if (projected[i] !== previous[i]) changed.push(i);
      onStep({
        phase, round, pass, moved,
        communities: count,
        modularity: modularity(original, projected, resolution),
        workNodes: graph.n,
        workEdges: edgeCount(graph),
        membership: projected,
        movedNodes: Int32Array.from(phase === "moving" || phase === "refinement" ? changed : []),
      });
    }
    previous = projected;
    return projected;
  };

  report("start", 0, 0, 0);
  let round = 0;
  for (; round < maxRounds; round++) {
    let total = communityStrength(graph, membership, graph.n);
    let pass = 0;
    let movedInRound = 0;
    for (; pass < 32; pass++) {
      const moved = moveSweep(graph, membership, total, resolution, shuffled(graph.n, random));
      movedInRound += moved;
      const packed = compact(membership);
      membership = packed.membership;
      total = communityStrength(graph, membership, packed.count);
      report("moving", round, pass + 1, moved);
      if (moved === 0) break;
    }
    const packed = compact(membership);
    membership = packed.membership;
    // An aggregated graph whose nodes all stay put is already at the best partition this method
    // finds, so the run stops instead of repeating the same level.
    if (round > 0 && movedInRound === 0) break;
    levels.push(project(membership));
    // Nothing left to collapse: every node is already its own community.
    if (packed.count === graph.n) break;

    const refined = compact(refine(graph, membership, resolution, theta, random));
    report("refinement", round, pass + 1, refined.count - packed.count);
    // The aggregate graph has one node per refined sub-community, and each keeps the community it
    // came from, so the next round continues from the partition local moving found.
    const parentOf = new Int32Array(refined.count);
    for (let i = 0; i < graph.n; i++) parentOf[refined.membership[i]] = membership[i];
    graph = aggregate(graph, refined.membership, refined.count);
    for (let i = 0; i < original.n; i++) place[i] = refined.membership[place[i]];
    membership = parentOf;
    report("aggregation", round, pass + 1, 0);
    if (graph.n <= 1) break;
  }
  const final = project(membership);
  report("done", round, 0, 0);
  return { levels, modularity: modularity(original, final, resolution), rounds: levels.length };
}
