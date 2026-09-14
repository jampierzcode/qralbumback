# Registro de cambios por fase — API (qralbumback)

Plan completo: `../IMPLEMENTATION_PLAN.md`

## Fase 0 — Seguridad

### Qué cambió
| Problema (auditoría) | Solución |
|---|---|
| `POST /api/auth/register` público creaba superadmins | **Eliminado.** Las cuentas admin se crean por CLI: `npm run admin:create -- --email=... --password=... --name="..."` |
| Contraseñas expuestas en respuestas | `User` excluye `password` por defecto (`defaultScope` + `toJSON`); controllers usan listas blancas de atributos |
| `GET /api/clients/:uuid` público devolvía email + contraseña | **Eliminado** (el frontend no lo usaba) |
| Contraseñas de clientes en texto plano | Se guardan con bcrypt; migración `20260914000002` hashea las existentes |
| Sin autorización por rol | `requireRole("superadmin","admin")` en todos los endpoints administrativos. Login sólo para roles admin |
| Subidas sin límites | `middleware/upload.js`: lista blanca de MIME por tipo, 100 MB/archivo, 20 archivos, verificación de que el tipo coincide |
| Temporales públicos | Temporales en `os.tmpdir()/qralbum-uploads`, **se borran siempre** (`finally`). Eliminado `express.static("/uploads")`. `uploads/` sale de git (`git rm --cached`, los archivos locales se conservan) |
| Sin manejo de errores | `middleware/errorHandler.js`: JSON consistente, mensajes humanos, sin trazas internas, errores de multer/JSON traducidos |
| `PUT /api/clients/:id` no hacía nada | Eliminado |
| `sequelize.sync()` | **Migraciones con Umzug** (`npm run db:migrate`). El servidor no arranca si hay migraciones pendientes |
| Arranque sin `JWT_SECRET` | El servidor falla con mensaje claro; en producción exige ≥32 caracteres |
| CORS abierto, sin cabeceras, sin rate limit | `CORS_ORIGINS`, `helmet`, límite de 10 intentos de login / 15 min |
| Llamadas a la API PHP sin timeout | Timeout de 120 s y error 502 claro. URL configurable con `LEGACY_MEDIA_API_URL` |
| `form-data` usado sin declarar | Declarado en `package.json` |

### Nuevos comandos
- `npm run db:migrate` / `db:migrate:status` / `db:migrate:down`
- `npm run admin:create -- --email=... --password=...`
- `npm test` (usa la base `qralbum_test`; nunca corre contra otra base)

### Cómo actualizar una instalación existente
1. **Respaldar la base:** `mysqldump -u USER -p NOMBRE_BD > respaldo.sql`
2. Completar `.env` según `.env.example` (`JWT_SECRET`, `CORS_ORIGINS`).
3. `npm install && npm run db:migrate` (la migración baseline detecta las tablas creadas por `sync()` y no las toca).
4. Crear un admin si no existe: `npm run admin:create -- ...`

### Pendiente / fuera del alcance de esta fase
- La API PHP externa (`apimultimedia.mcsolucionesti.com`) **no exige autenticación**: eso se corrige en el servidor PHP, no aquí. Los archivos nuevos dejarán de usarla en la Fase 1.
- Los 104 MB de `uploads/` siguen en el **historial** de git. Si el repo es público, conviene purgarlos con `git filter-repo`.

### Verificación
- `npm test`: 11/11 pruebas de seguridad pasan.
- Migraciones aplicadas sobre la base de desarrollo existente (creada con `sync()`) sin pérdida.

## Fase 1 — Nuevo modelo de negocio

### Qué cambió
- **Separación de entidades.** Un cliente ya no es un regalo:
  - `Users` → sólo cuentas **admin** (rol `cliente` queda como legado de sólo lectura).
  - `Customers` → quien compra (nombre, WhatsApp, email opcional, notas). **Sin contraseña.**
  - `Gifts` → el regalo: `slug` corto, `customerId` opcional, `templateId`, `templateVersion`, `status` (`draft`, `collecting_content`, `ready`, `published`, `archived`), `recipientName`, `senderName`, `occasion`, `content` JSON, `settings` JSON, `publishedAt`, `archivedAt`.
  - `MediaAssets` → pertenecen a un `Gift`; guardan variantes, dimensiones, placeholder, origen (`local`/`external`) y quién subió.
  - `ContentRequests` → base para links privados del portal (Fase 6): `status`, `allowedFields`, `expiresAt`, `revokedAt`, `lastUsedAt`, `submittedAt`.
  - `GiftEvents` → aperturas y otros eventos básicos.
- **Migraciones** `20260914000003` a `…06` crean las tablas; `…07` **copia** los álbumes legados.
- **Pipeline de media** (`services/media.js`):
  - Verifica el tipo real por firma binaria (no confía en el MIME del navegador).
  - Imágenes → `sharp`: respeta orientación EXIF, **elimina metadatos (incl. GPS)**, variantes WebP `thumb` 480px, `md` 1080px, `lg` 2048px y placeholder de 24px.
  - HEIC rechazado con mensaje claro (el navegador convertirá a JPEG en la Fase 6).
  - Límites: imagen 25 MB, audio 30 MB, video 150 MB.
  - Almacenamiento local en `storage/media/<assetId>/…` (fuera de git), servido en `/media` con cache inmutable y soporte `Range`.
  - Borrado seguro: los regalos duplicados comparten archivos y sólo se eliminan cuando nadie más los usa.
- **API admin** (`/api/admin`, JWT + rol):
  - `GET/POST /customers`, `GET/PATCH /customers/:id` (perfil + regalos + actividad).
  - `GET/POST /gifts` (filtros `q`, `status`, `templateId`, `customerId`, `from`, `to`, paginación), `GET/PATCH /gifts/:id`, `POST /gifts/:id/status`, `POST /gifts/:id/duplicate`, `POST /gifts/:id/media` (1 archivo por petición), `DELETE /gifts/:id/media/:assetId`.
- Dependencias muertas retiradas: `mongoose`, `qrcode`.

### Preservación de datos legados
- `…07-copy-legacy-albums` por cada `User` rol `cliente`:
  - crea un `Customer` (`legacyUserId`),
  - crea un `Gift` **publicado** con plantilla `yellow-flowers` y `legacyUuid` = uuid original (los QR impresos seguirán funcionando cuando la Fase 3 agregue la redirección),
  - copia cada `Multimedia` a `MediaAsset` `external` (la URL de la API PHP se conserva),
  - arma `content`: fotos → `photos`, videos → `videos`, primer audio → `song`. Los audios adicionales quedan como media del regalo.
- `Users` y `Multimedia` **no se modifican**. La migración es **idempotente** (probado ejecutándola dos veces).

### Verificación
- `npm test`: 22/22 (incluye EXIF eliminado, archivos falsos, HEIC, Range, duplicado con remapeo de media, migración legada idempotente).
- Migraciones aplicadas sobre la base de desarrollo.

## Fase 2 — Colecciones

### Qué cambió
- Migración `20260914000008`: tablas `TemplateListings` (registro comercial de una plantilla: nombre/descr. opcionales que sobrescriben el manifest, `isActive`, `sortOrder`), `Collections` (`slug`, nombre, descripción, portada, `isActive`, `sortOrder`) y `CollectionTemplates` (N:M con orden propio por colección).
- `services/templateRegistry.js`: el backend **lee los manifests y schemas de las plantillas del frontend** (`../qralbumfront/src/templates/<id>/manifest.js`, configurable con `TEMPLATES_ROOT`). Ignora carpetas que empiezan con `_` o `.`. Exige que `manifest.id` coincida con el nombre de la carpeta.
- `services/catalog.js`:
  - **Sincronización automática** al arrancar el servidor: cada plantilla nueva en el repo crea su listing y se agrega a sus colecciones sugeridas (`manifest.defaultCollections`). Nunca pisa ediciones del admin.
  - CRUD de colecciones, activar/desactivar, reordenar, asignar/ordenar plantillas, portada (procesada a WebP 1600×1200 con recorte inteligente).
  - Plantillas: listado con disponibilidad del código, colecciones y cantidad de regalos; editar nombre/descr./activo; reordenar.
- Crear un regalo ahora exige que la plantilla exista en el registro y toma `templateVersion` del manifest.
- `npm run db:seed`: crea las colecciones iniciales **Amor, Flores, Cumpleaños, Aniversario, Amistad** (idempotente por slug) y asigna plantillas.

### API nueva (`/api/admin`)
`GET /templates` · `PUT /templates/order` · `PATCH /templates/:templateId` · `GET/POST /collections` · `PUT /collections/order` · `PATCH /collections/:id` · `PUT /collections/:id/templates` · `POST /collections/:id/cover`

### Verificación
- `npm test`: 29/29 (plantillas de prueba en `tests/fixtures/templates`).
- Migración y seed aplicados en desarrollo. Mientras no exista `qralbumfront/src/templates` (Fase 3) el servidor avisa y el catálogo queda vacío, sin bloquear el arranque.

## Fase 3 — API pública del motor

- `GET /api/public/gifts/:slug`: sólo regalos **publicados**. Devuelve `gift` (slug, plantilla, versión, nombres, ocasión, content, settings) y `media` **sólo con los archivos referenciados** por el contenido (según el schema de la plantilla, vía `gift-core`). Nunca incluye cliente, notas, estado interno, id interno ni nombres originales de archivos.
- `POST /api/public/gifts/:slug/events` (`opened`, `completed`, `music_started`), rate limit 30/min por IP.
- `GET /api/public/legacy/:uuid` → `{ slug }` para los links y QR antiguos.
- `services/giftCore.js` carga `../qralbumfront/gift-core` (configurable con `GIFT_CORE_PATH`).
- Fixture `yellow-flowers` de pruebas con schema real de `gift-core`.

Verificación: `npm test` 34/34 (incluye que la respuesta pública no filtre datos privados ni media no usada, y que archivar retire el regalo).

## Fase 4 — Validación con el schema de la plantilla

- `services/contentValidation.js`:
  - **Guardar** (`PATCH /api/admin/gifts/:id` con `content`): valida en modo borrador con el `schema.js` real de la plantilla y `gift-core`; respuesta `422` con `details.errors: [{ path, message }]`.
  - `recipientName` / `senderName` dentro de `content` se guardan en las columnas del Gift.
  - **Fusión**: sólo se reemplazan las claves enviadas; se descartan claves desconocidas y se conservan las de versiones anteriores de la plantilla.
  - Las referencias `{ assetId }` deben pertenecer al **mismo regalo** y ser del **tipo correcto**.
  - **Publicar** exige contenido completo (obligatorios y mínimos) → `422 "Faltan datos para publicar el regalo."` con la lista de campos.
  - **Borrar un archivo** quita sus referencias del contenido.
- `tests/realTemplates.test.js`: carga las plantillas **reales** de `qralbumfront` y valida sus schemas en el servidor.
- `db/migrator.js`: `logger: undefined` ahora silencia los logs.

Verificación: `npm test` 41/41.
