# boom — 배포/운영 가이드

팀원용 웹 2D 스코어어택 게임. 서버 하나가 게임 + 랭킹 API + 관리자 콘솔을 전부 서빙한다.

## 배포 A안 (권장): GitHub + Render 무료

1. **GitHub에 올리기** — 게임 폴더에서:
   ```bash
   git init
   git add .
   git commit -m "boom v1.0"
   git branch -M main
   git remote add origin https://github.com/<계정또는org>/boom.git
   git push -u origin main
   ```
   (`.gitignore`가 node_modules와 랭킹 데이터를 이미 제외함)

2. **Render 연결** — [dashboard.render.com](https://dashboard.render.com) 가입(GitHub 로그인) → **New → Web Service** → boom repo 선택 → Node 자동 감지 (Build: `npm install`, Start: `npm start`) → Instance Type: **Free** → Environment Variables에 `ADMIN_KEY` 추가 → **Create Web Service**.

3. 몇 분 뒤 `https://boom-xxxx.onrender.com` 발급 → 팀에 공유. 끝.

이후 코드 수정 배포 = `git push`만 하면 자동 재배포.

**무료 티어 제약 2가지**
- 15분간 접속 없으면 잠들고, 첫 접속자가 30~50초 기다림 (그 뒤엔 정상 속도).
- 파일시스템이 휘발성이라 **재배포/재시작 시 랭킹이 초기화**될 수 있음.

반응이 좋아서 정식으로 돌리려면: Starter 인스턴스($7/월) + Persistent Disk 1GB(월 $0.25)를 `/var/data`에 마운트하고 환경변수 `DATA_DIR=/var/data` 추가 → 잠들지 않고 랭킹도 영구 보존. 코드 수정 불필요.

**밸런싱 팁**: 무료 티어에선 관리자 콘솔의 오버라이드도 재시작 시 날아가므로, 확정된 밸런스 값은 `server/config.defaults.json`에 반영해서 커밋하는 것을 권장.

## 배포 B안: 사내 서버 (직접 운영 시)

### 요구사항
- Node.js 18+ (그 외 아무것도 필요 없음 — DB, 빌드 도구 불필요)

### 배포 (3분)
```bash
# 1. 이 폴더 전체를 서버로 복사 (node_modules, server/data 제외)
# 2. 서버에서:
cd boom
npm install                      # express 하나만 설치됨
ADMIN_KEY=우리팀비밀키 PORT=3000 node server/server.js
```
→ 팀 공유 URL: `http://<서버IP>:3000`  (사내 방화벽에서 해당 포트 인바운드 허용 필요)

Windows 서버라면:
```bat
set ADMIN_KEY=우리팀비밀키 && set PORT=3000 && node server\server.js
```

## 상시 구동 (터미널 닫아도 유지)
```bash
npm i -g pm2
ADMIN_KEY=우리팀비밀키 pm2 start server/server.js --name boom
pm2 save && pm2 startup          # 서버 재부팅 시 자동 시작
```
pm2가 안 되는 환경이면: `nohup ADMIN_KEY=우리팀비밀키 node server/server.js > boom.log 2>&1 &`

## 운영
| 작업 | 방법 |
|---|---|
| 밸런스 튜닝 | `http://<서버IP>:3000/admin.html` → 키 입력 → 숫자 수정 → 저장. **다음 판부터 즉시 반영** (재배포·재시작 불필요) |
| 랭킹 리셋 | 관리자 콘솔의 "랭킹 전체 리셋" 버튼 |
| 랭킹 백업 | `server/data/scores.json` 파일 하나만 복사하면 끝 |
| 설정 원복 | 관리자 콘솔 "기본값으로 초기화" (원본: `server/config.defaults.json`) |
| 관리자 키 | 환경변수 `ADMIN_KEY` (미설정 시 기본값 `boom-admin` — 배포 시 반드시 변경) |

## 트러블슈팅
- **접속 안 됨**: 서버 방화벽/보안그룹에서 포트 확인. 서버 콘솔에 `boom → http://localhost:3000` 로그가 떠 있는지 확인.
- **랭킹이 안 쌓임**: `server/data/` 디렉토리 쓰기 권한 확인 (서버가 자동 생성).
- **사운드 안 남**: 첫 START 클릭 후부터 재생됨(브라우저 정책). M키가 음소거 토글.

## 개발 문서
- 개발 지침: `CLAUDE.md` / 기획서: `docs/GDD.md`
