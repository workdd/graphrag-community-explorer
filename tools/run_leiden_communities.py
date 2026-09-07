#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["psycopg[binary]>=3.2,<4", "python-dotenv>=1,<2", "igraph>=0.11,<1", "leidenalg>=0.10,<1", "pyarrow>=18,<24"]
# ///
"""Read AGE, run Leiden, and write a comparison artifact. AGE is never modified."""
from __future__ import annotations
import argparse, json, math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
import pyarrow as pa, pyarrow.parquet as pq
import igraph as ig
import leidenalg
from dotenv import dotenv_values
from export_age_parquet import read_snapshot

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--env-file',required=True); ap.add_argument('--graph',required=True); ap.add_argument('--output',required=True); ap.add_argument('--seed',type=int,default=42); ap.add_argument('--resolution',type=float,default=1.0); args=ap.parse_args()
    vs, es=read_snapshot(dotenv_values(args.env_file), args.graph)
    res=[v for v in vs if v['label']=='Resource']; by={v['id']:v for v in res}
    edges=[e for e in es if e['source'] in by and e['target'] in by and e['source']!=e['target']]
    # undirected weighted projection: AGE has directed typed relations, community detection uses connectivity.
    weights=Counter(tuple(sorted((e['source'],e['target']))) for e in edges)
    ids=sorted(by, key=lambda x:int(x)); idx={x:i for i,x in enumerate(ids)}
    pairs=[(idx[a],idx[b]) for a,b in weights]; G=ig.Graph(n=len(ids), edges=pairs, directed=False)
    G.es['weight']=[weights[(ids[a],ids[b])] for a,b in pairs]
    comps=G.components(); lcc=max(comps, key=len) if comps else []
    lcc_set=set(lcc); sub=G.induced_subgraph(lcc)
    resolutions=[max(.2,args.resolution*.35),args.resolution,max(1.8,args.resolution*1.8)]; parts=[]
    for r in resolutions: parts.append(leidenalg.find_partition(sub, leidenalg.RBConfigurationVertexPartition, weights='weight', resolution_parameter=r, seed=args.seed))
    groups_by_level=[[sorted(ids[lcc[i]] for i in members) for members in p] for p in parts]
    part=parts[1]; groups=groups_by_level[1]
    out=Path(args.output); out.mkdir(parents=True,exist_ok=True)
    rows=[]; memberships=[]
    allrows=[]
    for lev, level_groups in enumerate(groups_by_level, start=1):
      for n,members in enumerate(level_groups):
        cid=f'leiden:L{lev}:{n:04d}'; kinds=Counter(by[x]['properties'].get('kind','Resource') for x in members)
        title=' / '.join(k for k,_ in kinds.most_common(3))
        parent=None
        if lev>1:
          overlaps=[(len(set(members)&set(pg)),pi) for pi,pg in enumerate(groups_by_level[lev-2])]
          if overlaps: parent=f'leiden:L{lev-1}:{max(overlaps)[1]:04d}'
        rows.append({'id':cid,'community':n,'level':lev,'parent':parent,'title':title,'entity_ids':members,'size':len(members),'modularity':float(parts[lev-1].modularity),'method':'Hierarchical Leiden (resolution ladder)','resolution':resolutions[lev-1],'seed':args.seed})
        memberships += [{'entity_id':x,'community':cid,'level':lev} for x in members]
    pq.write_table(pa.Table.from_pylist(rows),out/'communities.parquet'); pq.write_table(pa.Table.from_pylist(memberships),out/'entity_communities.parquet')
    assigned=set(x for g in groups for x in g); internal=sum(w for (a,b),w in weights.items() if a in assigned and b in assigned and any(a in g and b in g for g in groups)); total=sum(weights.values())
    op_edges=[e for e in es if e['label']=='inCommunity' and e['source'] in by]
    op_assigned={e['source'] for e in op_edges}; op_groups=defaultdict(set)
    for e in op_edges: op_groups[e['target']].add(e['source'])
    op_internal=sum(w for (a,b),w in weights.items() if any(a in g and b in g for g in op_groups.values()))
    manifest={'created_at':datetime.now(timezone.utc).isoformat(),'graph':args.graph,'nodes':len(ids),'edges':len(edges),'lcc_nodes':len(lcc_set),'orphan_nodes':len(ids)-len(lcc_set),'communities':len(groups),'assigned':len(assigned),'coverage':len(assigned)/len(ids) if ids else 0,'modularity':float(part.modularity),'internal_edge_weight_ratio':internal/total if total else 0,'operational':{'community_nodes':sum(1 for v in vs if v['label']=='Community'),'distinct_ids':len({v['properties'].get('id') for v in vs if v['label']=='Community'}),'membership_edges':len(op_edges),'assigned_resources':len(op_assigned),'coverage':len(op_assigned)/len(ids) if ids else 0,'internal_edge_weight_ratio':op_internal/total if total else 0},'resolution':args.resolution,'seed':args.seed,'note':'LCC-only Leiden; non-LCC resources remain unassigned. AGE is read-only.'}
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps(manifest,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
