# Pedidos desde el link público

Cada vendedor (dueño o referido) comparte `/pedir/<handle>`. El cliente final elige su regalo, lo arma
él mismo, ve cómo pagar y envía su solicitud. Nadie recibe un link de regalo sin que alguien apruebe.

## Recorrido

1. **`/pedir/<handle>`** (`GET /api/public/store/:handle`): nombre y mensaje del vendedor y su catálogo.
   Sólo aparecen las plantillas **con precio de venta puesto**: el cliente siempre ve cuánto cuesta.
2. **"Lo quiero"** pide nombre y WhatsApp (`POST /api/public/store/:handle/orders`, 10 por hora por IP).
   Se crea el `Customer`, el `Gift` (`requestStatus: "draft"`, `salePrice` del vendedor) y un
   `ContentRequest` de 14 días. Devuelve el token del portal de siempre.
3. **`/upload/<token>`**: el portal ya existente. El cliente llena el contenido y sube sus fotos.
4. **Paso de pago** (`order` en `GET /api/portal/:token`): precio, medios de pago del vendedor y
   comprobante opcional (`POST /api/portal/:token/payment-proof`).
5. **Enviar solicitud** (`POST /api/portal/:token/submit`): el regalo pasa a `requestStatus: "pending"`.
6. **El vendedor** lo ve en **Regalos → Pedidos nuevos**, abre **Ver pedido**, mira el comprobante y
   **Acepta** (`POST /api/admin/gifts/:id/order-review`) o rechaza.
7. Si el vendedor es un referido, el regalo sigue el camino de siempre: lo envía a aprobación del dueño
   y el link recién sale cuando el dueño aprueba. Aceptar el pedido **no** salda lo que le debe al dueño.

## Ajustes del vendedor (`/admin/business`)

- `Users.handle` (link), `publicName`, `publicMessage`, `ordersEnabled`.
- Precios: `SellerTemplatePrices`. Cobros: `PaymentMethods`.

## Datos del pedido en `Gifts`

`requestStatus` (none/draft/pending/accepted/rejected), `requesterName`, `requesterPhone`,
`requestedAt`, `requestNote`, `clientProofAssetId`. El comprobante del cliente, igual que el del
referido, **no** aparece entre las fotos del regalo.
