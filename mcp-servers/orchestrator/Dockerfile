# ── 빌드 스테이지 ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev

# ── 실행 스테이지 ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# 보안: non-root 사용자로 실행
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY index.js ./
COPY package.json ./

USER appuser

EXPOSE 5000

# ECS 헬스체크
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["node", "index.js"]
