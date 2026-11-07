# Provedor S3 (opcional)

Guarda os arquivos em um bucket S3 ou compatível (MinIO, R2, Backblaze). Usado quando
`STORAGE_PROVIDER=s3`.

## Ligar

Defina `STORAGE_PROVIDER=s3`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID` e
`S3_SECRET_ACCESS_KEY`. Para MinIO ou outro serviço, acrescente `S3_ENDPOINT` (o provedor passa a usar
endereçamento por caminho). O bucket deve ser privado: todo download passa pelo app, que confere a
sessão e o tenant.

### MinIO local (opcional)

O `docker-compose.yml` traz um serviço `minio` comentado. Descomente, crie o bucket `bizu` no
console (`http://localhost:9001`) e use `S3_ENDPOINT=http://localhost:9000`, `S3_REGION=us-east-1`.

## Remover

1. `STORAGE_PROVIDER=local` (ou deixe a variável vazia).
2. Apague esta pasta (`src/lib/storage/providers/s3/`).
3. `npm uninstall @aws-sdk/client-s3`.

`npm run check:module-removal -- s3` prova que typecheck e testes passam sem a pasta.
