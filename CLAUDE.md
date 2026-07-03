# boom — 개발 지침 (CLAUDE.md)

> 4시간 안에 팀원들이 URL로 접속해 즐기는 웹 2D 스코어어택 게임을 완성한다.
> 기획서: `docs/GDD.md` (amnesia v2.2 — 확정 결정 반영본). 기획 질문이 생기면 GDD를 먼저 본다.

## 확정 결정사항 (변경 시 사용자 승인 필요)
1. **배포**: Node 단일 서버 (Express + JSON 파일 스토어). 서버 하나가 정적 파일 + 랭킹 API + 관리자 API 전부 담당.
2. **게임 룰**: 하이브리드 — 기본 90초 타임어택 + 라이프 3. 시간 종료 = 클리어(잔여 라이프 보너스), 라이프 소진 = 즉시 종료. 타임 부스터로 최대 180초.
3. **입력**: 듀얼 — 마우스/터치 추종(lerp 0.22) 기본, 키보드 화살표/WASD도 완전 지원. 마지막으로 쓴 입력이 우선.

## 스택 (고정 — 추가 금지)
- 프론트: **Vanilla JS (ES Modules) + Canvas 2D**. 프레임워크·번들러·빌드 스텝 없음. 게임플레이는 canvas, UI(메뉴/결과/모달/HUD 텍스트)는 DOM 오버레이.
- 백엔드: **Express 단일 의존성**. DB 없음 — `server/data/*.json` 파일 스토어 (팀 규모엔 충분).
- 네이티브 모듈, TypeScript, 외부 CDN 라이브러리 금지. `npm install` 한 번에 어디서든 돌아야 한다.

## 폴더 구조와 책임
```
├── CLAUDE.md              ← 이 문서. 지침 변경 시 여기 갱신
├── docs/GDD.md            ← 기획 단일 진실 공급원 (밸런스 의도 포함)
├── package.json           ← 의존성: express 하나. npm start = node server/server.js
├── server/
│   ├── server.js          ← Express: 정적 서빙 + API 전부 (한 파일 유지)
│   └── config.defaults.json ← ★ 모든 밸런스 상수의 유일한 원본
├── server/data/           ← 런타임 생성 (git 제외): scores.json, config.overrides.json
└── public/
    ├── index.html         ← 게임 (씬 오버레이 전부 포함)
    ├── admin.html         ← 관리자 콘솔 (config 자동 렌더링)
    ├── css/style.css      ← 파스텔톤 테마. 색상 변수는 :root에만
    └── js/
        ├── main.js        ← 부트 + 씬 상태머신 (menu → play → result)
        ├── net.js         ← API 래퍼 (getConfig / postScore / getBoard)
        ├── input.js       ← 듀얼 입력 통합 → 이동 의도 벡터 하나로 노출
        ├── game.js        ← 플레이 씬: 루프, 스폰, 충돌, 점수, 사망
        ├── fx.js          ← 파티클/플로터/셰이크 (연출 상수는 여기 하드코딩 허용)
        ├── sfx.js         ← WebAudio 합성 사운드 (에셋 파일 없음, unlock 전 no-op)
        └── ui.js          ← DOM 씬 전환, 결과/랭킹 렌더, 자세히보기 모달
```

## 아키텍처 철칙
1. **밸런스 상수는 `server/config.defaults.json`에만 존재한다.** 코드에 숫자 하드코딩 금지. 수식(난이도 곡선 등)은 코드에, 계수는 config에. 관리자 콘솔은 이 JSON의 오버라이드를 저장하고, 클라이언트는 매 런 시작 시 병합본을 받는다. → 밸런싱 = 코드 수정 없이 콘솔에서 저장 후 새 판.
2. **오브젝트 추가는 레지스트리 패턴.** `game.js`의 `TYPES` 테이블에 `{ spawn, update, draw, onHit }` 엔트리 추가 + config에 계수 + `schedule`에 등장 시각. 다른 파일을 건드리면 설계가 잘못된 것.
3. **"내 잘못" 원칙.** 모든 위협은 텔레그래프(예고)를 가진다 — 불릿 경고선 0.8s, 마인 페이드인 0.6s + 플레이어 반경 120px 스폰 금지, 헌터 동시 최대 2기. 억울한 죽음을 만드는 변경은 금지.
4. **색 문법 고정.** 푸른 계열 = 이득, 붉은 계열 = 위협. 0.2초 안에 색만으로 판단 가능해야 함. 새 오브젝트도 예외 없음.
5. **루프**: `requestAnimationFrame` + dt 클램프(최대 1/30s). 모든 이동·타이머는 dt 기반 (프레임 독립). 플레이어 속도는 700px/s 클램프.
6. **난이도 상한 필수.** 속도 계수 `min(1+t/45, 2.2)`, 스폰 계수 `min(1+t/30, 3.0)`, 동시 위협 40. 무한 스케일 금지 (v2.1 결함 재발 방지).
7. **서버는 얇게.** 안티치트는 비목표(팀 내부용). 단, 서버에서 sanity 클램프(점수 상한, 이름 길이)만 수행. 관리자 API는 `x-admin-key` 헤더로 보호.
8. **"한 판 더" 루프 훼손 금지.** 결과 화면 → 재시작은 클릭 1번·0.5초 이내. 결과 화면에 확인 팝업/광고성 단계 추가 금지.

## 코딩 규약
- 파일당 300줄 이내 목표. 넘으면 분리 검토하되 과도한 추상화 금지 — 4시간 게임에 ECS·클래스 계층 불필요. 엔티티는 plain object + 타입별 함수.
- 상태는 씬 로컬로. 전역은 `config`, `input` 둘만.
- 이름은 localStorage에 기억, 매 판 재입력 없음.

## 작업 로드맵
- [x] Phase 0 — 프레임: 구조, 지침, GDD, 서버, end-to-end 골격 (메뉴→플레이→결과→랭킹)
- [x] Phase 1 — 풀 로스터: 좋은 것 6종 + 나쁜 것 5종 전부, 등장 스케줄, 러시 모드, 타임 부스터
- [x] Phase 2 — 주스: 사망 슬로모+원인 표시, NEW BEST 연출, 콤보 게이지, 파티클, 사운드(WebAudio 합성)
- [x] Phase 3 — 리더보드 4종 탭, 자세히보기 유도 장치, 관리자 콘솔 마감
- [x] Phase 4 — 배포: GitHub + Render 무료 (가이드: `README.md`. 사내 서버 없음 확인 → A안 채택. DATA_DIR 환경변수로 영구디스크 대응)

## 실행
```
npm install && npm start   # http://localhost:3000 (게임) / /admin.html (콘솔, 키: 서버 콘솔 출력 참조)
```
