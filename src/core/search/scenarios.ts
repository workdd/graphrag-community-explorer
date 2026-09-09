import type { Dataset, Entity } from "../model";
import type { SearchMethod } from "./types";

export interface Scenario {
  id: string;
  domain: "resource" | "governance";
  method: SearchMethod;
  title: string;
  question: string;
  check: string;
  boundary: boolean;
}

/** Questions are instantiated from the open index; no customer names or fixed record IDs ship. */
export function testScenarios(dataset: Dataset, lang: "ko" | "en"): Scenario[] {
  const out: Scenario[] = [];
  const s = (ko: string, en: string) => lang === "ko" ? ko : en;
  const entities = [...dataset.entities.values()].sort((a, b) => a.id.localeCompare(b.id));
  const first = (type: string) => entities.find(e => e.type.toLowerCase() === type.toLowerCase());
  const label = (e: Entity) => `${e.title} (ID: ${e.id})`;
  const add = (domain: Scenario["domain"], method: SearchMethod, id: string, title: string, question: string, check: string, boundary = false) => out.push({ domain, method, id, title, question, check, boundary });
  const vm = first("VirtualMachine"), role = first("Role"), user = first("User");
  if (vm) {
    const a = (method: SearchMethod, id: string, title: string, question: string, check: string, boundary = false) => add("resource", method, id, title, question, check, boundary);
    a("local", "RL1", s("속성 조회", "Attribute lookup"), s(`${label(vm)}의 상태와 사양을 알려줘. 확인되지 않는 속성은 구분해줘.`, `What are the state and specifications of ${label(vm)}? Identify unavailable attributes.`), s("동일 이름의 다른 VM과 혼동하지 않고 원본 속성을 인용하는가", "Resolve the exact entity and cite its attributes."));
    const attachment = dataset.relationships.find(r => r.type === "attachedToVM" && dataset.entities.has(r.sourceId) && dataset.entities.has(r.targetId));
    if (attachment) a("local", "RL2", s("연결 방향", "Link direction"), s(`${label(dataset.entities.get(attachment.sourceId)!)}가 연결된 VM을 모두 찾고 관계 방향을 설명해줘.`, `List the VMs attached to ${label(dataset.entities.get(attachment.sourceId)!)} and explain the relationship direction.`), s("attachedToVM의 대상과 방향, 누락 여부를 확인", "Check attachedToVM targets, direction and omissions."));
    const snapshot = dataset.relationships.find(r => r.type === "snapshotOfVolume" && dataset.entities.has(r.sourceId) && dataset.relationships.some(a => a.type === "attachedToVM" && a.sourceId === r.targetId && dataset.relationships.some(p => p.type === "belongsToProject" && p.sourceId === a.targetId)));
    if (snapshot) a("local", "RL3", s("3단계 관계 추적", "Three-hop path"), s(`${label(dataset.entities.get(snapshot.sourceId)!)}의 원본 볼륨에 연결된 VM과 그 VM의 프로젝트를 찾아줘. 각 단계의 근거를 제시해줘.`, `Find the VM attached to the source volume of ${label(dataset.entities.get(snapshot.sourceId)!)} and that VM's project. Cite every step.`), s("snapshotOfVolume → attachedToVM → belongsToProject 전체 경로가 있는가", "Recover the entire snapshotOfVolume → attachedToVM → belongsToProject path."));
    const node = first("Node");
    if (node) a("local", "RL4", s("연관 대상 누락", "Related-set coverage"), s(`${label(node)}에 배치된 Pod와 각 Pod의 Namespace를 모두 알려줘.`, `List every Pod scheduled on ${label(node)} and each Pod's Namespace.`), s("isScheduledOn 역방향 조회와 belongsToNamespace 경로가 모두 포함되는가", "Check reverse isScheduledOn lookup and belongsToNamespace coverage."));
    a("local", "RL5", s("정확 집계의 한계", "Exact-count boundary"), s("전체 데이터의 VirtualMachine, BlockStorage, Pod 개수를 정확히 집계해줘. 일부 검색 결과만 있다면 전체 개수라고 하지 마.", "Count all VirtualMachine, BlockStorage and Pod entities. Do not present a retrieved subset as the full count."), s("원본 전체 집계와 대조. 제한된 컨텍스트를 전체로 오인하는지 확인", "Compare with full-index counts; detect subset-as-total errors."), true);
    a("local", "RL6", s("절감액 추정 금지", "Missing cost evidence"), s(`${label(vm)}의 사양을 절반으로 줄이면 월 얼마를 절감할 수 있어? 현재 근거로 계산 가능한지 먼저 말해줘.`, `How much monthly cost would halving ${label(vm)} save? First state whether the available evidence supports a calculation.`), s("가격·사용률·과금 조건이 없으면 절감액을 만들지 않는가", "Do not invent savings without prices, utilization and billing terms."), true);
    a("global", "RG1", s("전체 구성 요약", "Inventory overview"), s("전체 자원 구성을 VM·스토리지·네트워크·Kubernetes 영역으로 나누어 설명하고 각 설명의 보고서 근거를 제시해줘.", "Summarize the inventory by VM, storage, networking and Kubernetes, citing report evidence for each."), s("넓은 범위의 주요 사실, 인용, 보고서가 다루지 않는 영역을 구분", "Check coverage, citations and gaps in the reports."));
    a("global", "RG2", s("영역 간 비교", "Compare resource domains"), s("VM·스토리지 영역과 Kubernetes 영역의 연결 구조는 어떻게 달라? 공통점과 차이점을 근거와 함께 비교해줘.", "Compare VM/storage and Kubernetes relationship structures, with evidence for similarities and differences."), s("서로 다른 영역을 모두 다루고 관계 의미를 정확히 설명하는가", "Cover both domains and preserve relationship semantics."));
    a("global", "RG3", s("공통 연결 패턴", "Recurring patterns"), s("여러 자원 커뮤니티에서 반복되는 연결 패턴을 정리해줘. 반복된다는 판단의 근거와 예외도 설명해줘.", "Identify recurring relationship patterns across resource communities, with supporting evidence and exceptions."), s("한 보고서의 사실을 전체 공통 패턴으로 과장하지 않는가", "Do not generalize one report into a corpus-wide pattern."));
    a("global", "RG4", s("운영 검토 후보", "Review candidates"), s("보고서를 바탕으로 운영자가 추가 확인할 자원 연결 구조를 정리해줘. 실제 장애나 미사용이 확정된 것처럼 말하지 마.", "Suggest resource relationship structures for an operator to investigate, without claiming confirmed incidents or unused resources."), s("관측 사실과 검토 가설, 필요한 추가 근거를 분리하는가", "Separate observed facts, hypotheses and missing evidence."));
    a("global", "RG5", s("전체 수치 검증", "Global count boundary"), s("전체 프로젝트별 VM과 볼륨 수를 정확한 표로 작성해줘. 보고서만으로 전체 집계가 불가능하면 그 한계를 밝혀줘.", "Give exact VM and volume counts per project. State limitations if reports cannot support complete counts."), s("보고서 요약을 정확한 전체 집계로 착각하거나 계층 중복 계산하지 않는가", "Avoid incomplete totals and duplicate counts across hierarchy levels."), true);
    a("global", "RG6", s("근거 범위와 누락", "Evidence coverage"), s("현재 보고서로 설명할 수 있는 자원 현황과 설명하기 어려운 항목을 나눠줘. 성능·비용·장애 이력도 실제 근거가 있는지 구분해줘.", "Separate inventory facts supported by these reports from missing information, including performance, cost and incident history."), s("보고서에 없는 측정값이나 이력을 만들어내지 않는가", "Do not fabricate metrics or histories absent from reports."), true);
  }
  if (role && user) {
    const a = (method: SearchMethod, id: string, title: string, question: string, check: string, boundary = false) => add("governance", method, id, title, question, check, boundary);
    a("local", "GL1", s("사용자의 역할", "User roles"), s(`${label(user)}에게 연결된 역할을 모두 찾고 hasRole 근거를 제시해줘.`, `List all roles linked to ${label(user)}, citing hasRole evidence.`), s("동명이인 구분과 전체 역할 회수 여부", "Disambiguate the user and recover all roles."));
    a("local", "GL2", s("역할별 권한", "Role grants"), s(`${label(role)}의 메뉴 권한을 grantsNone, grantsRead, grantsFull로 나눠 설명해줘. 기록과 실효권한을 구분해줘.`, `Describe menu grants for ${label(role)}, separating grantsNone, grantsRead and grantsFull, and recorded grants from effective permissions.`), s("None/Read/Full 의미를 혼동하지 않고 관계를 인용하는가", "Preserve grant types and cite the relationships."));
    a("local", "GL3", s("사용자에서 페이지까지", "User-to-page paths"), s(`${label(user)}에서 역할과 메뉴를 거쳐 연결되는 페이지를 찾아줘. 각 경로를 설명하고 실효권한 판단에 필요한 추가 규칙도 알려줘.`, `Find pages connected to ${label(user)} through roles and menus. Explain the paths and rules still needed to determine effective access.`), s("hasRole → grants* → servesPage 경로가 완전한가", "Check complete hasRole → grants* → servesPage paths."));
    const manager = dataset.relationships.find(r => r.type === "administersLabel" && dataset.entities.has(r.sourceId) && dataset.relationships.some(a => a.type === "assignedTo" && a.sourceId === r.targetId));
    if (manager) a("local", "GL4", s("관리 범위 추적", "Management scope"), s(`${label(dataset.entities.get(manager.sourceId)!)}가 관리하는 Label에 연결된 Workspace를 모두 찾고 경로를 설명해줘.`, `Find all Workspaces linked to Labels administered by ${label(dataset.entities.get(manager.sourceId)!)} and explain the paths.`), s("User → Label → Workspace 경로. Folder 소속과 혼동하지 않는가", "Follow User → Label → Workspace, without confusing Folder membership."));
    a("local", "GL5", s("역할 충돌 규칙", "Conflicting grants"), s("여러 역할에서 같은 메뉴에 grantsNone과 grantsFull이 함께 있으면 최종 접근 권한은 어떻게 결정돼? 현재 데이터에 합성 규칙이 명시돼 있는지도 알려줘.", "How is effective access determined when different roles have grantsNone and grantsFull for the same menu? Is the combining rule explicitly present?"), s("CMP 규칙 없이 거부 우선/허용 우선을 임의 확정하지 않는가", "Do not assume deny-overrides or allow-overrides without CMP rules."), true);
    a("local", "GL6", s("정적 데이터와 승인 상태", "Approval-state boundary"), s("승인 정책의 approvedBy 관계만으로 실제 승인 순서와 현재 대기자를 확인할 수 있어? 확인 가능한 사실과 추가로 필요한 정보를 나눠줘.", "Can approvedBy relationships alone determine approval order and the current pending approver? Separate supported facts from missing information."), s("연결 기록에서 실행 순서나 현재 상태를 만들어내지 않는가", "Do not infer runtime state or ordering from links alone."), true);
    a("global", "GG1", s("거버넌스 구조 요약", "Governance overview"), s("사용자·역할·메뉴·페이지의 전체 연결 구조를 설명하고 보고서 근거를 제시해줘.", "Summarize how users, roles, menus and pages connect, with report citations."), s("hasRole/grants*/servesPage를 구분하고 근거로 뒷받침하는가", "Distinguish and support hasRole, grants* and servesPage."));
    a("global", "GG2", s("역할군 비교", "Compare role groups"), s("보고서에 나타난 역할군의 공통점과 권한 범위 차이를 비교해줘. 보고서에서 확인할 수 없는 차이는 구분해줘.", "Compare role groups and permission scopes described in the reports, identifying differences the reports cannot establish."), s("범위가 다른 역할군을 다루고 없는 권한 차이를 만들지 않는가", "Cover distinct role groups without inventing permission differences."));
    a("global", "GG3", s("관리 범위 구조", "Administration structure"), s("Label·Workspace 관리 구조와 역할·메뉴 권한 구조는 어떻게 달라? 보고서에서 확인되는 연결만 사용해 설명해줘.", "Compare Label/Workspace administration with role/menu permissions using only relationships supported by reports."), s("관리 관계와 접근 허용 관계를 같은 것으로 취급하지 않는가", "Do not equate administration links with access grants."));
    a("global", "GG4", s("권한 검토 항목", "Access review questions"), s("전체 거버넌스 보고서를 보고 담당자가 검토할 권한 관련 질문을 정리해줘. 확정된 문제와 추가 검증할 가설을 구분해줘.", "Propose access-review questions from the governance reports. Separate established problems from hypotheses requiring verification."), s("과도 권한 기준 없이 연결이 많다는 이유만으로 위반이라고 단정하지 않는가", "Do not label high connectivity a violation without policy criteria."));
    a("global", "GG5", s("권한 전체 집계", "Grant-count boundary"), s("전체 grantsNone, grantsRead, grantsFull 관계 수를 정확히 비교해줘. 보고서로 정확한 집계가 불가능하면 그렇게 말해줘.", "Compare exact total counts of grantsNone, grantsRead and grantsFull. State if the reports cannot establish exact totals."), s("전체 원본 집계와 대조. 요약과 실제 권한 행렬을 구분", "Compare with source counts and distinguish summaries from the permission matrix."), true);
    a("global", "GG6", s("현재 권한 판단의 한계", "Current-access boundary"), s("이 보고서만으로 현재 모든 사용자의 실효권한을 확정할 수 있어? 역할 합성, 변경 반영, 승인 진행 상태의 근거가 충분한지 구분해줘.", "Can these reports establish every user's current effective access? Assess evidence for role combination, updates and approval status."), s("보고서 시점과 규칙·최신성의 공백을 인정하는가", "Recognize missing rules, freshness and runtime-state evidence."), true);
  }
  return out;
}
