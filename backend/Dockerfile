FROM node:22-bookworm-slim

WORKDIR /app/backend

# O modo Docker usa HTTPS em desenvolvimento; openssl permite gerar o
# certificado local caso `infra/certs` ainda esteja vazio.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm ci

COPY backend ./
COPY infra /app/infra

EXPOSE 3001

CMD ["node", "docker-entrypoint.cjs"]
