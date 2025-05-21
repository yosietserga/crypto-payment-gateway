# Endpoints de Pago

Estos endpoints manejan operaciones de pago en criptomonedas, incluyendo la generación de direcciones de pago, verificación del estado del pago y recuperación de información de pagos.

## Generar Dirección de Pago

Crea una nueva dirección de pago en criptomoneda para recibir fondos.

**Endpoint:** `POST /api/v1/merchant/payment-addresses`  
**Acceso:** Privado (requiere clave API o JWT)  
**Límite de velocidad:** 100 solicitudes por minuto

### Cabeceras de Solicitud

| Cabecera | Requerido | Descripción |
|----------|-----------|-------------|
| X-API-Key | Sí (si no se usa JWT) | Tu clave API de comerciante |
| Authorization | Sí (si no se usa clave API) | Token Bearer recibido del inicio de sesión |
| Idempotency-Key | Recomendado | Clave única para prevenir solicitudes duplicadas |

### Parámetros de Solicitud

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| currency | string | Sí | Código de criptomoneda (Actualmente soporta: `USDT`) |
| expectedAmount | number | Sí | Cantidad de pago esperada en la moneda especificada |
| expiresAt | string | No | Fecha y hora ISO 8601 cuando expira la dirección de pago |
| callbackUrl | string | No | URL para recibir notificaciones webhook de pago |
| metadata | object | No | Datos adicionales para asociar con el pago |

#### Estructura del Objeto Metadata

| Campo | Tipo | Descripción |
|-------|------|-------------|
| orderId | string | Tu identificador interno de orden |
| customerEmail | string | Dirección de correo electrónico del cliente |
| customerName | string | Nombre del cliente |
| description | string | Descripción del pago |
| fiatCurrency | string | Código de moneda fiat (ej., USD, EUR) |
| reference | string | Tu número de referencia para este pago |

### Respuesta

**Código de Estado:** 201 Created

```json
{
  "success": true,
  "data": {
    "id": "542c2b3b-1234-5678-abcd-1234567890ab",
    "address": "0x7A717BD4cD960c7F9FD3eFB04376801C424ADf95",
    "status": "active",
    "type": "merchant_payment",
    "expectedAmount": 100,
    "currency": "USDT",
    "expiresAt": "2025-05-20T20:26:59.210Z",
    "isMonitored": true,
    "metadata": {
      "callbackUrl": "https://tusitio.com/completado-pago",
      "orderId": "ORD-12345",
      "customerEmail": "cliente@ejemplo.com",
      "fiatCurrency": "USD",
      "description": "Pago de pedido #12345",
      "reference": "FACT-2025-001",
      "customerName": "Juan Pérez"
    },
    "createdAt": "2025-05-19T20:26:59.210Z",
    "updatedAt": "2025-05-19T20:26:59.210Z"
  }
}
```

### Ejemplos de Código

#### cURL

```bash
curl -X POST https://api.crypto-payment-gateway.com/api/v1/merchant/payment-addresses \
  -H "Content-Type: application/json" \
  -H "X-API-Key: pk_live_abcdefg123456789" \
  -H "Idempotency-Key: id-solicitud-unica-123" \
  -d '{
    "currency": "USDT",
    "expectedAmount": 100,
    "expiresAt": "2025-05-20T20:26:59.210Z",
    "metadata": {
      "callbackUrl": "https://tusitio.com/completado-pago",
      "orderId": "ORD-12345",
      "customerEmail": "cliente@ejemplo.com",
      "fiatCurrency": "USD",
      "description": "Pago de pedido #12345",
      "reference": "FACT-2025-001",
      "customerName": "Juan Pérez"
    }
  }'
```

#### JavaScript

```javascript
const generarDireccionPago = async () => {
  try {
    const response = await fetch('https://api.crypto-payment-gateway.com/api/v1/merchant/payment-addresses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'pk_live_abcdefg123456789',
        'Idempotency-Key': 'id-solicitud-unica-123'
      },
      body: JSON.stringify({
        currency: 'USDT',
        expectedAmount: 100,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 horas desde ahora
        metadata: {
          callbackUrl: 'https://tusitio.com/completado-pago',
          orderId: 'ORD-12345',
          customerEmail: 'cliente@ejemplo.com',
          fiatCurrency: 'USD',
          description: 'Pago de pedido #12345',
          reference: 'FACT-2025-001',
          customerName: 'Juan Pérez'
        }
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      return data.data;
    } else {
      throw new Error(data.error?.message || 'Error al generar dirección de pago');
    }
  } catch (error) {
    console.error('Error al generar dirección de pago:', error);
    throw error;
  }
};
```

#### PHP

```php
<?php
$url = 'https://api.crypto-payment-gateway.com/api/v1/merchant/payment-addresses';
$data = [
    'currency' => 'USDT',
    'expectedAmount' => 100,
    'expiresAt' => date('c', strtotime('+24 hours')), // 24 horas desde ahora
    'metadata' => [
        'callbackUrl' => 'https://tusitio.com/completado-pago',
        'orderId' => 'ORD-12345',
        'customerEmail' => 'cliente@ejemplo.com',
        'fiatCurrency' => 'USD',
        'description' => 'Pago de pedido #12345',
        'reference' => 'FACT-2025-001',
        'customerName' => 'Juan Pérez'
    ]
];

$options = [
    'http' => [
        'method' => 'POST',
        'header' => 
            'Content-Type: application/json' . "\r\n" .
            'X-API-Key: pk_live_abcdefg123456789' . "\r\n" .
            'Idempotency-Key: id-solicitud-unica-123',
        'content' => json_encode($data)
    ]
];

$context = stream_context_create($options);
$response = file_get_contents($url, false, $context);

if ($response === false) {
    echo "Error al generar dirección de pago\n";
} else {
    $result = json_decode($response, true);
    if ($result['success']) {
        echo "Dirección de pago generada: " . $result['data']['address'] . "\n";
    } else {
        echo "Error: " . ($result['error']['message'] ?? 'Error desconocido') . "\n";
    }
}
?>
```

#### Python

```python
import requests
import json
from datetime import datetime, timedelta

url = 'https://api.crypto-payment-gateway.com/api/v1/merchant/payment-addresses'
expire_time = (datetime.now() + timedelta(days=1)).isoformat()

payload = {
    'currency': 'USDT',
    'expectedAmount': 100,
    'expiresAt': expire_time,
    'metadata': {
        'callbackUrl': 'https://tusitio.com/completado-pago',
        'orderId': 'ORD-12345',
        'customerEmail': 'cliente@ejemplo.com',
        'fiatCurrency': 'USD',
        'description': 'Pago de pedido #12345',
        'reference': 'FACT-2025-001',
        'customerName': 'Juan Pérez'
    }
}

headers = {
    'Content-Type': 'application/json',
    'X-API-Key': 'pk_live_abcdefg123456789',
    'Idempotency-Key': 'id-solicitud-unica-123'
}

try:
    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()
    
    data = response.json()
    if data['success']:
        payment_address = data['data']['address']
        print(f"Dirección de pago generada: {payment_address}")
    else:
        print(f"Error: {data.get('error', {}).get('message', 'Error desconocido')}")
        
except requests.exceptions.RequestException as e:
    print(f"Error al generar dirección de pago: {e}")
    if hasattr(e, 'response') and e.response:
        print(f"Respuesta: {e.response.text}")
```
