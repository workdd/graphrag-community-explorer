import React, { useMemo } from "react";
import { Box, Card, CardContent, Chip, Grid, Stack, Typography } from "@mui/material";
import { Community } from "../models/community";
import { Entity } from "../models/entity";

export default function ProductDashboard({ communities, entities, onOpen }: { communities: Community[]; entities: Entity[]; onOpen: (c: Community) => void }) {
  const levels = useMemo(() => [...new Set(communities.map(c => c.level))].sort((a,b)=>a-b), [communities]);
  const covered = useMemo(() => new Set(communities.flatMap(c => c.entity_ids ?? [])).size, [communities]);
  return <Box sx={{ minHeight: "calc(100vh - 64px)", bgcolor: "#f7f8fb", p: {xs:2,md:5} }}>
    <Typography variant="overline" color="text.secondary">GRAPHRAG COMMUNITY EXPLORER</Typography>
    <Typography variant="h3" sx={{fontWeight:800, letterSpacing:-1}}>그래프 구조를 이해하는 대시보드</Typography>
    <Typography color="text.secondary" sx={{mt:1,mb:4}}>커뮤니티를 먼저 보고, 필요한 경우에만 내부 리소스 그래프로 들어갑니다.</Typography>
    <Grid container spacing={2} mb={4}>{[["커뮤니티",communities.length], ["계층 레벨",levels.length], ["커버된 리소스",covered], ["전체 리소스",entities.length]].map(([label,value])=><Grid item xs={6} md={3} key={String(label)}><Card><CardContent><Typography color="text.secondary">{label}</Typography><Typography variant="h4" sx={{fontWeight:700}}>{value}</Typography></CardContent></Card></Grid>)}</Grid>
    <Typography variant="h5" sx={{fontWeight:700,mb:2}}>커뮤니티 탐색</Typography>
    <Grid container spacing={2}>{communities.slice().sort((a,b)=>(b.size??0)-(a.size??0)).map(c=><Grid item xs={12} md={6} lg={4} key={String(c.id)}><Card onClick={()=>onOpen(c)} sx={{cursor:"pointer",height:"100%",'&:hover':{boxShadow:6}}}><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6" noWrap>{c.title}</Typography><Chip label={`L${c.level}`} size="small" color="primary"/></Stack><Typography color="text.secondary" sx={{mt:1}}>{c.size??0}개 리소스 · {c.entity_ids?.length??0}개 멤버</Typography><Typography variant="body2" sx={{mt:2}}>클릭하여 내부 그래프 보기 →</Typography></CardContent></Card></Grid>)}</Grid>
  </Box>;
}
