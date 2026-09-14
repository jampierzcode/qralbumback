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
