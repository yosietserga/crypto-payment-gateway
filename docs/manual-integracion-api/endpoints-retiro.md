# Endpoints de Retiro (Payout)

Estos endpoints manejan las operaciones de retiro (payout) de fondos en criptomonedas.

## Crear un Retiro

Inicia un retiro de fondos a una dirección de criptomoneda específica.

**Endpoint:** `POST /api/v1/merchant/payouts`  
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
| amount | number | Sí | Cantidad a retirar en la moneda especificada |
| currency | string | Sí | Código de criptomoneda (Actualmente soporta: `USDT`) |
| address | string | Sí | Dirección de criptomoneda destino para enviar fondos |
| description | string | No | Descripción o nota para el retiro |
| reference | string | No | Referencia externa para el retiro |

### Respuesta

**Código de Estado:** 201 Created

```json
{
  "success": true,
  "data": {
    "id": "743d3c4d-2345-6789-efgh-2345678901cd",
    "type": "merchant_payout",
    "status": "pending",
    "amount": 100,
    "fee": 1.5,
    "netAmount": 98.5,
    "currency": "USDT",
    "address": "0x9B939dE2cD960c7F9FD3eFB04376801C424CEg17",
    "txHash": null,
    "description": "Retiro mensual",
    "reference": "RETIRO-2025-001",
    "createdAt": "2025-05-19T22:15:33.210Z",
    "updatedAt": "2025-05-19T22:15:33.210Z"
  }
}
```

### Ejemplos de Código

#### cURL

```bash
curl -X POST https://api.crypto-payment-gateway.com/api/v1/merchant/payouts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: pk_live_abcdefg123456789" \
  -H "Idempotency-Key: id-solicitud-unica-123" \
  -d '{
    "amount": 100,
    "currency": "USDT",
    "address": "0x9B939dE2cD960c7F9FD3eFB04376801C424CEg17",
    "description": "Retiro mensual",
    "reference": "RETIRO-2025-001"
  }'
```

#### JavaScript

```javascript
const crearRetiro = async () => {
  try {
    const response = await fetch('https://api.crypto-payment-gateway.com/api/v1/merchant/payouts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'pk_live_abcdefg123456789',
        'Idempotency-Key': 'id-solicitud-unica-123'
      },
      body: JSON.stringify({
        amount: 100,
        currency: 'USDT',
        address: '0x9B939dE2cD960c7F9FD3eFB04376801C424CEg17',
        description: 'Retiro mensual',
        reference: 'RETIRO-2025-001'
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      return data.data;
    } else {
      throw new Error(data.error?.message || 'Error al crear retiro');
    }
  } catch (error) {
    console.error('Error al crear retiro:', error);
    throw error;
  }
};
```

#### PHP

```php
<?php
$url = 'https://api.crypto-payment-gateway.com/api/v1/merchant/payouts';
$data = [
    'amount' => 100,
    'currency' => 'USDT',
    'address' => '0x9B939dE2cD960c7F9FD3eFB04376801C424CEg17',
    'description' => 'Retiro mensual',
    'reference' => 'RETIRO-2025-001'
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
    echo "Error al crear retiro\n";
} else {
    $result = json_decode($response, true);
    if ($result['success']) {
        echo "Retiro creado con ID: " . $result['data']['id'] . "\n";
        echo "Estado: " . $result['data']['status'] . "\n";
        echo "Monto: " . $result['data']['amount'] . " " . $result['data']['currency'] . "\n";
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

url = 'https://api.crypto-payment-gateway.com/api/v1/merchant/payouts'

payload = {
    'amount': 100,
    'currency': 'USDT',
    'address': '0x9B939dE2cD960c7F9FD3eFB04376801C424CEg17',
    'description': 'Retiro mensual',
    'reference': 'RETIRO-2025-001'
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
        payout = data['data']
        print(f"Retiro creado con ID: {payout['id']}")
        print(f"Estado: {payout['status']}")
        print(f"Monto: {payout['amount']} {payout['currency']}")
        print(f"Comisión: {payout['fee']} {payout['currency']}")
        print(f"Monto Neto: {payout['netAmount']} {payout['currency']}")
    else:
        print(f"Error: {data.get('error', {}).get('message', 'Error desconocido')}")
        
except requests.exceptions.RequestException as e:
    print(f"Error al crear retiro: {e}")
    if hasattr(e, 'response') and e.response:
        print(f"Respuesta: {e.response.text}")
```

---

## Obtener Detalles del Retiro

Recupera información detallada sobre un retiro específico.

**Endpoint:** `GET /api/v1/merchant/payouts/:id`  
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
| id | string | Sí | UUID del retiro |

### Respuesta

**Código de Estado:** 200 OK

```json
{
  "success": true,
  "data": {
    "id": "743d3c4d-2345-6789-efgh-2345678901cd",
    "type": "merchant_payout",
    "status": "completed",
    "amount": 100,
    "fee": 1.5,
    "netAmount": 98.5,
    "currency": "USDT",
    "address": "0x9B939dE2cD960c7F9FD3eFB04376801C424CEg17",
    "txHash": "0x456def789abc012345678901234567890123456789012345678901234567890123",
    "description": "Retiro mensual",
    "reference": "RETIRO-2025-001",
    "confirmations": 24,
    "createdAt": "2025-05-19T22:15:33.210Z",
    "updatedAt": "2025-05-19T22:30:45.210Z",
    "completedAt": "2025-05-19T22:30:45.210Z"
  }
}
```

### Ejemplos de Código

#### cURL

```bash
curl -X GET https://api.crypto-payment-gateway.com/api/v1/merchant/payouts/743d3c4d-2345-6789-efgh-2345678901cd \
  -H "X-API-Key: pk_live_abcdefg123456789"
```

#### JavaScript

```javascript
const obtenerDetallesRetiro = async (retiroId) => {
  try {
    const response = await fetch(`https://api.crypto-payment-gateway.com/api/v1/merchant/payouts/${retiroId}`, {
      method: 'GET',
      headers: {
        'X-API-Key': 'pk_live_abcdefg123456789'
      }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      return data.data;
    } else {
      throw new Error(data.error?.message || 'Error al obtener detalles del retiro');
    }
  } catch (error) {
    console.error('Error al obtener detalles del retiro:', error);
    throw error;
  }
};
```

#### PHP

```php
<?php
$retiroId = '743d3c4d-2345-6789-efgh-2345678901cd';
$url = "https://api.crypto-payment-gateway.com/api/v1/merchant/payouts/{$retiroId}";

$options = [
    'http' => [
        'method' => 'GET',
        'header' => 'X-API-Key: pk_live_abcdefg123456789'
    ]
];

$context = stream_context_create($options);
$response = file_get_contents($url, false, $context);

if ($response === false) {
    echo "Error al obtener detalles del retiro\n";
} else {
    $result = json_decode($response, true);
    if ($result['success']) {
        $retiro = $result['data'];
        echo "ID de Retiro: {$retiro['id']}\n";
        echo "Estado: {$retiro['status']}\n";
        echo "Monto: {$retiro['amount']} {$retiro['currency']}\n";
        echo "Comisión: {$retiro['fee']} {$retiro['currency']}\n";
        echo "Monto Neto: {$retiro['netAmount']} {$retiro['currency']}\n";
        
        if ($retiro['txHash']) {
            echo "Hash de Transacción: {$retiro['txHash']}\n";
            echo "Confirmaciones: {$retiro['confirmations']}\n";
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

retiro_id = '743d3c4d-2345-6789-efgh-2345678901cd'
url = f'https://api.crypto-payment-gateway.com/api/v1/merchant/payouts/{retiro_id}'

headers = {
    'X-API-Key': 'pk_live_abcdefg123456789'
}

try:
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    
    data = response.json()
    if data['success']:
        retiro = data['data']
        print(f"ID de Retiro: {retiro['id']}")
        print(f"Estado: {retiro['status']}")
        print(f"Monto: {retiro['amount']} {retiro['currency']}")
        print(f"Comisión: {retiro['fee']} {retiro['currency']}")
        print(f"Monto Neto: {retiro['netAmount']} {retiro['currency']}")
        
        if retiro.get('txHash'):
            print(f"Hash de Transacción: {retiro['txHash']}")
            print(f"Confirmaciones: {retiro['confirmations']}")
    else:
        print(f"Error: {data.get('error', {}).get('message', 'Error desconocido')}")
        
except requests.exceptions.RequestException as e:
    print(f"Error al obtener detalles del retiro: {e}")
    if hasattr(e, 'response') and e.response:
        print(f"Respuesta: {e.response.text}")
```

---

## Listar Retiros

Recupera una lista de retiros con filtrado opcional por estado, rango de fechas y términos de búsqueda.

**Endpoint:** `GET /api/v1/merchant/payouts`  
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
| status | string | No | Filtrar por estado de retiro (`pending`, `completed`, `failed`, `all`) |
| search | string | No | Término de búsqueda para coincidir con la referencia o dirección |
| dateRange | string | No | Período de tiempo para filtrar (`1d`, `7d`, `30d`, `90d`) |
| page | number | No | Número de página para paginación (por defecto: 1) |
| limit | number | No | Número de resultados por página (por defecto: 20, máx: 100) |

### Respuesta

**Código de Estado:** 200 OK

```json
{
  "success": true,
  "data": {
    "payouts": [
      {
        "id": "743d3c4d-2345-6789-efgh-2345678901cd",
        "status": "completed",
        "amount": 100,
        "fee": 1.5,
        "netAmount": 98.5,
        "currency": "USDT",
        "address": "0x9B939dE2cD960c7F9FD3eFB04376801C424CEg17",
        "txHash": "0x456def789abc012345678901234567890123456789012345678901234567890123",
        "description": "Retiro mensual",
        "reference": "RETIRO-2025-001",
        "createdAt": "2025-05-19T22:15:33.210Z",
        "updatedAt": "2025-05-19T22:30:45.210Z"
      },
      {
        "id": "843d3c4d-6789-abcd-ijkl-3456789012ef",
        "status": "pending",
        "amount": 200,
        "fee": 2.5,
        "netAmount": 197.5,
        "currency": "USDT",
        "address": "0xAC04adE3cD960c7F9FD3eFB04376801C424CEg28",
        "txHash": null,
        "description": "Retiro semanal",
        "reference": "RETIRO-2025-002",
        "createdAt": "2025-05-19T23:45:12.210Z",
        "updatedAt": "2025-05-19T23:45:12.210Z"
      }
    ],
    "pagination": {
      "total": 15,
      "page": 1,
      "limit": 20,
      "pages": 1
    }
  }
}
```

### Ejemplos de Código

#### cURL

```bash
curl -X GET "https://api.crypto-payment-gateway.com/api/v1/merchant/payouts?status=completed&dateRange=30d&page=1&limit=20" \
  -H "X-API-Key: pk_live_abcdefg123456789"
```

#### JavaScript

```javascript
const listarRetiros = async (filtros = {}) => {
  try {
    const queryParams = new URLSearchParams();
    
    // Añadir filtros opcionales
    if (filtros.status) queryParams.append('status', filtros.status);
    if (filtros.search) queryParams.append('search', filtros.search);
    if (filtros.dateRange) queryParams.append('dateRange', filtros.dateRange);
    if (filtros.page) queryParams.append('page', filtros.page);
    if (filtros.limit) queryParams.append('limit', filtros.limit);
    
    const url = `https://api.crypto-payment-gateway.com/api/v1/merchant/payouts?${queryParams.toString()}`;
    
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
      throw new Error(data.error?.message || 'Error al obtener retiros');
    }
  } catch (error) {
    console.error('Error al obtener retiros:', error);
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
$url = "https://api.crypto-payment-gateway.com/api/v1/merchant/payouts?{$queryString}";

$options = [
    'http' => [
        'method' => 'GET',
        'header' => 'X-API-Key: pk_live_abcdefg123456789'
    ]
];

$context = stream_context_create($options);
$response = file_get_contents($url, false, $context);

if ($response === false) {
    echo "Error al obtener retiros\n";
} else {
    $result = json_decode($response, true);
    if ($result['success']) {
        $retiros = $result['data']['payouts'];
        $paginacion = $result['data']['pagination'];
        
        echo "Encontrados {$paginacion['total']} retiros, mostrando página {$paginacion['page']} de {$paginacion['pages']}\n\n";
        
        foreach ($retiros as $retiro) {
            echo "ID de Retiro: {$retiro['id']}\n";
            echo "Estado: {$retiro['status']}\n";
            echo "Monto: {$retiro['amount']} {$retiro['currency']}\n";
            echo "Monto Neto: {$retiro['netAmount']} {$retiro['currency']}\n";
            echo "Dirección: {$retiro['address']}\n";
            echo "Creado: {$retiro['createdAt']}\n";
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

url = 'https://api.crypto-payment-gateway.com/api/v1/merchant/payouts'

headers = {
    'X-API-Key': 'pk_live_abcdefg123456789'
}

try:
    response = requests.get(url, params=filtros, headers=headers)
    response.raise_for_status()
    
    data = response.json()
    if data['success']:
        retiros = data['data']['payouts']
        paginacion = data['data']['pagination']
        
        print(f"Encontrados {paginacion['total']} retiros, mostrando página {paginacion['page']} de {paginacion['pages']}")
        
        for retiro in retiros:
            print(f"\nID de Retiro: {retiro['id']}")
            print(f"Estado: {retiro['status']}")
            print(f"Monto: {retiro['amount']} {retiro['currency']}")
            print(f"Comisión: {retiro['fee']} {retiro['currency']}")
            print(f"Monto Neto: {retiro['netAmount']} {retiro['currency']}")
            print(f"Dirección: {retiro['address']}")
            
            if retiro.get('txHash'):
                print(f"Hash de Transacción: {retiro['txHash']}")
    else:
        print(f"Error: {data.get('error', {}).get('message', 'Error desconocido')}")
        
except requests.exceptions.RequestException as e:
    print(f"Error al obtener retiros: {e}")
    if hasattr(e, 'response') and e.response:
        print(f"Respuesta: {e.response.text}")
```
