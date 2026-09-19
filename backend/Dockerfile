FROM node:20-alpine

WORKDIR /app

# Dependencias primero (cachea la capa si el codigo cambia pero no el package.json)
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

# Carpeta de las fotos subidas. En el VPS se monta encima un VOLUMEN
# PERSISTENTE; sin eso las fotos se borran en cada redeploy.
RUN mkdir -p /app/uploads
ENV UPLOADS_DIR=/app/uploads

ENV NODE_ENV=production
EXPOSE 3001

# El healthcheck usa el endpoint que ya expone la app (src/index.js)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
