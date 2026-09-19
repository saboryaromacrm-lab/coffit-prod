# Build: compila el frontend con Node
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# .env.production ya trae VITE_API_URL correcto y va commiteado al repo
RUN npm run build

# Runtime: sirve el estatico compilado con nginx (liviano, sin Node en produccion)
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/index.html > /dev/null || exit 1
