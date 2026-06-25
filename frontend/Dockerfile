# ---------- Frontend Dockerfile (multi-stage) ----------
# Stage 1: build the React app with CRA
FROM node:20-alpine AS builder

WORKDIR /app

# Better layer caching — yarn.lock is optional (the [k] glob lets COPY succeed
# even if yarn.lock is absent from the build context; yarn will create one).
COPY package.json ./
COPY yarn.loc[k] ./
RUN yarn install --network-timeout 600000

# REACT_APP_* must be present at build-time for CRA to embed them
ARG REACT_APP_BACKEND_URL=http://localhost:8001
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

COPY . .
RUN yarn build

# Stage 2: serve static build via nginx
FROM nginx:1.27-alpine

# Drop default config — we ship our own
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O- http://localhost/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
