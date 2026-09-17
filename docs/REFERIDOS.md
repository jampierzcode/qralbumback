# Referidos

Personas que venden tus regalos. Crean el regalo, te pagan (Yape) y **tú apruebas**: recién ahí aparece
el link y el QR. Así nadie vende por su cuenta sin pagarte.

## Flujo

1. **Tú** creas la cuenta en **Referidos → Nuevo referido** (nombre, correo, contraseña, WhatsApp).
2. **El referido** entra al mismo panel (`/login`) y sólo ve lo suyo: sus regalos y sus clientes.
3. Arma el regalo como cualquiera. Mientras no esté aprobado **no hay link ni QR** (la API ni siquiera
   le envía el `slug`).
4. Pulsa **Enviar a aprobación**: el regalo queda `pending`, se le congela el precio de la plantilla y
   puede adjuntar el comprobante del Yape (opcional; muchos lo mandan por WhatsApp).
5. **Tú** lo ves en **Regalos → Por aprobar** (o en Inicio). Abres **Revisar**: ves el comprobante,
   ajustas el precio y **Apruebas y publicas** o **Rechazas** con una nota.
6. Al aprobar, el regalo se publica y el referido ya ve **Link y QR**.
7. En **Referidos** ves cuánto te debe cada uno. Cuando te paga, **Marcar como pagado**.

## Precios

`TemplateListings.referralPrice` (Plantillas → Editar → *Precio para referidos*) define lo que te paga
por cada regalo de esa plantilla. Se copia al regalo al enviarlo a aprobación (`Gifts.price`), así un
cambio de precios no altera lo ya vendido. En la revisión puedes cambiar el monto de ese regalo.

## Precio de venta y ganancia

`Gifts.salePrice` (opcional) es lo que el vendedor le cobró a **su** cliente. Se pregunta al enviar a
aprobación y se puede corregir en el editor. Con eso:

- El referido ve en cada regalo *"Te cuesta S/5 · Lo vendiste en S/25 · Ganas S/20"* y el total en **Mi cuenta**.
- Tú ves en **Referidos** cuánto vendió y ganó cada uno, para saber si el sistema les conviene.

No afecta lo que te deben: eso siempre es `price` (el precio de la plantilla).

## Mi negocio (cada vendedor)

`/admin/business` — lo ven el dueño y cada referido:

- **Mis precios** (`SellerTemplatePrices`): a cuánto vende él cada plantilla. Al crear un regalo, ese
  precio se copia a `Gifts.salePrice`, así su ganancia sale sola.
- **Cómo te pagan** (`PaymentMethods`): Yape, Plin, BIM o transferencia. Son los datos que verá su
  cliente final al pagar. Cada vendedor sólo ve y edita los suyos.

En **Mi cuenta**, si el referido debe algo, se le muestran los datos de pago **del dueño**
(`GET /admin/owner-payment-methods`) para que sepa a dónde yapear.

## Permisos

| | Admin | Referido |
|---|---|---|
| Ver/editar regalos | todos | sólo los suyos |
| Clientes | todos | sólo los que él registró |
| Publicar | sí | no (sólo al aprobarse) |
| Link y QR | siempre | sólo si está aprobado |
| Plantillas y colecciones | administrar | sólo usarlas |
| Referidos y aprobaciones | sí | no |
| Cuenta por pagar | de todos | la suya (`/admin/account`) |

Una cuenta desactivada (`Users.isActive = false`) ya no puede entrar.

## Datos

- `Users.role = "referido"`, `isActive`, `phone`.
- `Gifts.createdById`, `reviewStatus` (none/pending/approved/rejected), `submittedAt`, `reviewedAt`,
  `reviewedById`, `reviewNote`, `price`, `currency`, `paidAt`, `paymentProofAssetId`.
- `Customers.createdById`.
- `TemplateListings.referralPrice`.

El comprobante se guarda como `MediaAsset` (`uploadedBy = "referral"`) pero **no** aparece en el editor
ni en el contenido del regalo.

## Más adelante: pagos automáticos

Hoy el cobro es manual (Yape) y el sistema sólo lleva la cuenta. Cuando se integre una pasarela
(Culqi), el pago del referido puede aprobar el regalo solo: bastaría llamar a `referrals.review(...)`
desde el webhook de pago y dejar el flujo manual como respaldo.

## Lista de invitados (link del comprador)

Las plantillas con `collectsResponses: ["rsvp"]` generan un segundo link, de sólo lectura, para quien
compró la invitación: `/lista/<token>` (`GET /api/public/guest-list/:token`). Muestra el resumen y las
respuestas, se actualiza al volver a la pestaña y no expone nada del regalo (ni slug, ni precios).

El token se firma como el del portal pero con otra clave (`utils/guestListToken.js`), así un link no
sirve para el otro. Se copia desde el editor → **Confirmaciones**.
