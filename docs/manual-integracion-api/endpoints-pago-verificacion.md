# Endpoints de Verificación de Pago

## Obtener Detalles del Pago

Recupera información detallada sobre un pago específico.

**Endpoint:** `GET /api/v1/payments/:id`  
**Acceso:** Privado (requiere clave API o JWT)  
**Límite de velocidad:** 100 solicitudes por minuto

### Cabeceras de Solicitud

| Cabecera | Requerido | Descripción |
|----------|-----------|-------------|
| X-API-Key | Sí (si no se usa JWT) | Tu clave API de comerciante |
| Authorization | Sí (si no se usa clave API) | Token Bearer recibido del inicio de sesión |

### Parámetros de URL

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| id | string | Sí | UUID de la dirección de pago |

### Respuesta

**Código de Estado:** 200 OK

```json
{
  "success": true,
  "data": {
    "id": "542c2b3b-1234-5678-abcd-1234567890ab",
    "address": "0x7A717BD4cD960c7F9FD3eFB04376801C424ADf95",
    "status": "completed",
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
    "transactions": [
      {
        "id": "abc12345-6789-def0-1234-56789abcdef0",
        "txHash": "0x123abc456def789012345678901234567890123456789012345678901234567890",
        "status": "confirmed",
        "amount": 100,
        "currency": "USDT",
        "confirmations": 12,
        "createdAt": "2025-05-19T20:30:45.210Z",
        "updatedAt": "2025-05-19T20:35:12.210Z"
      }
    ],
    "createdAt": "2025-05-19T20:26:59.210Z",
    "updatedAt": "2025-05-19T20:35:12.210Z"
  }
}
```

### Ejemplos de Código

#### cURL

```bash
curl -X GET https://api.crypto-payment-gateway.com/api/v1/payments/542c2b3b-1234-5678-abcd-1234567890ab \
  -H "X-API-Key: pk_live_abcdefg123456789"
```

#### JavaScript

```javascript
const obtenerDetallesPago = async (pagoId) => {
  try {
    const response = await fetch(`https://api.crypto-payment-gateway.com/api/v1/payments/${pagoId}`, {
      method: 'GET',
      headers: {
        'X-API-Key': 'pk_live_abcdefg123456789'
      }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      return data.data;
    } else {
      throw new Error(data.error?.message || 'Error al obtener detalles del pago');
    }
  } catch (error) {
    console.error('Error al obtener detalles del pago:', error);
    throw error;
  }
};
```

#### PHP

```php
<?php
$pagoId = '542c2b3b-1234-5678-abcd-1234567890ab';
$url = "https://api.crypto-payment-gateway.com/api/v1/payments/{$pagoId}";

$options = [
    'http' => [
        'method' => 'GET',
        'header' => 'X-API-Key: pk_live_abcdefg123456789'
    ]
];

$context = stream_context_create($options);
$response = file_get_contents($url, false, $context);

if ($response === false) {
    echo "Error al obtener detalles del pago\n";
} else {
    $result = json_decode($response, true);
    if ($result['success']) {
        $pago = $result['data'];
        echo "Estado del Pago: " . $pago['status'] . "\n";
        if (!empty($pago['transactions'])) {
            echo "Hash de Transacción: " . $pago['transactions'][0]['txHash'] . "\n";
            echo "Cantidad: " . $pago['transactions'][0]['amount'] . " " . $pago['currency'] . "\n";
        }
    } else {
        echo "Error: " . ($result['error']['message'] ?? 'Error desconocido') . "\n";
    }
}
?>
```

#### Python

```python
import requests

pago_id = '542c2b3b-1234-5678-abcd-1234567890ab'
url = f'https://api.crypto-payment-gateway.com/api/v1/payments/{pago_id}'

headers = {
    'X-API-Key': 'pk_live_abcdefg123456789'
}

try:
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    
    data = response.json()
    if data['success']:
        pago = data['data']
        print(f"Estado del Pago: {pago['status']}")
        if pago.get('transactions'):
            tx = pago['transactions'][0]
            print(f"Hash de Transacción: {tx['txHash']}")
            print(f"Cantidad: {tx['amount']} {pago['currency']}")
    else:
        print(f"Error: {data.get('error', {}).get('message', 'Error desconocido')}")
        
except requests.exceptions.RequestException as e:
    print(f"Error al obtener detalles del pago: {e}")
    if hasattr(e, 'response') and e.response:
        print(f"Respuesta: {e.response.text}")
```

---

## Listar Pagos

Recupera una lista de pagos con filtrado opcional por estado, rango de fechas y términos de búsqueda.

**Endpoint:** `GET /api/v1/payments`  
**Acceso:** Privado (requiere clave API o JWT)  
**Límite de velocidad:** 100 solicitudes por minuto

### Cabeceras de Solicitud

| Cabecera | Requerido | Descripción |
|----------|-----------|-------------|
| X-API-Key | Sí (si no se usa JWT) | Tu clave API de comerciante |
| Authorization | Sí (si no se usa clave API) | Token Bearer recibido del inicio de sesión |

### Parámetros de Consulta

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| status | string | No | Filtrar por estado de pago (`active`, `completed`, `expired`, `all`) |
| search | string | No | Término de búsqueda para coincidir con la referencia o dirección de pago |
| dateRange | string | No | Período de tiempo para filtrar (`1d`, `7d`, `30d`, `90d`) |
| page | number | No | Número de página para paginación (por defecto: 1) |
| limit | number | No | Número de resultados por página (por defecto: 20, máx: 100) |

### Respuesta

**Código de Estado:** 200 OK

```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "id": "542c2b3b-1234-5678-abcd-1234567890ab",
        "address": "0x7A717BD4cD960c7F9FD3eFB04376801C424ADf95",
        "status": "completed",
        "expectedAmount": 100,
        "currency": "USDT",
        "metadata": {
          "orderId": "ORD-12345",
          "reference": "FACT-2025-001"
        },
        "createdAt": "2025-05-19T20:26:59.210Z",
        "updatedAt": "2025-05-19T20:35:12.210Z",
        "transaction": {
          "id": "abc12345-6789-def0-1234-56789abcdef0",
          "txHash": "0x123abc456def789012345678901234567890123456789012345678901234567890",
          "status": "confirmed",
          "amount": 100
        }
      },
      {
        "id": "642c2b3b-5678-90ab-cdef-1234567890ab",
        "address": "0x8B828CD5dE961c7F9FD3eFB04376801C424BEg06",
        "status": "active",
        "expectedAmount": 200,
        "currency": "USDT",
        "metadata": {
          "orderId": "ORD-12346",
          "reference": "FACT-2025-002"
        },
        "createdAt": "2025-05-19T21:15:33.210Z",
        "updatedAt": "2025-05-19T21:15:33.210Z",
        "transaction": null
      }
    ],
    "pagination": {
      "total": 27,
      "page": 1,
      "limit": 20,
      "pages": 2
    }
  }
}
```

### Ejemplos de Código

#### cURL

```bash
curl -X GET "https://api.crypto-payment-gateway.com/api/v1/payments?status=completed&dateRange=30d&page=1&limit=20" \
  -H "X-API-Key: pk_live_abcdefg123456789"
```

#### JavaScript

```javascript
const listarPagos = async (filtros = {}) => {
  try {
    const queryParams = new URLSearchParams();
    
    // Añadir filtros opcionales
    if (filtros.status) queryParams.append('status', filtros.status);
    if (filtros.search) queryParams.append('search', filtros.search);
    if (filtros.dateRange) queryParams.append('dateRange', filtros.dateRange);
    if (filtros.page) queryParams.append('page', filtros.page);
    if (filtros.limit) queryParams.append('limit', filtros.limit);
    
    const url = `https://api.crypto-payment-gateway.com/api/v1/payments?${queryParams.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-API-Key': 'pk_live_abcdefg123456789'
      }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      return data.data;
    } else {
      throw new Error(data.error?.message || 'Error al obtener pagos');
    }
  } catch (error) {
    console.error('Error al obtener pagos:', error);
    throw error;
  }
};
```

#### PHP

```php
<?php
// Establecer filtros opcionales
$filtros = [
    'status' => 'completed',
    'dateRange' => '30d',
    'page' => 1,
    'limit' => 20
];

// Construir cadena de consulta
$queryString = http_build_query($filtros);
$url = "https://api.crypto-payment-gateway.com/api/v1/payments?{$queryString}";

$options = [
    'http' => [
        'method' => 'GET',
        'header' => 'X-API-Key: pk_live_abcdefg123456789'
    ]
];

$context = stream_context_create($options);
$response = file_get_contents($url, false, $context);

if ($response === false) {
    echo "Error al obtener pagos\n";
} else {
    $result = json_decode($response, true);
    if ($result['success']) {
        $pagos = $result['data']['payments'];
        $paginacion = $result['data']['pagination'];
        
        echo "Encontrados {$paginacion['total']} pagos, mostrando página {$paginacion['page']} de {$paginacion['pages']}\n\n";
        
        foreach ($pagos as $pago) {
            echo "ID de Pago: {$pago['id']}\n";
            echo "Dirección: {$pago['address']}\n";
            echo "Estado: {$pago['status']}\n";
            echo "Cantidad: {$pago['expectedAmount']} {$pago['currency']}\n";
            echo "Creado: {$pago['createdAt']}\n";
            echo "--------------------------\n";
        }
    } else {
        echo "Error: " . ($result['error']['message'] ?? 'Error desconocido') . "\n";
    }
}
?>
```

#### Python

```python
import requests

# Establecer filtros opcionales
filtros = {
    'status': 'completed',
    'dateRange': '30d',
    'page': 1,
    'limit': 20
}

url = 'https://api.crypto-payment-gateway.com/api/v1/payments'

headers = {
    'X-API-Key': 'pk_live_abcdefg123456789'
}

try:
    response = requests.get(url, params=filtros, headers=headers)
    response.raise_for_status()
    
    data = response.json()
    if data['success']:
        pagos = data['data']['payments']
        paginacion = data['data']['pagination']
        
        print(f"Encontrados {paginacion['total']} pagos, mostrando página {paginacion['page']} de {paginacion['pages']}")
        
        for pago in pagos:
            print(f"\nID de Pago: {pago['id']}")
            print(f"Dirección: {pago['address']}")
            print(f"Estado: {pago['status']}")
            print(f"Cantidad: {pago['expectedAmount']} {pago['currency']}")
            print(f"Creado: {pago['createdAt']}")
            
            if pago.get('transaction'):
                tx = pago['transaction']
                print(f"Hash de Transacción: {tx['txHash']}")
                print(f"Estado de Transacción: {tx['status']}")
    else:
        print(f"Error: {data.get('error', {}).get('message', 'Error desconocido')}")
        
except requests.exceptions.RequestException as e:
    print(f"Error al obtener pagos: {e}")
    if hasattr(e, 'response') and e.response:
        print(f"Respuesta: {e.response.text}")
```

---

## Verificar Estado del Pago

Verifica el estado de un pago. Esto es útil para el sondeo del lado del cliente para detectar la finalización del pago.

**Endpoint:** `GET /api/v1/payment/info/:addressId`  
**Acceso:** Público  
**Límite de velocidad:** 60 solicitudes por minuto

### Parámetros de URL

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| addressId | string | Sí | UUID de la dirección de pago |

### Respuesta

**Código de Estado:** 200 OK

```json
{
  "success": true,
  "data": {
    "id": "542c2b3b-1234-5678-abcd-1234567890ab",
    "address": "0x7A717BD4cD960c7F9FD3eFB04376801C424ADf95",
    "status": "completed",
    "expectedAmount": 100,
    "currency": "USDT",
    "expiresAt": "2025-05-20T20:26:59.210Z",
    "transactions": [
      {
        "txHash": "0x123abc456def789012345678901234567890123456789012345678901234567890",
        "status": "confirmed",
        "amount": 100,
        "confirmations": 12,
        "timestamp": "2025-05-19T20:30:45.210Z"
      }
    ],
    "metadata": {
      "description": "Pago de pedido #12345",
      "orderId": "ORD-12345",
      "reference": "FACT-2025-001"
    }
  }
}
```

### Ejemplos de Código

#### cURL

```bash
curl -X GET https://api.crypto-payment-gateway.com/api/v1/payment/info/542c2b3b-1234-5678-abcd-1234567890ab
```

#### JavaScript

```javascript
const verificarEstadoPago = async (addressId) => {
  try {
    const response = await fetch(`https://api.crypto-payment-gateway.com/api/v1/payment/info/${addressId}`);
    
    const data = await response.json();
    
    if (response.ok) {
      return data.data;
    } else {
      throw new Error(data.error?.message || 'Error al verificar estado del pago');
    }
  } catch (error) {
    console.error('Error al verificar estado del pago:', error);
    throw error;
  }
};

// Ejemplo de uso con sondeo
const sondearEstadoPago = (addressId, intervalo = 10000) => {
  const intervaloCheck = setInterval(async () => {
    try {
      const infoPago = await verificarEstadoPago(addressId);
      
      console.log(`Estado actual: ${infoPago.status}`);
      
      if (infoPago.status === 'completed') {
        console.log('¡Pago completado con éxito!');
        clearInterval(intervaloCheck);
        // Manejar pago exitoso (redireccionar, actualizar UI, etc.)
      } else if (infoPago.status === 'expired') {
        console.log('Pago expirado');
        clearInterval(intervaloCheck);
        // Manejar pago expirado
      }
    } catch (error) {
      console.error('Verificación de estado de pago fallida:', error);
    }
  }, intervalo);
  
  // Devolver el ID del intervalo para que pueda ser limpiado si es necesario
  return intervaloCheck;
};
```

#### PHP

```php
<?php
function verificarEstadoPago($addressId) {
    $url = "https://api.crypto-payment-gateway.com/api/v1/payment/info/{$addressId}";
    
    $options = [
        'http' => [
            'method' => 'GET'
        ]
    ];
    
    $context = stream_context_create($options);
    $response = file_get_contents($url, false, $context);
    
    if ($response === false) {
        throw new Exception("Error al verificar estado del pago");
    }
    
    return json_decode($response, true);
}

// Ejemplo de uso
$addressId = '542c2b3b-1234-5678-abcd-1234567890ab';

try {
    $result = verificarEstadoPago($addressId);
    
    if ($result['success']) {
        $pago = $result['data'];
        echo "Estado del Pago: {$pago['status']}\n";
        
        if ($pago['status'] === 'completed') {
            echo "¡Pago completado con éxito!\n";
            if (!empty($pago['transactions'])) {
                $tx = $pago['transactions'][0];
                echo "Hash de Transacción: {$tx['txHash']}\n";
                echo "Cantidad: {$tx['amount']} {$pago['currency']}\n";
                echo "Confirmaciones: {$tx['confirmations']}\n";
            }
        } elseif ($pago['status'] === 'active') {
            echo "Esperando pago...\n";
            echo "Cantidad Esperada: {$pago['expectedAmount']} {$pago['currency']}\n";
            echo "Expira En: {$pago['expiresAt']}\n";
        } elseif ($pago['status'] === 'expired') {
            echo "El pago ha expirado.\n";
        }
    } else {
        echo "Error: " . ($result['error']['message'] ?? 'Error desconocido') . "\n";
    }
} catch (Exception $e) {
    echo "Error: {$e->getMessage()}\n";
}
?>
```

#### Python

```python
import requests
import time

def verificar_estado_pago(address_id):
    url = f'https://api.crypto-payment-gateway.com/api/v1/payment/info/{address_id}'
    
    response = requests.get(url)
    response.raise_for_status()
    return response.json()

# Ejemplo de uso con sondeo
def sondear_estado_pago(address_id, intervalo=10, max_intentos=30):
    intento = 0
    while intento < max_intentos:
        try:
            result = verificar_estado_pago(address_id)
            
            if result['success']:
                pago = result['data']
                print(f"Estado actual: {pago['status']}")
                
                if pago['status'] == 'completed':
                    print("¡Pago completado con éxito!")
                    if pago.get('transactions'):
                        tx = pago['transactions'][0]
                        print(f"Hash de Transacción: {tx['txHash']}")
                        print(f"Cantidad: {tx['amount']} {pago['currency']}")
                        print(f"Confirmaciones: {tx['confirmations']}")
                    return pago
                elif pago['status'] == 'expired':
                    print("El pago ha expirado.")
                    return pago
                    
            else:
                print(f"Error: {result.get('error', {}).get('message', 'Error desconocido')}")
                
            time.sleep(intervalo)
            intento += 1
            
        except requests.exceptions.RequestException as e:
            print(f"Error al verificar estado del pago: {e}")
            time.sleep(intervalo)
            intento += 1
    
    print(f"Máximo de intentos de sondeo ({max_intentos}) alcanzado.")
    return None

# Ejemplo de llamada
address_id = '542c2b3b-1234-5678-abcd-1234567890ab'
info_pago = sondear_estado_pago(address_id)
```
