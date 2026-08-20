FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh","-c","pnpm run config:validate && pnpm run db:configure-role && pnpm run db:migrate && pnpm run start -- --hostname 0.0.0.0 --port 3000"]
