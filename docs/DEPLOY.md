# Despliegue en Railway (un solo servicio)

El servicio `qralbumback` sirve **API + frontend + media** desde el mismo dominio:

- `npm run build` (`scripts/build-web.js`) descarga `qralbumfront@WEB_REF` en `./web` y lo compila.
  El backend usa de ahí las plantillas, `gift-core` y `dist/`.
- Mismo origen → sin CORS y `/g/:slug` lleva Open Graph (vista previa en WhatsApp).
- Media en un bucket S3 (`STORAGE_DRIVER=s3`). Railway Buckets son privados: `/media/<clave>` responde 302 a una
  URL firmada (7 días, firma fija por día para que el navegador reutilice su cache). Los bytes salen del bucket.
- `railway.json`: build `npm run build`, arranque `npm run db:migrate && npm start`, healthcheck `/api/health`.

## Servicios

1. **MySQL** (plantilla de Railway).
2. **Bucket** (Railway Buckets) para fotos, audio y video.
3. **qralbumback** (este repo). No necesita Volume.

## Variables de `qralbumback`

```
NODE_ENV=production
JWT_SECRET=<openssl rand -hex 32>
PORTAL_TOKEN_SECRET=<openssl rand -hex 32>
FORCE_HTTPS=true
PUBLIC_URL=https://<dominio público>

DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
DB_NAME=${{MySQL.MYSQLDATABASE}}

STORAGE_DRIVER=s3
S3_ENDPOINT=https://t3.storageapi.dev
S3_REGION=auto
S3_BUCKET=<Bucket Name>
S3_ACCESS_KEY_ID=<Access Key ID>
S3_SECRET_ACCESS_KEY=<Secret Access Key>
TEMPLATES_ROOT=web/src/templates
GIFT_CORE_PATH=web/gift-core/index.js
WEB_DIST_DIR=web/dist
WEB_REPO=jampierzcode/qralbumfront
WEB_REF=main
```

`PORT` lo pone Railway. `CORS_ORIGINS` y `VITE_API_URL` quedan vacíos (mismo origen).

## Cambios en el frontend

El frontend **no se redespliega solo** en Railway: después de hacer push a `qralbumfront`, redeploy de `qralbumback`.

## Migraciones y primer administrador

Las migraciones corren solas al arrancar (`npm run db:migrate && npm start`). También se pueden correr desde tu
computadora con la URL pública de la base (Railway → MySQL → Connect → Public Network):

```
DB_HOST=<host público> DB_PORT=<puerto> DB_USER=root DB_PASSWORD='<clave>' DB_NAME=railway JWT_SECRET=x npm run db:migrate
DB_HOST=<host público> DB_PORT=<puerto> DB_USER=root DB_PASSWORD='<clave>' DB_NAME=railway JWT_SECRET=x \
  npm run admin:create -- --email=tu@correo.com --password='UnaClaveLarga123' --name="Tu nombre"
```

## Datos del sistema anterior

Si existe la base anterior (tablas `Users` rol cliente y `Multimedia`), importar su dump en el MySQL de Railway
**antes** del primer deploy. La migración `copy-legacy-albums` copia cada cliente a un regalo y los links viejos
`/c/:uuid` y `/:uuid` redirigen al regalo nuevo.

## Dominio anterior en Vercel

Los QR ya vendidos apuntan al dominio de Vercel. Mantener ese proyecto con un `vercel.json` que redirige todo al
dominio nuevo (`redirects` se evalúan antes que los archivos estáticos).
