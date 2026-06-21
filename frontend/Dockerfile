FROM node:22-bookworm-slim

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
COPY infra /app/infra

EXPOSE 5173 3000

CMD ["npm", "run", "dev"]
