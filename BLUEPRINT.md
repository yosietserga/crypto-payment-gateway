# Blueprint de la Pasarela de Pagos con Criptomonedas

## Índice

1. [Visión General](#visión-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Procesos y Flujos de Trabajo](#procesos-y-flujos-de-trabajo)
4. [Diagramas de Secuencia](#diagramas-de-secuencia)
5. [Diagrama de Clases](#diagrama-de-clases)
6. [Diagrama Entidad-Relación](#diagrama-entidad-relación)
7. [Componentes Principales](#componentes-principales)
8. [Consideraciones de Seguridad](#consideraciones-de-seguridad)
9. [Escalabilidad y Rendimiento](#escalabilidad-y-rendimiento)

## Visión General

La pasarela de pagos con criptomonedas es una plataforma que permite a los comerciantes aceptar pagos en diferentes criptomonedas (USDT, BNB, etc.) de manera segura y eficiente. El sistema gestiona todo el ciclo de vida de las transacciones, desde la generación de direcciones de pago hasta la liquidación de fondos, proporcionando notificaciones en tiempo real a través de webhooks.

## Arquitectura del Sistema

```
+----------------------------------+
|                                  |
| Client Applications              |
| (Merchant Sites/Mobile Apps)     |
|                                  |
+----------------+----------------+
                 |
                 | HTTPS/WSS
                 |
+----------------v----------------+     +------------------+
|                                 |     |                  |
| API Gateway / Load Balancer    +-----+  Rate Limiter    |
|                                 |     |                  |
+-----------------+---------------+     +------------------+
                  |
         +--------+--------+
         |                 |
+--------v------+  +-------v--------+     +------------------+
|               |  |                |     |                  |
| Auth Service  |  | Core Services  +-----+ Message Queue    |
|               |  |                |     | (RabbitMQ/Kafka) |
+---------------+  +-------+--------+     +--------+---------+
                           |                       |
                 +---------+---------+    +-------v---------+
                 |                   |    |                 |
                 | Database Cluster  |    | Worker Services |
                 | (PostgreSQL)      |    |                 |
                 +---------+---------+    +-------+---------+
                           |                      |
                           |                      |
                 +---------v----------+-----------v---------+
                 |                                          |
                 |        Blockchain Network               |
                 |        (BSC Mainnet/Testnet)            |
                 |                                          |
                 +------------------------------------------+
```

## Procesos y Flujos de Trabajo

### 1. Proceso de Registro de Comerciante

1. El comerciante se registra en la plataforma proporcionando información de negocio
2. El sistema verifica la información y crea una cuenta pendiente
3. El comerciante completa el proceso de verificación KYC/KYB
4. Una vez verificado, el comerciante obtiene acceso al panel de control
5. El comerciante genera credenciales de API para integrar con su sistema

### 2. Proceso de Creación de Orden de Pago

1. El comerciante envía una solicitud a la API para crear una orden de pago
2. El sistema valida la solicitud y los parámetros
3. Se genera una dirección de pago única para la transacción
4. El sistema devuelve la información de pago, incluyendo la dirección y el código QR
5. El comerciante redirige al cliente a la página de pago o muestra la información

### 3. Proceso de Monitoreo de Transacciones

1. El sistema monitorea continuamente la blockchain en busca de transacciones
2. Cuando se detecta una transacción para una dirección de pago activa:
   - Se verifica el monto y otros detalles
   - Se actualiza el estado de la transacción
   - Se envían notificaciones mediante webhooks
3. El sistema sigue monitoreando las confirmaciones hasta alcanzar el umbral configurado
4. Una vez confirmada, la transacción se marca como completada

### 4. Proceso de Liquidación

1. El sistema agrupa las transacciones confirmadas para liquidación
2. Se calculan las comisiones y los montos netos
3. Se generan transacciones de liquidación a las direcciones de los comerciantes
4. Se monitorean las transacciones de liquidación hasta su confirmación
5. Se actualizan los saldos y se envían notificaciones de liquidación

## Diagramas de Secuencia

### Diagrama de Secuencia: Creación de Orden de Pago

```
+----------+          +-------------+          +---------------+          +----------------+
| Merchant |          | API Gateway |          | Core Services |          | Database       |
+----------+          +-------------+          +---------------+          +----------------+
     |                       |                        |                         |
     | Create Payment Order  |                        |                         |
     |---------------------->|                        |                         |
     |                       | Authenticate Request   |                        |
     |                       |----------------------->|                        |
     |                       |                        |                        |
     |                       |                        | Validate Parameters    |
     |                       |                        |----------------------->|
     |                       |                        |                        |
     |                       |                        | Generate Payment Address|
     |                       |                        |----------------------->|
     |                       |                        |                        |
     |                       |                        | Store Payment Order    |
     |                       |                        |----------------------->|
     |                       |                        |                        |
     |                       |                        | Generate Payment URL   |
     |                       |                        |<-----------------------|
     |                       |                        |                        |
     |                       | Return Payment Details |                        |
     |                       |<-----------------------|                        |
     |                       |                        |                        |
     | Payment Order Created |                        |                        |
     |<----------------------|                        |                        |
     |                       |                        |                        |
```

### Diagrama de Secuencia: Procesamiento de Pago

```
+----------+    +------------------+    +---------------------+    +-------------+    +-----------+
| Customer |    | Blockchain Node  |    | Transaction Monitor |    | Core Service|    | Merchant  |
+----------+    +------------------+    +---------------------+    +-------------+    +-----------+
     |                  |                         |                      |                 |
     | Send Payment     |                         |                      |                 |
     |----------------->|                         |                      |                 |
     |                  |                         |                      |                 |
     |                  | Detect Transaction      |                      |                 |
     |                  |------------------------>|                      |                 |
     |                  |                         |                      |                 |
     |                  |                         | Validate Transaction |                 |
     |                  |                         |--------------------->|                 |
     |                  |                         |                      |                 |
     |                  |                         |                      | Update Status   |
     |                  |                         |                      |---------------->|
     |                  |                         |                      |                 |
     |                  | Monitor Confirmations   |                      |                 |
     |                  |------------------------>|                      |                 |
     |                  |                         |                      |                 |
     |                  |                         | Confirm Transaction  |                 |
     |                  |                         |--------------------->|                 |
     |                  |                         |                      |                 |
     |                  |                         |                      | Send Webhook    |
     |                  |                         |                      |---------------->|
     |                  |                         |                      |                 |
     | Redirect to      |                         |                      |                 |
     | Success Page     |                         |                      |                 |
     |<-----------------------------------------------------------------|                 |
     |                  |                         |                      |                 |
```

### Diagrama de Secuencia: Liquidación

```
+---------------+    +----------------+    +-------------------+    +----------------+    +----------+
| Settlement    |    | Wallet Service |    | Blockchain Node   |    | Core Services  |    | Merchant |
| Service       |    |                |    |                   |    |                |    |          |
+---------------+    +----------------+    +-------------------+    +----------------+    +----------+
        |                    |                      |                      |                   |
        | Initiate Settlement|                      |                      |                   |
        |------------------->|                      |                      |                   |
        |                    |                      |                      |                   |
        |                    | Prepare Transactions |                      |                   |
        |                    |--------------------->|                      |                   |
        |                    |                      |                      |                   |
        |                    | Sign Transactions    |                      |                   |
        |                    |--------------------->|                      |                   |
        |                    |                      |                      |                   |
        |                    | Broadcast Transactions                      |                   |
        |                    |--------------------->|                      |                   |
        |                    |                      |                      |                   |
        |                    |                      | Monitor Confirmations|                   |
        |                    |                      |--------------------->|                   |
        |                    |                      |                      |                   |
        |                    |                      |                      | Update Settlement |
        |                    |                      |                      |------------------>|
        |                    |                      |                      |                   |
        |                    |                      |                      | Send Notification |
        |                    |                      |                      |------------------>|
        |                    |                      |                      |                   |
```

## Diagrama de Clases

```
+-------------------+       +-------------------+       +-------------------+
|     Merchant      |       |  PaymentAddress   |       |    Transaction    |
+-------------------+       +-------------------+       +-------------------+
| id: UUID          |       | id: UUID          |       | id: UUID          |
| businessName: str |       | address: str      |       | txHash: str       |
| email: str        |<>-----| merchantId: UUID  |<>-----| status: enum      |
| status: enum      |       | currency: str     |       | type: enum        |
| riskLevel: enum   |       | status: enum      |       | amount: decimal   |
| kycVerified: bool |       | expiresAt: date   |       | confirmations: int|
| webhookUrl: str   |       | createdAt: date   |       | fee: decimal      |
| apiKeys: ApiKey[] |       | updatedAt: date   |       | createdAt: date   |
+-------------------+       +-------------------+       +-------------------+
         |                                                      |
         |                                                      |
         v                                                      v
+-------------------+                                  +-------------------+
|      ApiKey       |                                  |      Webhook      |
+-------------------+                                  +-------------------+
| id: UUID          |                                  | id: UUID          |
| merchantId: UUID  |                                  | merchantId: UUID  |
| key: str          |                                  | url: str          |
| secret: str       |                                  | secret: str       |
| active: bool      |                                  | events: str[]     |
| lastUsed: date    |                                  | active: bool      |
| createdAt: date   |                                  | failCount: int    |
+-------------------+                                  +-------------------+
```

## Diagrama Entidad-Relación

```
+---------------+       +-------------------+       +---------------+
|    Merchant   |<----->| PaymentAddress   |<----->| Transaction   |
+---------------+       +-------------------+       +---------------+
        |                        |                         |
        v                        v                         v
+---------------+       +-------------------+       +---------------+
|   ApiKey      |       |     Webhook      |       |   AuditLog    |
+---------------+       +-------------------+       +---------------+
                                                            ^
                                                            |
+---------------+       +-------------------+       +---------------+
|     User      |<----->| IdempotencyKey   |------>|   Settings    |
+---------------+       +-------------------+       +---------------+
```

## Componentes Principales

### 1. Sistema de Gestión de Direcciones

- **Implementación de Wallet HD**: Generación jerárquica determinista de direcciones
- **Segregación de Wallets**: Separación entre wallets calientes (online) y almacenamiento frío (offline)
- **Expiración de Direcciones**: Caducidad automática de direcciones de pago no utilizadas
- **Encriptación de Claves**: Encriptación multicapa para claves privadas

### 2. Servicio de Monitoreo de Transacciones

- **Monitoreo en Tiempo Real**: Conexiones WebSocket a nodos blockchain
- **Seguimiento de Confirmaciones**: Monitoreo de confirmaciones con umbrales configurables
- **Validación de Transacciones**: Verificación de montos, direcciones y metadatos
- **Reintentos Automáticos**: Patrón circuit breaker para manejar fallos de conexión

### 3. Sistema de Notificaciones por Webhook

- **Notificaciones Basadas en Eventos**: Alertas en tiempo real para eventos de pago
- **Verificación de Firmas**: Firmas HMAC para verificación de payloads
- **Mecanismo de Reintento**: Backoff exponencial para entregas fallidas
- **Seguimiento de Entregas**: Monitoreo y registro del estado de entrega

### 4. Sistema de Liquidación

- **Liquidación Automática**: Transferencias programadas desde wallets calientes
- **Cálculo de Comisiones**: Cálculo dinámico basado en condiciones de red
- **Transacciones por Lotes**: Optimización de costos de gas mediante agrupación
- **Aprobación Manual**: Aprobación opcional para liquidaciones por encima de umbrales

### 5. Panel de Administración

- **Monitoreo de Transacciones**: Vista en tiempo real de todas las transacciones
- **Gestión de Wallets**: Interfaz para administrar wallets y generación de direcciones
- **Gestión de Comerciantes**: Herramientas para incorporar y gestionar cuentas
- **Analítica**: Informes y análisis sobre volúmenes de pago y tendencias

## Consideraciones de Seguridad

### Autenticación y Autorización

- **Autenticación por API Key**: Autenticación basada en HMAC para acceso a API
- **Autenticación JWT**: Tokens JWT para autenticación del panel de administración
- **Control de Acceso Basado en Roles**: Permisos granulares para diferentes roles
- **Lista Blanca de IPs**: Restricciones opcionales de direcciones IP para acceso a API

### Protección de Datos

- **Encriptación de Claves Privadas**: Encriptación AES-256 para claves almacenadas
- **Encriptación de Base de Datos**: Encriptación a nivel de columna para datos sensibles
- **TLS/SSL**: Comunicación segura para todos los endpoints de API
- **Enmascaramiento de Datos**: Ocultamiento de información sensible en logs y respuestas

## Escalabilidad y Rendimiento

### Escalado Horizontal

- **Arquitectura de Microservicios**: Escalado independiente de componentes
- **Balanceo de Carga**: Distribución de tráfico entre múltiples instancias
- **Sharding de Base de Datos**: Particionamiento de datos para mejor rendimiento
- **Réplicas de Lectura**: Separación de operaciones de lectura y escritura

### Resiliencia

- **Patrón Circuit Breaker**: Prevención de fallos en cascada
- **Limitación de Tasa**: Protección contra abuso de API y ataques DoS
- **Mecanismos de Reintento**: Reintentos automáticos con backoff exponencial
- **Monitoreo de Salud**: Monitoreo proactivo de salud y rendimiento del sistema