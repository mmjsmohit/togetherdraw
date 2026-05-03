FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN pnpm install --frozen-lockfile
RUN pnpm run build
RUN pnpm deploy --filter=@repo/http-backend --prod /prod/http-backend
RUN pnpm deploy --filter=@repo/ws-backend --prod /prod/ws-backend
RUN pnpm deploy --filter=web --prod /prod/web

FROM base AS app1
COPY --from=build /prod/http-backend /prod/http-backend
WORKDIR /prod/http-backend
EXPOSE 4000
CMD [ "pnpm", "start" ]

FROM base AS app2
COPY --from=build /prod/ws-backend /prod/ws-backend
WORKDIR /prod/ws-backend
EXPOSE 4001
CMD [ "pnpm", "start" ]

FROM base AS app3
COPY --from=build /prod/web /prod/web
WORKDIR /prod/web
EXPOSE 3000
CMD [ "pnpm", "start" ]

FROM base AS app
COPY --from=build /prod/http-backend /prod/http-backend
COPY --from=build /prod/ws-backend /prod/ws-backend
COPY --from=build /prod/web /prod/web
COPY docker/start-all.sh /usr/local/bin/start-all.sh
RUN chmod +x /usr/local/bin/start-all.sh
EXPOSE 3000 4000 4001
CMD [ "start-all.sh" ]
