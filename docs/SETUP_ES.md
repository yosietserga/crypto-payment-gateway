# Instrucciones de Configuración para la Pasarela de Pago Crypto

## Requisitos Previos

- Node.js (v16.x o posterior)
- npm (v8.x o posterior)
- PostgreSQL (v13.x o posterior)
- Redis (v6.x o posterior)
- RabbitMQ (v3.9.x o posterior)

## Pasos de Instalación

### 1. Clonar el repositorio

Si aún no ha clonado el repositorio, hágalo con:

```bash
git clone <url-del-repositorio>
cd crypto-payment-gateway-trae
```

### 2. Instalar dependencias

Ejecute el siguiente comando para instalar todas las dependencias requeridas:

```bash
npm install
```

Esto instalará todas las dependencias definidas en el archivo package.json, incluyendo:

- ethers.js para interacciones con blockchain
- Express para el servidor API
- TypeORM y pg para conexiones a bases de datos PostgreSQL
- Redis para caché
- amqplib para la cola de mensajes RabbitMQ
- Y todos los demás paquetes necesarios

### 3. Configurar variables de entorno

Copie el archivo de entorno de ejemplo para crear el suyo propio:

```bash
cp .env.example .env
```

Luego edite el archivo `.env` para configurar sus:
- Detalles de conexión a la base de datos
- URLs de nodos blockchain
- Direcciones de contratos
- Configuración de billeteras (HD Wallet y/o API de Binance)
- Claves de seguridad
- Otros parámetros de configuración

### 4. Configuración de API de Binance (Nuevo)

Para utilizar la billetera de intercambio de Binance en lugar de una billetera HD local, configure los siguientes ajustes en su archivo `.env`:

```
# Configuración de API de Binance
BINANCE_API_KEY=su_clave_api_binance
BINANCE_API_SECRET=su_secreto_api_binance
BINANCE_API_URL=https://api.binance.com
# Establezca en 'true' para usar la billetera de Binance para todas las operaciones, 'false' para usar la billetera HD local
USE_BINANCE_WALLET=false
```

Asegúrese de que su clave API de Binance tenga los siguientes permisos:
- Habilitar Lectura
- Habilitar Comercio
- Habilitar Retiros
- Restricción de IP recomendada para producción

### 5. Compilar el proyecto

Compile el código TypeScript a JavaScript:

```bash
npm run build
```

### 6. Iniciar el servidor de desarrollo

Para desarrollo con recarga automática:

```bash
npm run dev
```

Para producción:

```bash
npm start
```

## Configuración de la Base de Datos

1. Cree una base de datos PostgreSQL:

```sql
CREATE DATABASE crypto_payment_gateway;
```

2. La aplicación creará automáticamente las tablas necesarias al iniciarse a través de migraciones de TypeORM.

## Configuración de la Aplicación Web

La pasarela incluye una aplicación web de procesamiento de pagos ubicada en el directorio `payment-webapp`. Para usarla:

1. Configure su clave API en `payment-webapp/js/app.js`
2. Aloje la aplicación web en su servidor web o en una CDN
3. Utilice la aplicación web tanto para recibir pagos como para enviar desembolsos

## Características del Flujo de Pago

### Recepción de Pagos

El sistema admite la recepción de pagos en criptomonedas de los clientes:

1. Una aplicación externa envía una solicitud HTTP para crear una dirección de pago
2. El cliente paga a la dirección USDT/BEP20 generada
3. El sistema monitorea la blockchain para transacciones entrantes
4. Las actualizaciones del estado de la transacción se envían a través de webhooks
5. El comerciante recibe confirmación cuando el pago está completo

### Envío de Desembolsos (Nuevo)

El sistema ahora admite el envío de desembolsos a clientes:

1. Envíe una solicitud HTTP a `/api/v1/transactions/payout` con:
   - Cantidad a enviar
   - Dirección del destinatario (USDT/BEP20)
   - URL de callback del comerciante
   - URL de notificación webhook
2. El sistema procesa la solicitud de desembolso
3. Las actualizaciones del estado de la transacción se envían a través de webhooks
4. El desembolso se confirma una vez que la transacción es procesada

## Notificaciones Webhook

El sistema envía notificaciones webhook en varias etapas del proceso de pago/desembolso:

### Webhooks de Pago
- `payment.received` - Pago inicial recibido
- `payment.confirmed` - Pago confirmado en blockchain
- `payment.completed` - Pago completamente procesado
- `payment.failed` - El procesamiento del pago falló

### Webhooks de Desembolso (Nuevo)
- `payout.initiated` - Solicitud de desembolso recibida
- `payout.processing` - El desembolso está siendo procesado
- `payout.completed` - Desembolso enviado con éxito
- `payout.failed` - El desembolso falló al procesarse

## Configuración Adicional

### Configuración de Blockchain

Asegúrese de tener acceso adecuado a los nodos BSC. Para producción, se recomienda utilizar proveedores de nodos dedicados o ejecutar sus propios nodos.

### Seguridad de la Billetera

Para entornos de producción, asegúrese de que su mnemónico de billetera HD, claves privadas y credenciales de API de Binance estén correctamente protegidos y nunca sean comprometidos al repositorio.

### Cola de Mensajes

Asegúrese de que RabbitMQ esté funcionando y sea accesible con las credenciales especificadas en su archivo .env.

## Solución de Problemas

Si encuentra algún problema durante la configuración:

1. Verifique que todos los servicios requeridos (PostgreSQL, Redis, RabbitMQ) estén funcionando
2. Verifique que sus variables de entorno estén correctamente configuradas
3. Revise los registros para mensajes de error específicos
4. Asegúrese de que los nodos blockchain sean accesibles y respondan
5. Verifique la conectividad de red para todos los servicios externos
6. Para problemas con la API de Binance, confirme los permisos de la clave API y las restricciones de IP

## Comandos de Desarrollo

- `npm run lint` - Ejecutar linting de código
- `npm test` - Ejecutar pruebas
- `npm run build` - Compilar el proyecto
- `npm run dev` - Iniciar servidor de desarrollo con recarga automática
- `npm start` - Iniciar servidor de producción

## Monitoreo y Mantenimiento

La aplicación genera registros detallados en el directorio `logs/`. Revise estos archivos regularmente para detectar posibles problemas:

- `combined.log` - Todos los registros
- `error.log` - Solo errores

Para un monitoreo más avanzado, considere implementar una solución como ELK Stack (Elasticsearch, Logstash, Kibana) o Prometheus con Grafana.