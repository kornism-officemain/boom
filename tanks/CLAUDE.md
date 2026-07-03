# tanky — 개발 지침 (CLAUDE.md)

> diep.io류 싱글플레이 탱크 아레나 스코어어택. boom과 **완전 별개 프로젝트** (폴더·서버·배포 분리).
> 기획서: `docs/GDD.md` (v1.0 — 2026-07-03 확정 결정 반영). 기획 질문은 GDD 먼저.

## 확정 결정사항 (변경 시 사용자 승인 필요)
1. **싱글플레이 + AI 봇** — 실시간 멀티 비목표. 봇 최대 4기가 파밍/교전/도주.
2. **티어 2 클래스까지** — Lv15에서 트윈/스나이퍼/머신건/플랭크 택1. 스탯 8종 × 5포인트.
3. **별도 배포** — Node 단일 서버 (Express + JSON 파일 스토어), 포트 3100. boom 서버와 무관.

## 스택 (고정 — boom과 동일 규약)
- 프론트: Vanilla JS (ES Modules) + Canvas 2D. 프레임워크·번들러·CDN 금지.
- 백엔드: Express 단일 의존성. `server/data/*.json` 파일 스토어.

## 폴더 구조
```
├── server/server.js           ← 정적 서빙 + 랭킹 + 관리자 API (boom 패턴)
├── server/config.defaults.json ← ★ 모든 밸런스 상수의 유일한 원본
└── public/js/
    ├── main.js      ← 부트 + 씬 상태머신
    ├── net.js       ← API 래퍼
    ├── input.js     ← WASD 이동 + 마우스 조준/사격 + 숫자키 스탯
    ├── entities.js  ← 탱크/탄/도형 팩토리, 파생 스탯, XP/레벨
    ├── classes.js   ← 클래스 포신 구조 (배율 계수는 config.classes)
    ├── ai.js        ← 봇 상태머신 (파밍→교전→도주) + 자동 스탯 분배
    ├── game.js      ← 플레이 씬: 루프, 카메라, 충돌, 사망, 미니맵
    ├── fx.js / sfx.js / ui.js ← boom과 동일 역할
```

## 아키텍처 철칙 (boom 계승 + tanky 고유)
1. 밸런스 상수는 config.defaults.json에만. 수식은 코드, 계수는 config.
2. 색 문법: 파랑 = 나/이득, 빨강 = 위협(봇), 노/주/보 = 중립 도형.
3. "내 잘못" 원칙: 봇 스폰 700px 밖 + 2초 무적(발사 시 해제), 봇 동시 4기 상한, 조준 오차.
4. 난이도 상한: 봇 레벨 캡 22, 도형 총량 70 고정. 무한 스케일 금지.
5. dt 클램프(1/30) + 전 이동 dt 기반. 사망 슬로모는 timeScale, 연출 타이머는 실시간.
6. "한 판 더"는 클릭 1번. 결과 화면에 단계 추가 금지.
7. 봇 탄은 봇을 안 때린다 — 위협은 전부 플레이어를 향해야 읽기 쉽다.

## 실행
```
npm install && npm start   # http://localhost:3100 (게임) / /admin.html (키: 콘솔 출력 참조)
```
