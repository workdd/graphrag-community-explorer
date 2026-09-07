export function validateDataset(entities: Record<string, any>[], relationships: Record<string, any>[], communities: Record<string, any>[]) {
  const ids=new Set(entities.map(e=>String(e.id)));
  const titles=new Set(entities.map(e=>String(e.title)));
  let missingMembers=0,missingParents=0,nonNested=0;
  for(const c of communities){
    for(const member of c.entity_ids??[]) if(!ids.has(String(member))) missingMembers++;
    if(c.parent==null || String(c.parent)==='-1') continue;
    const parent=communities.find(p=>String(p.id)===String(c.parent))??communities.find(p=>String(p.community)===String(c.parent));
    if(!parent){missingParents++;continue;}
    const parentMembers=new Set((parent.entity_ids??[]).map(String));
    if((c.entity_ids??[]).some((m:any)=>!parentMembers.has(String(m)))) nonNested++;
  }
  return {duplicateEntityIds:entities.length-ids.size,duplicateCommunityIds:communities.length-new Set(communities.map(c=>String(c.id))).size,missingMembers,missingParents,nonNested,danglingRelationships:relationships.filter(e=>!titles.has(String(e.source))||!titles.has(String(e.target))).length};
}
