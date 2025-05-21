# Manual de Integración de API para Pasarela de Pago de Criptomonedas

## Introducción

Este manual proporciona documentación completa para integrarse con la API de la Pasarela de Pago de Criptomonedas. Incluye información detallada sobre todos los endpoints disponibles, parámetros de solicitud, formatos de respuesta y métodos de autenticación, junto con ejemplos de código en múltiples lenguajes de programación.

## Tabla de Contenidos

1. [Autenticación](#autenticación)
   
   - [Claves API](#claves-api)
   - [Autenticación JWT](#autenticación-jwt)

2. [Grupos de Endpoints](#grupos-de-endpoints)
   
   - [Endpoints de Autenticación](./endpoints-autenticacion.md)
   - [Endpoints de Pago](./endpoints-pago.md)
   - [Endpoints de Retiro](./endpoints-retiro.md)
   - [Gestión de Claves API](./endpoints-claves-api.md)

3. [Formatos de Respuesta Comunes](#formatos-de-respuesta-comunes)

4. [Manejo de Errores](#manejo-de-errores)

5. [Límites de Velocidad](#límites-de-velocidad)

6. [Mejores Prácticas](#mejores-prácticas)

## Autenticación

La API soporta dos métodos de autenticación:

### Claves API

Las claves API se utilizan para la comunicación de servidor a servidor y proporcionan acceso seguro a la mayoría de los endpoints de la API. Cada clave API está asociada con una cuenta de comerciante específica y tiene permisos específicos.

**Cabeceras:**

```
X-API-Key: tu_clave_api
```

Ejemplo:

```bash
curl -X GET https://api.crypto-payment-gateway.com/api/v1/merchant/payment-addresses \
  -H "X-API-Key: pk_live_abcdefg123456789"
```

### Autenticación JWT

La autenticación JWT (JSON Web Token) se utiliza principalmente para las sesiones de usuario en el panel de control. Después de un inicio de sesión exitoso, recibirás un token JWT que debe incluirse en la cabecera de Autorización para las solicitudes subsiguientes.

**Cabeceras:**

```
Authorization: Bearer tu_token_jwt
```

Ejemplo:

```bash
curl -X GET https://api.crypto-payment-gateway.com/api/v1/merchant/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjkzZmMyYjFhLWFkYWQtNDZjOC1hY2RhLWI5YjcxOTEyNTg5MSIsImVtYWlsIjoiZXhhbXBsZUBleGFtcGxlLmNvbSIsInJvbGUiOiJtZXJjaGFudCIsImlhdCI6MTYyNDMwMzk5OSwiZXhwIjoxNjI0MzkwMzk5fQ.example_signature"
```

## Formatos de Respuesta Comunes

Todas las respuestas de la API siguen un formato JSON consistente:

### Respuesta Exitosa

```json
{
  "success": true,
  "data": {
    // Los datos de respuesta varían según el endpoint
  }
}
```

### Respuesta de Error

```json
{
  "success": false,
  "error": {
    "code": "CÓDIGO_ERROR",
    "message": "Mensaje de error legible para humanos",
    "details": {}  // Detalles adicionales del error (opcional)
  }
}
```

## Manejo de Errores

La API utiliza códigos de estado HTTP estándar para indicar el éxito o fracaso de las solicitudes:

- 200: OK - La solicitud fue exitosa
- 201: Created - Un recurso fue creado exitosamente
- 400: Bad Request - La solicitud estaba mal formada o es inválida
- 401: Unauthorized - Se requiere autenticación o falló
- 403: Forbidden - El usuario autenticado no tiene permiso
- 404: Not Found - El recurso solicitado no existe
- 409: Conflict - La solicitud está en conflicto con el estado actual
- 422: Unprocessable Entity - Errores de validación
- 429: Too Many Requests - Límite de velocidad excedido
- 500: Internal Server Error - Ocurrió un error inesperado

## Límites de Velocidad

La API implementa límites de velocidad para proteger contra abusos. Los límites de velocidad se aplican por clave API o dirección IP:

- 100 solicitudes por minuto para endpoints autenticados
- 10 solicitudes por minuto para endpoints de autenticación

Cuando se excede un límite de velocidad, la API devolverá una respuesta 429 Too Many Requests con una cabecera Retry-After que indica cuándo puedes reanudar las solicitudes.

## Mejores Prácticas

1. **Almacena las Claves API de Forma Segura**: Nunca expongas tus claves API en código del lado del cliente o repositorios públicos.

2. **Implementa Idempotencia**: Para solicitudes POST que crean recursos, usa la cabecera Idempotency-Key para prevenir operaciones duplicadas.

3. **Maneja los Webhooks Adecuadamente**: Verifica las firmas de los webhooks y responde rápidamente con 200 OK para confirmar la recepción.

4. **Usa Manejo de Errores Apropiado**: Implementa un manejo de errores robusto para gestionar los errores de la API con elegancia.

5. **Monitorea los Límites de Velocidad**: Supervisa tu uso de la API para evitar alcanzar los límites de velocidad en producción.
