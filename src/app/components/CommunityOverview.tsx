import React, { useMemo, useState } from "react";
import { Box, Button, Card, CardContent, Chip, Grid, Stack, Typography } from "@mui/material";
import { Community } from "../models/community";
import { Entity } from "../models/entity";
import { communityColor } from "../utils/community-utils";

interface Props { communities: Community[]; entities: Entity[]; onOpenGraph: (community?: Community) => void; }

const CommunityOverview: React.FC<Props> = ({ communities, entities, onOpenGraph }) => {
  const [selected, setSelected] = useState<Community | null>(null);
  const byId = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);
  const roots = communities.filter((c) => c.parent == null || c.parent < 0);
  const ordered = [...communities].sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  const shown = selected ?? ordered[0];
  const members = (shown?.entity_ids ?? []).map((id) => byId.get(id)).filter(Boolean).slice(0, 8) as Entity[];
  return <Box sx={{ height: "calc(100vh - 64px)", overflow: "auto", p: { xs: 2, md: 5 }, bgcolor: "background.default" }}>
    <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" gap={2} mb={3}>
      <Box><Typography variant="overline" color="text.secondary">AGE graph / GraphRAG</Typography><Typography variant="h3" sx={{ fontWeight: 700 }}>커뮤니티 구성</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>전체 그래프를 보기 전에, 어떤 그룹이 만들어졌는지 먼저 확인하세요.</Typography></Box>
      <Button variant="contained" size="large" onClick={() => onOpenGraph()}>전체 커뮤니티 그래프 →</Button>
    </Stack>
    <Grid container spacing={1.5} mb={4}><Grid item xs={4}><Card><CardContent><Typography color="text.secondary">커뮤니티</Typography><Typography variant="h4">{communities.length}</Typography></CardContent></Card></Grid><Grid item xs={4}><Card><CardContent><Typography color="text.secondary">계층 루트</Typography><Typography variant="h4">{roots.length}</Typography></CardContent></Card></Grid><Grid item xs={4}><Card><CardContent><Typography color="text.secondary">전체 엔티티</Typography><Typography variant="h4">{entities.length}</Typography></CardContent></Card></Grid></Grid>
    <Card sx={{ mb: 4, border: "1px solid", borderColor: "divider" }}><CardContent><Stack direction={{xs:"column",md:"row"}} justifyContent="space-between" gap={2}><Box><Typography variant="overline" color="text.secondary">구조 커뮤니티 비교 · Leiden</Typography><Typography variant="h6">운영 커뮤니티와 그래프 구조가 얼마나 일치하나요?</Typography><Typography variant="body2" color="text.secondary">동일한 AGE 스냅샷에서 계산한 읽기 전용 비교 결과입니다. 운영 커뮤니티는 업무 축, Leiden은 실제 연결 구조를 나타냅니다.</Typography></Box><Stack direction="row" gap={1} flexWrap="wrap"><Chip label="Leiden 13개" color="primary"/><Chip label="NMI 0.827"/><Chip label="ARI 0.742"/><Chip label="내부 연결 64.0%"/></Stack></Stack></CardContent></Card>
    <Grid container spacing={1.5} alignItems="stretch"><Grid item xs={12} md={7}><Typography variant="h6" mb={1}>커뮤니티 목록 <Typography component="span" color="text.secondary" variant="body2">크기순 · 카드를 클릭하면 멤버를 확인</Typography></Typography><Grid container spacing={1}>{ordered.map((c) => <Grid item xs={12} sm={6} key={c.id}><Card onClick={() => setSelected(c)} sx={{ cursor: "pointer", borderLeft: `6px solid ${communityColor(c.community)}`, outline: shown?.id === c.id ? `2px solid ${communityColor(c.community)}` : "none" }}><CardContent sx={{ py: 1.5 }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="caption" color="text.secondary">L{c.level} · {c.parent != null && c.parent >= 0 ? `parent #${c.parent}` : "root"}</Typography><Typography noWrap fontWeight={600}>{c.title}</Typography></Box><Chip size="small" label={`${c.size ?? 0}명`} /></Stack></CardContent></Card></Grid>)}</Grid></Grid><Grid item xs={12} md={5}><Card sx={{ height: "100%" }}><CardContent><Typography variant="overline" color="text.secondary">선택한 커뮤니티</Typography><Typography variant="h5" sx={{ mt: .5 }}>{shown?.title || "선택 없음"}</Typography>{shown && <Stack direction="row" gap={1} mt={1} mb={2}><Chip size="small" label={`Level ${shown.level}`} /><Chip size="small" label={`멤버 ${shown.size ?? 0}`} /><Chip size="small" label={shown.parent != null && shown.parent >= 0 ? `부모 #${shown.parent}` : "최상위"} /></Stack>}<Typography variant="subtitle2" mb={1}>대표 멤버</Typography>{members.length ? members.map((e) => <Typography key={e.id} variant="body2" noWrap sx={{ py: .35 }}>• {e.title}</Typography>) : <Typography color="text.secondary">멤버 데이터가 없습니다.</Typography>}<Button sx={{ mt: 2 }} onClick={() => onOpenGraph(shown)}>이 그룹의 연결 관계 탐색</Button></CardContent></Card></Grid></Grid>
    </Box>;
};
export default CommunityOverview;
