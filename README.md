# TestFlow

Figma 덤프 JSON → Mermaid → TC(이력) → headed 브라우저 실행 · 가상 마우스 · 로그 · 녹화.

## 개발

```bash
pnpm install
pnpm --filter @testflow/playwright-runner exec playwright install chromium
pnpm dev
```

- 웹: http://127.0.0.1:5173
- API: http://127.0.0.1:3001/health
- Figma 토큰: 레포 루트 `.env`의 `FIGMA_ACCESS_TOKEN` 또는 앱에서 로컬 저장 (`data/settings.json`). `VITE_*`로 넣지 않습니다. 웹 번들에는 시크릿이 없습니다.
- Mermaid: 덤프 선택 후 「Mermaid 생성」 (`POST /api/mermaid`)
- TC: Mermaid 선택 후 「TC 생성」 (`POST /api/tc`). 수정·복원은 버전 이력에 남습니다.
- 실행: TC 선택 후 startUrl을 넣고 「실행」. headed Chromium, 실패 시 중단, `events.jsonl` + `video.webm`.
- 제한: 스텝 타임아웃 15초, 런 보관 50개.

Electron (웹·API 빌드 후 API를 띄움):

```bash
pnpm electron:dev
```
