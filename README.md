# GraphRAG Community Explorer

Apache AGE 그래프를 GraphRAG 커뮤니티 관점에서 탐색하기 위한 오픈소스 시각화 실험 프로젝트입니다.

## 현재 기능

- AGE Resource/Relationship/Community Parquet 변환
- 운영 커뮤니티와 Leiden 구조 커뮤니티 비교
- LCC 기반 Leiden 커뮤니티 계산
- 커뮤니티 색상·구름·레벨 필터·멤버 탐색
- Cytoscape.js 기반 compound community map 프로토타입

원본 AGE에는 알고리즘 실행 결과를 자동으로 쓰지 않습니다. 결과 검증 후 별도 라벨/그래프로 적재하는 것을 원칙으로 합니다.

## 상태

현재는 GraphRAG Visualizer 기반 검증 단계이며, 다음 단계에서 커뮤니티 컨테이너·계층 트리·내부 그래프를 분리한 분석 UI로 발전시킬 예정입니다.
