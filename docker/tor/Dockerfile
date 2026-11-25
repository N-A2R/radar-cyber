# syntax=docker/dockerfile:1.7
# Client SOCKS5 pour les sources .onion : aucun service caché hébergé.
# Les paquets sont installés à la construction ; aucun apk au démarrage et
# aucune écriture root sur le système de fichiers en lecture seule.
FROM alpine:3.24@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf

RUN apk add --no-cache tor netcat-openbsd \
    && addgroup -g 10001 -S torclient \
    && adduser -u 10001 -S -G torclient -h /var/lib/tor -s /sbin/nologin torclient \
    && mkdir -p /var/lib/tor \
    && chown 10001:10001 /var/lib/tor \
    && chmod 0700 /var/lib/tor

# Configuration en lecture seule, fournie par le build (jamais réécrite à l'exécution).
COPY --chown=10001:10001 docker/tor/torrc /etc/tor/torrc

USER 10001:10001
EXPOSE 9050
HEALTHCHECK --interval=30s --timeout=5s --retries=10 --start-period=40s \
  CMD nc -z 127.0.0.1 9050 || exit 1
ENTRYPOINT ["tor"]
CMD ["-f", "/etc/tor/torrc"]
