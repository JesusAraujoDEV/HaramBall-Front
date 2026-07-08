# ---- Build stage: export the Expo web bundle to static files ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV CI=1

# EXPO_PUBLIC_* values are inlined at BUILD time, so they must be provided as
# build args (set them in Dokploy's "Build Args"). API base URL must be the
# PUBLIC backend URL — never localhost.
ARG EXPO_PUBLIC_API_BASE_URL
ARG EXPO_PUBLIC_LOCK_TIMEOUT_MS=60000
ARG EXPO_PUBLIC_CLIPBOARD_CLEAR_MS=20000
ARG EXPO_PUBLIC_ARGON2_PROFILE=interactive
ENV EXPO_PUBLIC_API_BASE_URL=$EXPO_PUBLIC_API_BASE_URL \
    EXPO_PUBLIC_LOCK_TIMEOUT_MS=$EXPO_PUBLIC_LOCK_TIMEOUT_MS \
    EXPO_PUBLIC_CLIPBOARD_CLEAR_MS=$EXPO_PUBLIC_CLIPBOARD_CLEAR_MS \
    EXPO_PUBLIC_ARGON2_PROFILE=$EXPO_PUBLIC_ARGON2_PROFILE

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx expo export --platform web --output-dir dist

# ---- Serve the static bundle with nginx ----
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
