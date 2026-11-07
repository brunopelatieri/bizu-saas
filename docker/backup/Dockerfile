# Serviço de backup (perfil `backup` do docker-compose.yml). Só entra em quem o liga.
# O cliente do Postgres precisa ser da mesma versão maior do servidor (16).
FROM postgres:16-alpine

RUN apk add --no-cache age tar

COPY backup.sh restore-test.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore-test.sh

# Sem o entrypoint do Postgres: aqui só rodam os scripts.
ENTRYPOINT ["/usr/local/bin/backup.sh"]
CMD ["loop"]
