FROM node:22-bookworm-slim

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci

COPY backend ./
COPY infra /app/infra

EXPOSE 3001

CMD ["node", "docker-entrypoint.cjs"]
