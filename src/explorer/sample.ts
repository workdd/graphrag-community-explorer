// Entirely synthetic example; no production identifiers or statistics.
export function sampleDataset() {
  const entities = Array.from({length:24},(_,i)=>({id:`demo-${i}`,title:`Example service ${i+1}`,type:i%3===0?'Database':'Service'}));
  const operational=Array.from({length:3},(_,i)=>({id:`group-${i}`,title:['Commerce','Content','Identity'][i],level:0,entity_ids:entities.slice(i*8,i*8+8).map(e=>e.id)}));
  const relationships=entities.filter((_,i)=>i%8!==7).map((e,i)=>({id:`edge-${i}`,source:e.title,target:entities[entities.indexOf(e)+1].title,type:'CALLS'}));
  return {entities,operational,relationships,leiden:[]};
}
