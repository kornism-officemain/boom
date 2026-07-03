# tanky — 탱크 아레나 스코어어택

diep.io류 싱글플레이 탱크 게임. 도형을 부수고 성장해서 붉은 AI 봇 탱크를 격파하는 스코어어택.
boom과 별개 프로젝트 (폴더·서버·배포 분리).

## 실행
```
cd tanks
npm install && npm start   # http://localhost:3100
```
- 게임: `/` · 관리자 콘솔: `/admin.html` (키는 서버 콘솔 출력, 기본 `tanky-admin`, 환경변수 `ADMIN_KEY`로 변경)

## 조작
WASD/화살표 이동 · 마우스 조준 · 클릭/스페이스 사격 · 숫자키 1~8 또는 좌측 패널 클릭으로 스탯 분배

## 룰 요약
- 목숨 1개. 점수 = 획득 XP 총합. 죽으면 랭킹 제출 → "한 판 더" 클릭 1번.
- 도형: 사각(12XP) < 삼각(30XP) < 오각(150XP, 희귀·미니맵 표시).
- Lv15에서 클래스 선택: 트윈 / 스나이퍼 / 머신건 / 플랭크.
- 봇 최대 4기, 시간 갈수록 강해짐 (레벨 캡 22). 격파 시 큰 XP.
- 리더보드 4종: 점수 / 레벨 / 격파 / 생존.

## 배포 (Render 무료 — boom과 동일 방식)
1. GitHub에 push → Render Web Service 생성, Root Directory = `tanks`
2. Build: `npm install` / Start: `npm start`
3. 환경변수: `ADMIN_KEY`(필수 권장), 영구디스크 사용 시 `DATA_DIR=/data`

## 밸런싱
코드 수정 없이 `/admin.html`에서 저장 → 다음 판부터 반영. 원본: `server/config.defaults.json`.
기획 의도는 `docs/GDD.md` 참조.
