# gcsolar-landing-page

Landing page institucional da GC Solar.

## Estrutura

- `index.html`
- `style.css`
- `script.js`
- `image_copy-bg.png`
- `printsistema.png`

## Deploy automatico

O deploy roda via GitHub Actions em todo push na branch `main`.

- `.github/workflows/pages.yml`: publica automaticamente no GitHub Pages (com `CNAME` para `gc.solar`).
- `.github/workflows/deploy.yml`: deploy por SSH para servidor proprio (executa apenas se os secrets existirem).

### Secrets necessarios no GitHub

- `SSH_HOST`: host do servidor (ex.: `gc.solar` ou IP)
- `SSH_USER`: usuario SSH de deploy
- `SSH_PRIVATE_KEY`: chave privada SSH (preferencialmente ED25519)
- `SSH_PORT`: porta SSH (ex.: `22`)
- `SSH_TARGET_DIR`: pasta de destino no servidor (ex.: `/var/www/gc.solar`)

### Comportamento

- Envia apenas os arquivos da landing.
- Remove arquivos antigos no destino para manter o servidor sincronizado com o repositório.
- Executa `docker stack deploy` no servidor para publicar em `gc.solar` via Traefik.
