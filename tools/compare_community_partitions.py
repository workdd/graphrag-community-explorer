#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["psycopg[binary]>=3.2,<4", "python-dotenv>=1,<2", "pyarrow>=18,<24"]
# ///
from __future__ import annotations
import argparse, json, math
from collections import Counter, defaultdict
from pathlib import Path
from dotenv import dotenv_values
from export_age_parquet import read_snapshot

def scores(a,b):
    keys=[k for k in a if k in b]; n=len(keys)
    if n<2:return {'n':n,'nmi':0,'ari':0}
    ca,cb,cab=Counter(),Counter(),Counter()
    for k in keys: ca[a[k]]+=1; cb[b[k]]+=1; cab[(a[k],b[k])]+=1
    h=lambda c:-sum(v/n*math.log(v/n) for v in c.values() if v)
    ha,hb=h(ca),h(cb); mi=sum(v/n*math.log((v/n)/((ca[x]/n)*(cb[y]/n))) for (x,y),v in cab.items())
    comb=lambda x:x*(x-1)/2; sa=sum(comb(v) for v in ca.values()); sb=sum(comb(v) for v in cb.values()); sij=sum(comb(v) for v in cab.values()); den=comb(n); exp=sa*sb/den; mx=(sa+sb)/2
    return {'n':n,'nmi':round(mi/math.sqrt(ha*hb),3) if ha and hb else 0,'ari':round((sij-exp)/(mx-exp),3) if mx!=exp else 0}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--env-file',required=True); ap.add_argument('--graph',required=True); ap.add_argument('--leiden-dir',required=True); ap.add_argument('--output',required=True); args=ap.parse_args()
    vs,es=read_snapshot(dotenv_values(args.env_file),args.graph); resources={v['id']:v for v in vs if v['label']=='Resource'}
    op={}; groups=defaultdict(set)
    for e in es:
        if e['label']=='inCommunity' and e['source'] in resources:
            cid=e['target']; groups[cid].add(e['source']); op[e['source']]=cid
    leiden={}
    for row in json.loads('[]') if False else []: pass
    import pyarrow.parquet as pq
    for row in pq.read_table(Path(args.leiden_dir)/'entity_communities.parquet').to_pylist(): leiden[row['entity_id']]=row['community']
    common={k for k in op if k in leiden}; result={'operational_groups':len(groups),'operational_coverage':len(op)/len(resources),'leiden_groups':len(set(leiden.values())),'leiden_coverage':len(leiden)/len(resources),'overlap':scores(op,leiden),'common_nodes':len(common)}
    pairs=Counter((op[k],leiden[k]) for k in common)
    result['top_overlaps']=[{'operational':a,'leiden':b,'intersection':n,'operational_size':len(groups[a])} for (a,b),n in pairs.most_common(20)]
    out=Path(args.output); out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8'); print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=='__main__':main()
