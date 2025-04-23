# Manual de Integración para Aplicaciones de Terceros

## Índice

1. [Introducción](#introducción)
2. [Requisitos Previos](#requisitos-previos)
3. [Proceso de Registro](#proceso-de-registro)
4. [Autenticación y Seguridad](#autenticación-y-seguridad)
5. [Documentación de la API](#documentación-de-la-api)
6. [Implementación de Webhooks](#implementación-de-webhooks)
7. [Entorno de Pruebas (Sandbox)](#entorno-de-pruebas-sandbox)
8. [Ejemplos de Integración](#ejemplos-de-integración)
9. [Manejo de Errores](#manejo-de-errores)
10. [Mejores Prácticas](#mejores-prácticas)
11. [Glosario](#glosario)
12. [Soporte Técnico](#soporte-técnico)

## Introducción

Bienvenido al manual de integración de nuestra pasarela de pagos con criptomonedas. Este documento proporciona toda la información necesaria para que puedas integrar tu aplicación con nuestro sistema y comenzar a aceptar pagos en criptomonedas de manera rápida y segura.

Nuestra pasarela de pagos permite procesar transacciones en diferentes criptomonedas, ofreciendo a tus clientes opciones flexibles de pago mientras tú recibes liquidaciones en la moneda de tu elección.

### Características Principales

- Procesamiento de pagos en múltiples criptomonedas (USDT, BNB, etc.)
- Conversión automática a moneda fiat (opcional)
- Notificaciones en tiempo real mediante webhooks
- Panel de control para seguimiento de transacciones
- Protección contra fraudes y doble gasto
- API RESTful completa y documentada

## Requisitos Previos

Antes de comenzar la integración, asegúrate de contar con:

- Una cuenta de comerciante en nuestra plataforma
- Conocimientos básicos de desarrollo web y APIs RESTful
- Capacidad para recibir webhooks (URLs públicamente accesibles)
- Entorno de desarrollo con soporte para:
  - Peticiones HTTP
  - Manejo de JSON
  - Verificación de firmas HMAC

## Proceso de Registro

### 1. Crear una Cuenta de Comerciante

Para comenzar, debes registrarte como comerciante en nuestra plataforma:

1. Visita [https://eoscryptopago.com/register](https://eoscryptopago.com/register)
2. Completa el formulario de registro con la información de tu negocio
3. Verifica tu correo electrónico
4. Completa el proceso de verificación KYC/KYB (Know Your Customer/Business)

### 2. Obtener Credenciales de API

Una vez verificada tu cuenta, podrás generar tus credenciales de API:

1. Inicia sesión en el panel de control
2. Navega a "Configuración" > "API y Desarrolladores"
3. Haz clic en "Generar Nuevas Credenciales"
4. Guarda de forma segura tu `API_KEY` y `API_SECRET`

> **IMPORTANTE**: Nunca compartas tu `API_SECRET` ni lo incluyas en código del lado del cliente. Esta clave debe mantenerse segura en todo momento.

## Autenticación y Seguridad

### Autenticación de API

Todas las peticiones a nuestra API deben incluir los siguientes encabezados:

```
X-API-KEY: tu_api_key
X-TIMESTAMP: timestamp_actual_en_milisegundos
X-SIGNATURE: firma_hmac
```

La firma HMAC se genera de la siguiente manera:

```javascript
// Ejemplo en JavaScript
const crypto = require('crypto');

function generarFirma(apiSecret, timestamp, cuerpoRequest) {
  const mensaje = timestamp + (cuerpoRequest ? JSON.stringify(cuerpoRequest) : '');
  return crypto.createHmac('sha256', apiSecret).update(mensaje).digest('hex');
}

const timestamp = Date.now().toString();
const firma = generarFirma('tu_api_secret', timestamp, requestBody);
```

### Seguridad de Webhooks

Para verificar que los webhooks provienen de nuestra plataforma, cada notificación incluye una firma en el encabezado `X-WEBHOOK-SIGNATURE`. Debes validar esta firma antes de procesar cualquier notificación:

```javascript
// Ejemplo en JavaScript
function verificarWebhook(cuerpoWebhook, firmaRecibida, webhookSecret) {
  const firmaCalculada = crypto.createHmac('sha256', webhookSecret)
    .update(JSON.stringify(cuerpoWebhook))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(firmaCalculada, 'hex'),
    Buffer.from(firmaRecibida, 'hex')
  );
}
```

## Documentación de la API

### Endpoints Principales

#### Crear una Orden de Pago

```
POST /api/v1/payment-orders
```

Crea una nueva orden de pago para que un cliente pueda realizar un pago en criptomonedas.

**Parámetros de la Solicitud:**

```json
{
  "amount": 100.50,
  "currency": "USD",
  "description": "Pago por Servicio Premium",
  "order_id": "ORD-12345",
  "customer": {
    "email": "cliente@ejemplo.com",
    "name": "Juan Pérez"
  },
  "crypto_currency": "USDT",
  "callback_url": "https://tu-tienda.com/webhooks/crypto-payments",
  "success_url": "https://tu-tienda.com/pago-exitoso",
  "cancel_url": "https://tu-tienda.com/pago-cancelado",
  "metadata": {
    "product_id": "PRD-789",
    "customer_id": "CUS-456"
  },
  "expiration_minutes": 30
}
```

**Respuesta:**

```json
{
  "success": true,
  "data": {
    "payment_order_id": "PO-987654321",
    "status": "pending",
    "amount": 100.50,
    "currency": "USD",
    "crypto_amount": 100.25,
    "crypto_currency": "USDT",
    "payment_address": "0x1234567890abcdef1234567890abcdef12345678",
    "qr_code_url": "https://api.eoscryptopago.com/qr/PO-987654321",
    "payment_url": "https://pay.eoscryptopago.com/PO-987654321",
    "expiration_time": "2023-06-01T15:30:00Z"
  }
}
```

#### Consultar Estado de una Orden

```
GET /api/v1/payment-orders/{payment_order_id}
```

Obtiene el estado actual de una orden de pago.

**Respuesta:**

```json
{
  "success": true,
  "data": {
    "payment_order_id": "PO-987654321",
    "status": "completed",
    "amount": 100.50,
    "currency": "USD",
    "crypto_amount": 100.25,
    "crypto_currency": "USDT",
    "payment_address": "0x1234567890abcdef1234567890abcdef12345678",
    "transaction_hash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "block_confirmations": 6,
    "completed_at": "2023-06-01T15:15:30Z"
  }
}
```

#### Listar Órdenes de Pago

```
GET /api/v1/payment-orders?status=completed&start_date=2023-05-01&end_date=2023-05-31&page=1&limit=20
```

Obtiene un listado de órdenes de pago con filtros opcionales.

**Respuesta:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "payment_order_id": "PO-987654321",
        "status": "completed",
        "amount": 100.50,
        "currency": "USD",
        "created_at": "2023-05-15T10:30:00Z",
        "completed_at": "2023-05-15T10:45:30Z"
      },
      // ... más órdenes
    ],
    "pagination": {
      "total": 45,
      "page": 1,
      "limit": 20,
      "pages": 3
    }
  }
}
```

#### Cancelar una Orden de Pago

```
POST /api/v1/payment-orders/{payment_order_id}/cancel
```

Cancela una orden de pago pendiente.

**Respuesta:**

```json
{
  "success": true,
  "data": {
    "payment_order_id": "PO-987654321",
    "status": "cancelled",
    "cancelled_at": "2023-06-01T14:30:00Z"
  }
}
```

### Estados de las Órdenes de Pago

| Estado | Descripción |
|--------|-------------|
| `pending` | La orden ha sido creada pero aún no se ha recibido el pago |
| `processing` | Se ha detectado el pago y está siendo procesado (esperando confirmaciones) |
| `completed` | El pago se ha completado y confirmado |
| `failed` | El pago ha fallado por alguna razón (monto incorrecto, tiempo expirado, etc.) |
| `cancelled` | La orden ha sido cancelada por el comerciante |
| `expired` | La orden ha expirado sin recibir el pago |

## Implementación de Webhooks

Los webhooks permiten a tu aplicación recibir notificaciones en tiempo real sobre cambios en el estado de las órdenes de pago.

### Eventos Disponibles

| Evento | Descripción |
|--------|-------------|
| `payment.pending` | Se ha detectado una transacción pero aún no tiene confirmaciones suficientes |
| `payment.processing` | El pago está siendo procesado (tiene algunas confirmaciones) |
| `payment.completed` | El pago se ha completado exitosamente |
| `payment.failed` | El pago ha fallado |
| `payment.cancelled` | La orden ha sido cancelada |
| `payment.expired` | La orden ha expirado |

### Formato de Notificación

```json
{
  "event": "payment.completed",
  "created_at": "2023-06-01T15:15:30Z",
  "data": {
    "payment_order_id": "PO-987654321",
    "status": "completed",
    "amount": 100.50,
    "currency": "USD",
    "crypto_amount": 100.25,
    "crypto_currency": "USDT",
    "payment_address": "0x1234567890abcdef1234567890abcdef12345678",
    "transaction_hash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    "block_confirmations": 6,
    "completed_at": "2023-06-01T15:15:30Z",
    "order_id": "ORD-12345",
    "metadata": {
      "product_id": "PRD-789",
      "customer_id": "CUS-456"
    }
  }
}
```

### Implementación del Endpoint de Webhook

Tu servidor debe implementar un endpoint para recibir las notificaciones de webhook:

```javascript
// Ejemplo en Express.js
app.post('/webhooks/crypto-payments', express.json(), (req, res) => {
  const webhookSignature = req.headers['x-webhook-signature'];
  const webhookSecret = 'tu_webhook_secret';
  
  // Verificar la firma del webhook
  if (!verificarWebhook(req.body, webhookSignature, webhookSecret)) {
    return res.status(401).json({ error: 'Firma inválida' });
  }
  
  const evento = req.body.event;
  const datos = req.body.data;
  
  // Procesar según el tipo de evento
  switch (evento) {
    case 'payment.completed':
      // Actualizar el estado del pedido en tu sistema
      actualizarPedido(datos.order_id, 'pagado');
      break;
    case 'payment.failed':
      // Marcar el pedido como fallido
      actualizarPedido(datos.order_id, 'fallido');
      break;
    // ... manejar otros eventos
  }
  
  // Siempre responder con 200 OK para confirmar recepción
  res.status(200).json({ received: true });
});
```

### Política de Reintentos

Si tu servidor no responde con un código 2xx, nuestro sistema reintentará enviar la notificación según el siguiente esquema:

- Primer reintento: 30 segundos después
- Segundo reintento: 5 minutos después
- Tercer reintento: 30 minutos después
- Cuarto reintento: 2 horas después
- Quinto reintento: 6 horas después

Después del quinto reintento fallido, la notificación se marcará como fallida y no se reintentará más. Puedes ver el historial de notificaciones en el panel de control.

## Entorno de Pruebas (Sandbox)

Antes de implementar en producción, te recomendamos utilizar nuestro entorno de sandbox para probar tu integración.

### Diferencias del Entorno Sandbox

- URL Base: `https://sandbox-api.eoscryptopago.com`
- No se realizan transacciones reales en blockchain
- Se proporcionan wallets de prueba con fondos virtuales
- Los pagos pueden simularse manualmente

### Credenciales de Sandbox

Para obtener credenciales de sandbox:

1. Inicia sesión en el panel de control
2. Navega a "Configuración" > "API y Desarrolladores"
3. Selecciona la pestaña "Entorno de Pruebas"
4. Haz clic en "Generar Credenciales de Sandbox"

### Simular Pagos en Sandbox

Para simular un pago en el entorno de sandbox:

1. Crea una orden de pago usando la API de sandbox
2. Navega a la URL de pago generada
3. En la página de pago, encontrarás un botón "Simular Pago" que te permitirá elegir el estado final de la transacción

## Ejemplos de Integración

### Ejemplo Básico (JavaScript/Node.js)

```javascript
const axios = require('axios');
const crypto = require('crypto');

class CryptoPaymentGateway {
  constructor(apiKey, apiSecret, sandbox = false) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = sandbox 
      ? 'https://sandbox-api.eoscryptopago.com' 
      : 'https://api.eoscryptopago.com';
  }
  
  async createPaymentOrder(orderData) {
    const timestamp = Date.now().toString();
    const signature = this._generateSignature(timestamp, orderData);
    
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/v1/payment-orders`,
        orderData,
        {
          headers: {
            'X-API-KEY': this.apiKey,
            'X-TIMESTAMP': timestamp,
            'X-SIGNATURE': signature,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error al crear orden de pago:', error.response?.data || error.message);
      throw error;
    }
  }
  
  async getPaymentOrder(paymentOrderId) {
    const timestamp = Date.now().toString();
    const signature = this._generateSignature(timestamp);
    
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/v1/payment-orders/${paymentOrderId}`,
        {
          headers: {
            'X-API-KEY': this.apiKey,
            'X-TIMESTAMP': timestamp,
            'X-SIGNATURE': signature
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error al obtener orden de pago:', error.response?.data || error.message);
      throw error;
    }
  }
  
  _generateSignature(timestamp, body = null) {
    const message = timestamp + (body ? JSON.stringify(body) : '');
    return crypto.createHmac('sha256', this.apiSecret).update(message).digest('hex');
  }
}

// Ejemplo de uso
async function ejemploIntegracion() {
  const gateway = new CryptoPaymentGateway(
    'tu_api_key',
    'tu_api_secret',
    true // usar sandbox
  );
  
  // Crear una orden de pago
  const orderData = {
    amount: 100.50,
    currency: 'USD',
    description: 'Pago por Servicio Premium',
    order_id: 'ORD-' + Date.now(),
    customer: {
      email: 'cliente@ejemplo.com',
      name: 'Juan Pérez'
    },
    crypto_currency: 'USDT',
    callback_url: 'https://tu-tienda.com/webhooks/crypto-payments',
    success_url: 'https://tu-tienda.com/pago-exitoso',
    cancel_url: 'https://tu-tienda.com/pago-cancelado',
    metadata: {
      product_id: 'PRD-789'
    },
    expiration_minutes: 30
  };
  
  try {
    const result = await gateway.createPaymentOrder(orderData);
    console.log('Orden de pago creada:', result.data);
    
    // Redirigir al cliente a la URL de pago
    const paymentUrl = result.data.payment_url;
    console.log('URL de pago:', paymentUrl);
    
    // Más tarde, verificar el estado
    const paymentOrderId = result.data.payment_order_id;
    const orderStatus = await gateway.getPaymentOrder(paymentOrderId);
    console.log('Estado actual:', orderStatus.data.status);
  } catch (error) {
    console.error('Error en la integración:', error);
  }
}

ejemploIntegracion();
```

### Ejemplo de Integración en PHP

```php
<?php

class CryptoPaymentGateway {
  private $apiKey;
  private $apiSecret;
  private $baseUrl;
  
  public function __construct($apiKey, $apiSecret, $sandbox = false) {
    $this->apiKey = $apiKey;
    $this->apiSecret = $apiSecret;
    $this->baseUrl = $sandbox 
      ? 'https://sandbox-api.eoscryptopago.com' 
      : 'https://api.eoscryptopago.com';
  }
  
  public function createPaymentOrder($orderData) {
    $timestamp = (string) round(microtime(true) * 1000);
    $signature = $this->generateSignature($timestamp, $orderData);
    
    $ch = curl_init($this->baseUrl . '/api/v1/payment-orders');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($orderData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
      'Content-Type: application/json',
      'X-API-KEY: ' . $this->apiKey,
      'X-TIMESTAMP: ' . $timestamp,
      'X-SIGNATURE: ' . $signature
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode >= 200 && $httpCode < 300) {
      return json_decode($response, true);
    } else {
      throw new Exception('Error al crear orden de pago: ' . $response);
    }
  }
  
  public function getPaymentOrder($paymentOrderId) {
    $timestamp = (string) round(microtime(true) * 1000);
    $signature = $this->generateSignature($timestamp);
    
    $ch = curl_init($this->baseUrl . '/api/v1/payment-orders/' . $paymentOrderId);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
      'X-API-KEY: ' . $this->apiKey,
      'X-TIMESTAMP: ' . $timestamp,
      'X-SIGNATURE: ' . $signature
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode >= 200 && $httpCode < 300) {
      return json_decode($response, true);
    } else {
      throw new Exception('Error al obtener orden de pago: ' . $response);
    }
  }
  
  private function generateSignature($timestamp, $body = null) {
    $message = $timestamp;
    if ($body) {
      $message .= json_encode($body);
    }
    return hash_hmac('sha256', $message, $this->apiSecret);
  }
}

// Ejemplo de uso
try {
  $gateway = new CryptoPaymentGateway(
    'tu_api_key',
    'tu_api_secret',
    true // usar sandbox
  );
  
  $orderData = [
    'amount' => 100.50,
    'currency' => 'USD',
    'description' => 'Pago por Servicio Premium',
    'order_id' => 'ORD-' . time(),
    'customer' => [
      'email' => 'cliente@ejemplo.com',
      'name' => 'Juan Pérez'
    ],
    'crypto_currency' => 'USDT',
    'callback_url' => 'https://tu-tienda.com/webhooks/crypto-payments',
    'success_url' => 'https://tu-tienda.com/pago-exitoso',
    'cancel_url' => 'https://tu-tienda.com/pago-cancelado',
    'metadata' => [
      'product_id' => 'PRD-789'
    ],
    'expiration_minutes' => 30
  ];
  
  $result = $gateway->createPaymentOrder($orderData);
  echo "Orden de pago creada: " . $result['data']['payment_order_id'] . "\n";
  echo "URL de pago: " . $result['data']['payment_url'] . "\n";
  
  // Verificar webhook
  function verificarWebhook($datos, $firmaRecibida, $webhookSecret) {
    $firmaCalculada = hash_hmac('sha256', json_encode($datos), $webhookSecret);
    return hash_equals($firmaCalculada, $firmaRecibida);
  }
  
} catch (Exception $e) {
  echo "Error: " . $e->getMessage() . "\n";
}
```

## Manejo de Errores

### Códigos de Estado HTTP

| Código | Descripción |
|--------|-------------|
| 200 | Solicitud exitosa |
| 201 | Recurso creado exitosamente |
| 400 | Solicitud incorrecta (datos inválidos) |
| 401 | No autorizado (credenciales inválidas) |
| 403 | Prohibido (no tiene permisos) |
| 404 | Recurso no encontrado |
| 409 | Conflicto (por ejemplo, operación duplicada) |
| 422 | Entidad no procesable (validación fallida) |
| 429 | Demasiadas solicitudes (límite de tasa excedido) |
| 500 | Error interno del servidor |

### Estructura de Respuesta de Error

```json
{
  "success": false,
  "error": {
    "code": "invalid_request",
    "message": "El monto debe ser mayor que cero",
    "details": {
      "amount": ["El valor debe ser mayor que cero"]
    }
  }
}
```

### Códigos de Error Comunes

| Código | Descripción |
|--------|-------------|
| `invalid_request` | Datos de solicitud inválidos |
| `authentication_failed` | Fallo en la autenticación |
| `invalid_signature` | Firma inválida |
| `resource_not_found` | Recurso no encontrado |
| `rate_limit_exceeded` | Límite de tasa excedido |
| `insufficient_funds` | Fondos insuficientes |
| `expired_payment_order` | Orden de pago expirada |
| `duplicate_order_id` | ID de orden duplicado |
| `unsupported_currency` | Moneda no soportada |
| `internal_error` | Error interno del servidor |

## Mejores Prácticas

### Seguridad

1. **Nunca almacenes claves secretas en código del lado del cliente**
   - Todas las llamadas a la API deben realizarse desde tu servidor backend

2. **Verifica siempre las firmas de los webhooks**
   - No proceses webhooks sin verificar su autenticidad

3. **Utiliza HTTPS para todos los endpoints**
   - Tanto para llamadas a nuestra API como para tus endpoints de webhook

4. **Rota tus claves API periódicamente**
   - Recomendamos cambiar las claves cada 90 días

5. **Implementa límites de tasa en tus endpoints**
   - Protege tu aplicación contra ataques de fuerza bruta

### Manejo de Transacciones

1. **Utiliza IDs de orden únicos**
   - Esto evita pagos duplicados y facilita la conciliación

2. **Implementa idempotencia**
   - Maneja correctamente los reintentos de solicitudes

3. **No confíes solo en las redirecciones**
   - Siempre procesa los webhooks para actualizar el estado de los pedidos

4. **Verifica el monto recibido**
   - Confirma que el monto recibido coincida con el esperado

5. **Espera las confirmaciones necesarias**
   - No consideres un pago como completado hasta tener suficientes confirmaciones

### Experiencia de Usuario

1. **Proporciona instrucciones claras**
   - Guía a tus usuarios sobre cómo completar el pago

2. **Muestra temporizadores de expiración**
   - Informa al usuario cuánto tiempo tiene para completar el pago

3. **Ofrece múltiples opciones de criptomonedas**
   - Permite a tus clientes elegir su criptomoneda preferida

4. **Implementa notificaciones en tiempo real**
   - Actualiza la interfaz cuando se detecten pagos

5. **Proporciona recibos detallados**
   - Incluye información completa de la transacción para referencia del cliente

## Glosario

| Término | Definición |
|---------|------------|
| **API** | Application Programming Interface. Conjunto de reglas que permite que diferentes aplicaciones se comuniquen entre sí. |
| **Blockchain** | Tecnología de registro distribuido que mantiene un registro continuo de transacciones. |
| **Confirmación** | Verificación de una transacción en la blockchain por los mineros o validadores. |
| **Criptomoneda** | Moneda digital que utiliza criptografía para asegurar las transacciones. |
| **HMAC** | Hash-based Message Authentication Code. Mecanismo para verificar la integridad y autenticidad de un mensaje. |
| **KYC/KYB** | Know Your Customer/Business. Proceso de verificación de identidad de clientes o negocios. |
| **Webhook** | Mecanismo que permite a una aplicación proporcionar información en tiempo real a otras aplicaciones. |
| **Wallet** | Monedero digital que almacena claves privadas para acceder a criptomonedas. |
| **USDT** | Tether, una stablecoin vinculada al valor del dólar estadounidense. |
| **BNB** | Binance Coin, la criptomoneda nativa de la plataforma Binance. |

## Soporte Técnico

Si encuentras problemas durante la integración o tienes preguntas adicionales, nuestro equipo de soporte técnico está disponible para ayudarte:

### Canales de Soporte

- **Centro de Ayuda**: [https://ayuda.eoscryptopago.com](https://ayuda.eoscryptopago.com)
- **Email de Soporte**: soporte@eoscryptopago.com
- **Chat en Vivo**: Disponible en el panel de control de 9:00 a 18:00 (GMT-6), de lunes a viernes
- **Documentación API**: [https://docs.eoscryptopago.com](https://docs.eoscryptopago.com)

### Proceso de Soporte

1. **Consulta la documentación**: Muchas preguntas comunes están respondidas en nuestra documentación.
2. **Verifica el estado del servicio**: Antes de reportar un problema, verifica el estado actual del servicio en [https://status.eoscryptopago.com](https://status.eoscryptopago.com).
3. **Reporta un problema**: Si necesitas asistencia, proporciona la siguiente información:
   - Tu ID de comerciante
   - Descripción detallada del problema
   - Capturas de pantalla o registros relevantes
   - IDs de transacción afectadas (si aplica)
   - Pasos para reproducir el problema

### Tiempos de Respuesta

| Prioridad | Tiempo de Respuesta | Descripción |
|-----------|---------------------|-------------|
| Crítica | < 2 horas (horario laboral) | Problemas que impiden completamente el procesamiento de pagos |
| Alta | < 8 horas (horario laboral) | Problemas que afectan significativamente la operación |
| Media | < 24 horas | Consultas técnicas y problemas menores |
| Baja | < 48 horas | Preguntas generales y solicitudes de mejora |

---

*Este manual fue creado para facilitar la integración de aplicaciones de terceros con nuestra pasarela de pagos de criptomonedas. Última actualización: Junio 2023.*