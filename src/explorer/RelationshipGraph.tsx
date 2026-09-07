import React, {useEffect, useMemo, useRef, useState} from 'react';
import cytoscape, {Core} from 'cytoscape';

type Row=Record<string, any>;
const label=(s:any)=>String(s??'').replace(/\s*\[AGE:.*$/,'').replace(/^[^·]+·\s*/,'');
const palette=['#247f77','#5879c6','#ad7542','#9964b5','#be637b','#64813b'];

// Owns its renderer and graph objects; never mutates the imported dataset.
export default function RelationshipGraph({members,relationships,onSelect}:{members:Row[],relationships:Row[],onSelect:(id:string)=>void}){
  const host=useRef<HTMLDivElement>(null); const cy=useRef<Core>();
  const selectCallback=useRef(onSelect); selectCallback.current=onSelect;
  const [relation,setRelation]=useState('all'); const [direction,setDirection]=useState('both');
  const [selected,setSelected]=useState(''); const [pickedEdge,setPickedEdge]=useState<Row|null>(null);
  const [labels,setLabels]=useState(false); const [limit,setLimit]=useState(150);
  const [layout,setLayout]=useState('concentric'); const [search,setSearch]=useState('');
  const [expanded,setExpanded]=useState(false);
  const types=Array.from(new Set(relationships.map(r=>String(r.type||'관계')))).sort();
  const graph=useMemo(()=>{
    const filtered=relationships.filter(r=>relation==='all'||String(r.type||'관계')===relation);
    const degree=new Map<string,number>();
    filtered.forEach(r=>[r.source,r.target].forEach(t=>degree.set(String(t),(degree.get(String(t))??0)+1)));
    const ranked=members.slice().sort((a,b)=>(degree.get(String(b.title))??0)-(degree.get(String(a.title))??0)||String(a.id).localeCompare(String(b.id)));
    const shown=ranked.slice(0,limit); const byTitle=new Map(shown.map(e=>[String(e.title),String(e.id)]));
    const kinds=Array.from(new Set(members.map(e=>String(e.type||'Resource')))).sort();
    const edges=filtered.filter(r=>byTitle.has(String(r.source))&&byTitle.has(String(r.target)));
    return {shown,edges,filteredCount:filtered.length,kinds,elements:[...shown.map(e=>({data:{id:'n:'+String(e.id),resourceId:String(e.id),label:label(e.title),kind:String(e.type||'Resource'),color:palette[kinds.indexOf(String(e.type||'Resource'))%palette.length]}})),...edges.map((e,i)=>({data:{id:'e:'+i,source:'n:'+byTitle.get(String(e.source)),target:'n:'+byTitle.get(String(e.target)),label:String(e.type||'관계'),index:i}}))]};
  },[members,relationships,relation,limit]);

  useEffect(()=>{
    if(!host.current)return;
    const instance=cytoscape({container:host.current,elements:graph.elements,minZoom:.08,maxZoom:4,wheelSensitivity:.18,layout:{name:'preset'},style:[
      {selector:'node',style:{width:24,height:24,'background-color':'data(color)','border-width':2,'border-color':'#fff',label:'data(label)','font-family':'Apple SD Gothic Neo, Malgun Gothic, sans-serif','font-size':13,'text-valign':'bottom','text-margin-y':10,'text-wrap':'wrap','text-max-width':150,'text-background-color':'#fbfcfd','text-background-opacity':.95,'text-background-padding':'3px',color:'#233b52'}},
      {selector:'edge',style:{width:1.6,'line-color':'#8a9fb4','target-arrow-color':'#8a9fb4','target-arrow-shape':'triangle','arrow-scale':1.3,'curve-style':'bezier','control-point-step-size':50,'font-size':11,'text-rotation':'autorotate','text-background-color':'#fff','text-background-opacity':1,'text-background-padding':'3px',color:'#294254'}},
      {selector:'.dim',style:{opacity:.12}},
      {selector:'node.focus',style:{'border-color':'#e88730','border-width':5}},
      {selector:'edge.outgoing',style:{width:3,'line-color':'#178a7d','target-arrow-color':'#178a7d',label:'data(label)'}},
      {selector:'edge.incoming',style:{width:3,'line-color':'#7760bf','target-arrow-color':'#7760bf',label:'data(label)'}},
      {selector:'edge.chosen',style:{width:4,'line-color':'#d98228','target-arrow-color':'#d98228',label:'data(label)'}}
    ]});
    cy.current=instance;
    instance.on('tap','node',event=>{setSelected(event.target.id());setPickedEdge(null);selectCallback.current(event.target.data('resourceId'));});
    instance.on('tap','edge',event=>{setPickedEdge(graph.edges[event.target.data('index')]);instance.edges().removeClass('chosen');event.target.addClass('chosen');});
    instance.on('tap',event=>{if(event.target===instance){setSelected('');setPickedEdge(null);selectCallback.current('');}});
    const observer=new ResizeObserver(()=>instance.resize());observer.observe(host.current);
    setSelected('');setPickedEdge(null);
    return()=>{observer.disconnect();instance.destroy();cy.current=undefined;};
  },[graph]);
  useEffect(()=>{
    const instance=cy.current;if(!instance)return;
    instance.layout(layout==='concentric'?{name:'concentric',animate:false,padding:65,minNodeSpacing:90,nodeDimensionsIncludeLabels:true,concentric:n=>n.degree(),levelWidth:()=>2}: {name:'breadthfirst',directed:true,animate:false,padding:65,spacingFactor:1.5,nodeDimensionsIncludeLabels:true}).run();
  },[graph,layout]);
  useEffect(()=>{
    const instance=cy.current;if(!instance)return;
    instance.batch(()=>{
      instance.elements().removeClass('dim focus incoming outgoing');
      instance.edges().style('label',labels?'data(label)':'');
      if(!selected)return;
      const node=instance.getElementById(selected); if(node.empty())return;
      const incoming=node.incomers('edge'),outgoing=node.outgoers('edge');
      const edges=direction==='in'?incoming:direction==='out'?outgoing:incoming.union(outgoing);
      instance.elements().addClass('dim');node.union(edges).union(edges.connectedNodes()).removeClass('dim');node.addClass('focus');
      edges.intersection(incoming).addClass('incoming');edges.intersection(outgoing).addClass('outgoing');
      edges.style('label','data(label)');
    });
  },[graph,selected,direction,labels]);
  const connected=selected?graph.edges.filter(e=>{const n=graph.shown.find(m=>'n:'+String(m.id)===selected);return (direction!=='out'&&e.target===n?.title)||(direction!=='in'&&e.source===n?.title);}):[];
  return <section className={'relationship-graph '+(expanded?'expanded':'')}>
    <div className="graph-controls"><label>관계 유형<select value={relation} onChange={e=>setRelation(e.target.value)}><option value="all">전체 관계</option>{types.map(t=><option key={t}>{t}</option>)}</select></label><label>배치<select value={layout} onChange={e=>setLayout(e.target.value)}><option value="concentric">연결 중심</option><option value="breadthfirst">방향 계층</option></select></label><label>최대 노드<select value={limit} onChange={e=>setLimit(Number(e.target.value))}>{[80,150,300].map(n=><option key={n} value={n}>{n}개</option>)}</select></label><button onClick={()=>cy.current?.fit(undefined,60)}>전체 맞춤</button><button onClick={()=>setExpanded(!expanded)}>{expanded?'화면 축소':'크게 보기'}</button></div>
    <div className="graph-controls"><label><input type="checkbox" checked={labels} onChange={e=>setLabels(e.target.checked)}/> 모든 관계명</label><label>연결 방향<select value={direction} onChange={e=>setDirection(e.target.value)}><option value="both">들어옴 + 나감</option><option value="in">들어오는 관계</option><option value="out">나가는 관계</option></select></label><input aria-label="리소스 찾기" placeholder="지도에서 리소스 찾기" value={search} onChange={e=>setSearch(e.target.value)}/><button disabled={!search.trim()} onClick={()=>{const found=cy.current?.nodes().filter(n=>String(n.data('label')).toLowerCase().includes(search.toLowerCase())).first();if(found?.length){setSelected(found.id());selectCallback.current(found.data('resourceId'));cy.current?.fit(found.closedNeighborhood(),70);}}}>찾기</button><button onClick={()=>{setSelected('');setPickedEdge(null);selectCallback.current('');}}>강조 해제</button></div>
    <div className="relationship-canvas" ref={host} role="region" aria-label="확대 및 드래그 가능한 내부 관계 지도"/>
    <div className="graph-note">노드 클릭: 이웃·관계 강조 · 선 클릭: 상세 · 휠: 확대 · 드래그: 노드 이동/화면 이동<br/>표시 {graph.shown.length}/{members.length}개 리소스 · {graph.edges.length}/{graph.filteredCount}개 관계{graph.shown.length<members.length?' · 연결 수가 많은 리소스부터 제한 표시':''}<br/><span style={{color:'#178a7d'}}>━━ 나가는 관계</span>　<span style={{color:'#7760bf'}}>━━ 들어오는 관계</span>　▶ 화살표는 도착점</div>
    <div className="graph-note">{graph.kinds.map((k,i)=><span key={k} style={{color:palette[i%palette.length],marginRight:12}}>● {k}</span>)}</div>
    {pickedEdge&&<div className="inspect"><strong>{label(pickedEdge.source)} → {String(pickedEdge.type||'관계')} → {label(pickedEdge.target)}</strong><p>{String(pickedEdge.description||'관계 설명이 없습니다.')}</p></div>}
    {!!selected&&<details open className="community-context"><summary>선택 리소스의 표시된 연결 {connected.length}개</summary><div className="table-wrap"><table><thead><tr><th>출발</th><th>관계</th><th>도착</th></tr></thead><tbody>{connected.map((r,i)=><tr key={i}><td>{label(r.source)}</td><td>{String(r.type||'관계')}</td><td>{label(r.target)}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
