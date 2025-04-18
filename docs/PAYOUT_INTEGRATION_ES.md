# Integración de Pagos de Binance

## Resumen

El Gateway de Pagos Criptográficos ahora soporta pagos automatizados a través de Binance, permitiendo a los comerciantes enviar criptomonedas de forma programática a sus clientes o proveedores. Este documento describe cómo utilizar e integrarse con la funcionalidad de pagos.

## Requisitos Previos

- Cuenta de Binance con acceso API habilitado
- Fondos suficientes en tu billetera de Binance
- Claves API con permisos de retiro
- Direcciones de retiro autorizadas en la configuración de Binance

## Configuración

### 1. Configurar credenciales API de Binance

Añade las siguientes variables de entorno a tu archivo `.env`:

```
BINANCE_API_KEY=tu_clave_api_binance
BINANCE_API_SECRET=tu_secreto_api_binance
BINANCE_PAYOUT_ENABLED=true
```

### 2. Autorizar direcciones de retiro

Por razones de seguridad, Binance requiere que todas las direcciones de retiro estén autorizadas. Añade las direcciones de los destinatarios a través de la interfaz web de Binance antes de intentar retiros.

## Realizar un Pago

### Endpoint de API

```
POST /api/v1/payout
```

### Parámetros de Solicitud

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| amount | string | Sí | Cantidad a retirar (ejemplo: "0.05") |
| currency | string | Sí | Código de moneda (ejemplo: "USDT", "BTC") |
| network | string | Sí | Red blockchain (ejemplo: "BSC", "ETH", "BTC") |
| recipientAddress | string | Sí | Dirección de la billetera del destinatario |
| merchantId | string | Sí | Tu ID de comerciante |
| webhookUrl | string | No | URL para recibir actualizaciones de estado |
| callbackUrl | string | No | URL para redirección después de completar |
| metadata | object | No | Metadatos personalizados para tu referencia |

### Ejemplo de Solicitud

```json
{
  "amount": "50.00",
  "currency": "USDT",
  "network": "BSC",
  "recipientAddress": "0x123456789abcdef...",
  "merchantId": "mer_abc123",
  "webhookUrl": "https://tu-dominio.com/webhooks/crypto",
  "metadata": {
    "orderId": "pedido_123",
    "customerName": "Juan Pérez"
  }
}
```

### Respuesta

```json
{
  "success": true,
  "data": {
    "id": "tx_d3f4c5e6f7",
    "status": "PENDING",
    "amount": "50.00",
    "currency": "USDT",
    "network": "BSC",
    "recipientAddress": "0x123456789abcdef...",
    "createdAt": "2025-04-18T00:00:00.000Z"
  }
}
```

## Eventos de Webhook

El sistema enviará notificaciones de webhook con los siguientes eventos:

| Evento | Descripción |
|--------|-------------|
| PAYOUT_PENDING | El pago ha sido creado y está pendiente de procesamiento |
| PAYOUT_PROCESSING | El pago está siendo procesado por Binance |
| PAYOUT_COMPLETED | El pago se ha completado con éxito |
| PAYOUT_FAILED | El pago falló al procesarse |

### Ejemplo de Carga Útil de Webhook

```json
{
  "event": "PAYOUT_COMPLETED",
  "data": {
    "id": "tx_d3f4c5e6f7",
    "status": "COMPLETED",
    "amount": "50.00",
    "currency": "USDT",
    "network": "BSC",
    "recipientAddress": "0x123456789abcdef...",
    "txHash": "0xabcdef1234567890...",
    "completedAt": "2025-04-18T00:05:00.000Z"
  }
}
```

## Manejo de Errores

El procesamiento de pagos se maneja a través de un sistema de colas con mecanismos de respaldo:

1. Si RabbitMQ está disponible, los pagos se procesan a través de la cola `binance.payout`
2. Si RabbitMQ no está disponible, el sistema entra en "modo de respaldo" y procesa los pagos directamente
3. Los pagos fallidos resultan en que el estado de la transacción se establece como `FAILED` y se envía una notificación webhook

Escenarios comunes de error:

- Fondos insuficientes en la billetera de Binance
- Dirección de destinatario inválida
- Congestión de red o tiempos de espera
- Limitación de tasa de la API de Binance
- Dirección del destinatario no autorizada en Binance

## Interfaz Web

El Gateway de Pagos Criptográficos incluye una interfaz web para iniciar pagos. Accede a ella a través de:

```
/payment-webapp/index.html
```

Selecciona la pestaña "Enviar Pago" para utilizar la funcionalidad de pagos.

## Flujo de Estado de Transacción

Los pagos siguen esta progresión de estados:

1. `PENDING` - Estado inicial cuando se crea el pago
2. `CONFIRMING` (etiquetado como PROCESSING en webhooks) - Está siendo procesado por Binance
3. `COMPLETED` - Procesado con éxito
4. `FAILED` - Procesamiento fallido

## Limitaciones

- Los mínimos de retiro están determinados por las políticas de Binance
- Las tarifas de retiro son establecidas por Binance y pueden variar según la moneda y la red
- Binance puede deshabilitar temporalmente los retiros por mantenimiento 