FROM node:20-alpine
WORKDIR /app

# non-root 유저 생성
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package.json .
RUN npm install

COPY index.js .

# 소유권 변경
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 5004
CMD ["node", "index.js"]
