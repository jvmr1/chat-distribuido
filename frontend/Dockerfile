FROM node:22-bookworm-slim

WORKDIR /app/frontend

# O Vite e o gateway local sobem com HTTPS; openssl gera o certificado de
# desenvolvimento quando `infra/certs` ainda nao existe.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
COPY infra /app/infra

EXPOSE 5173 3000

CMD ["npm", "run", "dev"]
