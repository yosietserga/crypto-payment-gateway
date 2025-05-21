# Endpoints de Autenticación

Estos endpoints manejan el registro de usuarios, inicio de sesión y operaciones relacionadas con la autenticación.

## Registrar una Cuenta de Comerciante

Crea una nueva cuenta de comerciante y devuelve un token de autenticación.

**Endpoint:** `POST /api/v1/auth/register`  
**Acceso:** Público  
**Límite de velocidad:** 10 solicitudes por minuto

### Parámetros de Solicitud

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| email | string | Sí | Dirección de correo electrónico para la cuenta del comerciante. Debe ser única. |
| password | string | Sí | Contraseña para la cuenta. Mínimo 8 caracteres. |
| companyName | string | Sí | Nombre del negocio o empresa. |
| contactName | string | Sí | Nombre completo de la persona de contacto principal. |
| contactPhone | string | No | Número de teléfono para el contacto principal. |

### Respuesta

**Código de Estado:** 201 Created

```json
{
  "message": "Registro exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "93fc2b1a-adad-46c8-acda-b9b719125891",
    "email": "comerciante@ejemplo.com",
    "role": "merchant",
    "merchant": {
      "id": "78e1c2d3-5678-90ab-cdef-1234567890ab",
      "companyName": "Empresa Ejemplo",
      "status": "active"
    }
  }
}
```

### Ejemplos de Código

#### cURL

```bash
curl -X POST https://api.crypto-payment-gateway.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "comerciante@ejemplo.com",
    "password": "contraseñasegura123",
    "companyName": "Empresa Ejemplo",
    "contactName": "Juan Pérez",
    "contactPhone": "+1234567890"
  }'
```

#### JavaScript

```javascript
const registrarComerciante = async () => {
  try {
    const response = await fetch('https://api.crypto-payment-gateway.com/api/v1/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'comerciante@ejemplo.com',
        password: 'contraseñasegura123',
        companyName: 'Empresa Ejemplo',
        contactName: 'Juan Pérez',
        contactPhone: '+1234567890'
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Almacenar token para futuras llamadas a la API
      localStorage.setItem('authToken', data.token);
      return data;
    } else {
      throw new Error(data.error?.message || 'Registro fallido');
    }
  } catch (error) {
    console.error('Error al registrar comerciante:', error);
    throw error;
  }
};
```

#### PHP

```php
<?php
$url = 'https://api.crypto-payment-gateway.com/api/v1/auth/register';
$data = [
    'email' => 'comerciante@ejemplo.com',
    'password' => 'contraseñasegura123',
    'companyName' => 'Empresa Ejemplo',
    'contactName' => 'Juan Pérez',
    'contactPhone' => '+1234567890'
];

$options = [
    'http' => [
        'method' => 'POST',
        'header' => 'Content-Type: application/json',
        'content' => json_encode($data)
    ]
];

$context = stream_context_create($options);
$response = file_get_contents($url, false, $context);

if ($response === false) {
    echo "Error al registrar comerciante\n";
} else {
    $result = json_decode($response, true);
    echo "¡Registro exitoso! Token: " . $result['token'] . "\n";
    
    // Almacenar token para futuras llamadas a la API
    // $_SESSION['authToken'] = $result['token'];
}
?>
```

#### Python

```python
import requests
import json

url = 'https://api.crypto-payment-gateway.com/api/v1/auth/register'
payload = {
    'email': 'comerciante@ejemplo.com',
    'password': 'contraseñasegura123',
    'companyName': 'Empresa Ejemplo',
    'contactName': 'Juan Pérez',
    'contactPhone': '+1234567890'
}

try:
    response = requests.post(url, json=payload, headers={'Content-Type': 'application/json'})
    response.raise_for_status()  # Lanza una excepción para respuestas 4XX/5XX
    
    data = response.json()
    print(f"¡Registro exitoso! ID de Usuario: {data['user']['id']}")
    
    # Almacenar token para futuras llamadas a la API
    auth_token = data['token']
    
except requests.exceptions.RequestException as e:
    print(f"Error al registrar comerciante: {e}")
    if response.text:
        print(f"Respuesta: {response.text}")
```

---

## Iniciar Sesión en Cuenta de Comerciante

Autentica a un comerciante y devuelve un token JWT para acceso a la API.

**Endpoint:** `POST /api/v1/auth/login`  
**Acceso:** Público  
**Límite de velocidad:** 10 solicitudes por minuto

### Parámetros de Solicitud

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| email | string | Sí | Dirección de correo electrónico de la cuenta del comerciante. |
| password | string | Sí | Contraseña para la cuenta. |

### Respuesta

**Código de Estado:** 200 OK

```json
{
  "message": "Inicio de sesión exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "93fc2b1a-adad-46c8-acda-b9b719125891",
    "email": "comerciante@ejemplo.com",
    "role": "merchant",
    "merchant": {
      "id": "78e1c2d3-5678-90ab-cdef-1234567890ab",
      "companyName": "Empresa Ejemplo",
      "status": "active"
    }
  }
}
```

### Ejemplos de Código

#### cURL

```bash
curl -X POST https://api.crypto-payment-gateway.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "comerciante@ejemplo.com",
    "password": "contraseñasegura123"
  }'
```

#### JavaScript

```javascript
const iniciarSesionComerciante = async () => {
  try {
    const response = await fetch('https://api.crypto-payment-gateway.com/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'comerciante@ejemplo.com',
        password: 'contraseñasegura123'
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Almacenar token para futuras llamadas a la API
      localStorage.setItem('authToken', data.token);
      return data;
    } else {
      throw new Error(data.error?.message || 'Inicio de sesión fallido');
    }
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    throw error;
  }
};
```

#### PHP

```php
<?php
$url = 'https://api.crypto-payment-gateway.com/api/v1/auth/login';
$data = [
    'email' => 'comerciante@ejemplo.com',
    'password' => 'contraseñasegura123'
];

$options = [
    'http' => [
        'method' => 'POST',
        'header' => 'Content-Type: application/json',
        'content' => json_encode($data)
    ]
];

$context = stream_context_create($options);
$response = file_get_contents($url, false, $context);

if ($response === false) {
    echo "Inicio de sesión fallido\n";
} else {
    $result = json_decode($response, true);
    echo "¡Inicio de sesión exitoso! Token: " . $result['token'] . "\n";
    
    // Almacenar token para futuras llamadas a la API
    // $_SESSION['authToken'] = $result['token'];
}
?>
```

#### Python

```python
import requests
import json

url = 'https://api.crypto-payment-gateway.com/api/v1/auth/login'
payload = {
    'email': 'comerciante@ejemplo.com',
    'password': 'contraseñasegura123'
}

try:
    response = requests.post(url, json=payload, headers={'Content-Type': 'application/json'})
    response.raise_for_status()
    
    data = response.json()
    print(f"¡Inicio de sesión exitoso! ID de Usuario: {data['user']['id']}")
    
    # Almacenar token para futuras llamadas a la API
    auth_token = data['token']
    
except requests.exceptions.RequestException as e:
    print(f"Error al iniciar sesión: {e}")
    if hasattr(e, 'response') and e.response:
        print(f"Respuesta: {e.response.text}")
```
