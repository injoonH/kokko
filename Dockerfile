# syntax=docker/dockerfile:1
FROM dhi.io/node:24.21.0-debian13-dev@sha256:fe11b55fe5d9fca88aef74eac1c4a626646b89c1485ee7be7c30995afe33c67f AS web
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
RUN pnpm --filter @kokko/web build

FROM dhi.io/golang:1.27.2-debian13-dev@sha256:161ddbe786e8efdca83c5218312d1343c6ad84332929f4df4b2b7c4fa66daebf AS server
WORKDIR /src
COPY apps/server/go.mod apps/server/go.sum ./
RUN go mod download
COPY apps/server/ ./
RUN CGO_ENABLED=0 go test ./... && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/kokko .
RUN mkdir -p /out/data/pb_data && chown -R 65532:65532 /out/data

FROM dhi.io/static:20250419-debian13@sha256:98ef7a853608577e8d66dad1d25ada75d745d782f28d84e9ecfb85dfeb1f9c98
WORKDIR /app
COPY --from=server /out/kokko /app/kokko
COPY --from=server --chown=65532:65532 /out/data /data
COPY --from=web /src/apps/web/dist /app/public
COPY --from=web /src/apps/web/src/components/ui/LICENSE /app/licenses/shadcn-ui-LICENSE
USER 65532:65532
ENV KOKKO_DATA_DIR=/data/pb_data KOKKO_PUBLIC_DIR=/app/public TZ=UTC
EXPOSE 8080 8443
ENTRYPOINT ["/app/kokko"]
CMD ["serve", "--http=0.0.0.0:8080"]
