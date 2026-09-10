# ultimate-lists Matrix widget - static nginx image.
#
# Built on-cluster with the Docker strategy from a staged binary context
# (deploy/build-context: Dockerfile + nginx/ + a fresh dist/), per the marcade
# house pattern. dist/ is produced on the operator machine by `yarn build`;
# nothing is compiled in-container.

FROM docker.io/library/alpine:3.20 AS compress

RUN apk add --no-cache brotli gzip

COPY dist /src

# Precompress the hashed assets. gzip siblings sit next to the originals and are
# picked up by nginx's gzip_static; brotli goes into a parallel tree so the files
# keep their real extensions and nginx still derives the right MIME type.
RUN set -eux; \
    mkdir -p /out/identity /out/br; \
    cp -a /src/. /out/identity/; \
    cd /out/identity; \
    find . -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.svg' -o -name '*.json' \) -size +1k \
        | while read -r f; do \
            gzip -9 -k -f "$f"; \
            mkdir -p "/out/br/$(dirname "$f")"; \
            brotli -q 11 -f -o "/out/br/$f" "$f"; \
          done; \
    find /out/br -type f | head -20

FROM docker.io/nginxinc/nginx-unprivileged:1-alpine

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=compress /out/identity /usr/share/nginx/html
COPY --from=compress /out/br       /usr/share/nginx/html-br

EXPOSE 8080
