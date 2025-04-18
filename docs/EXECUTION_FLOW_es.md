# Flujo de Ejecución de la Pasarela de Pagos Cripto

Este documento proporciona una visión detallada del flujo de ejecución de la aplicación, mostrando cómo interactúan los diferentes componentes durante el tiempo de ejecución.  

## Flujo de Inicialización de la Aplicación

```mermaid
graph TD  
    A[Inicio de la Aplicación] --> B[Inicialización de la Aplicación Express]  
    B --> C[Aplicar Middlewares]  
    C --> D[Registrar Rutas de la API]  
    D --> E[Iniciar Servidor HTTP]  
    E --> F[Inicializar Servicios]  

    %% Inicialización de Servicios  
    F --> G[QueueService.initialize]  
    G -->|Éxito| H[Inicialización de WebhookService]  
    G -->|Fallo| I[Entrar en Modo de Respaldo]  
    I --> H  

    H --> J[Inicialización de BlockchainService]  
    J --> K[Inicialización de TransactionMonitorService]  

    %% Inicialización de TransactionMonitorService  
    K --> L[Comenzar a consumir de la cola transaction.monitor]  
    K --> M[Iniciar monitoreo de direcciones activas]  
    K --> N[Verificar estado de QueueService]  
    N -->|Modo de Respaldo| O[Configurar Procesamiento Directo de Transacciones]  
    N -->|Modo Normal| P[Configurar Listener de QueueService]  

    %% Manejo de Errores  
    K -->|Error| Q[Continuar con funcionalidad limitada]  
    Q --> O  
```

## Flujo de Procesamiento de Pagos

```mermaid
graph TD  
    A[Solicitud del Cliente] --> B[Generar Dirección de Pago]  
    B --> C[WalletService.generatePaymentAddress]  
    C --> D[Crear Dirección HD Wallet]  
    D --> E[Almacenar Dirección en la Base de Datos]  
    E --> F[Devolver Dirección al Cliente]  

    %% Detección de Transacciones  
    G[Transacción Entrante] --> H[Escucha de Eventos de BlockchainService]  
    H --> I[Procesar Transacción Entrante]  
    I --> J[Crear Registro de Transacción]  
    J --> K[Enviar WebhookEvent.PAYMENT_RECEIVED]  
    K --> L[Encolar Transacción para Confirmación]  

    %% Confirmación de Transacción  
    L --> M[TransactionMonitorService.checkTransactionConfirmations]  
    M --> N[Obtener Recibo de Transacción de la Blockchain]  
    N --> O[Calcular Confirmaciones]  
    O -->|Confirmaciones Insuficientes| P[Actualizar Estado a CONFIRMING]  
    P --> Q[Programar Próxima Verificación]  
    Q --> M  

    O -->|Confirmaciones Suficientes| R[Actualizar Estado a CONFIRMED]  
    R --> S[Enviar WebhookEvent.PAYMENT_CONFIRMED]  
    S --> T[Encolar para Liquidación]  
```

## Flujo de Liquidación

```mermaid
graph TD  
    A[SettlementService.scheduleSettlements] --> B[Buscar Transacciones Confirmadas]  
    B --> C[Agrupar por Comercio]  
    C --> D[Encolar Tareas de Liquidación]  

    %% Procesamiento de Liquidación  
    D --> E[SettlementService.processMerchantSettlement]  
    E --> F[Obtener/Crear Hot Wallet]  
    F --> G[Por Cada Transacción]  
    G --> H[Liquidar Transacción]  

    %% Liquidación de Transacción  
    H --> I[Descifrar Clave Privada]  
    I --> J[Crear Transacción en la Blockchain]  
    J --> K[Enviar Fondos a Hot Wallet]  
    K --> L[Actualizar Estado de Transacción]  
    L --> M[Enviar WebhookEvent.TRANSACTION_SETTLED]  
```

## Flujo del Mecanismo de Respaldo

```mermaid
graph TD  
    A[QueueService.initialize] -->|Error de Conexión| B[Entrar en Modo de Respaldo]  
    B --> C[Programar Intentos de Reconexión]  
    B --> D[TransactionMonitorService detecta modo de respaldo]  
    D --> E[Configurar Procesamiento Directo de Transacciones]  

    %% Procesamiento Directo  
    E --> F[Procesar Transacciones Pendientes Directamente]  
    E --> G[Verificar Expiración de Direcciones Directamente]  

    %% Reconexión  
    C -->|Reconexión Exitosa| H[Salir del Modo de Respaldo]  
    H --> I[Reintentar Mensajes Fallidos]  
    I --> J[Detener Procesamiento Directo]  

    C -->|Máximos Intentos Alcanzados| K[Permanecer en Modo de Respaldo]  
```

## Flujo de Notificación Webhook

```mermaid
graph TD  
    A[Evento Activado] --> B[WebhookService.sendWebhookNotification]  
    B --> C[Obtener Webhooks Activos]  
    C --> D[Por Cada Webhook]  
    D --> E[Encolar Entrega del Webhook]  

    %% Procesamiento del Webhook  
    E --> F[WebhookService.processWebhookDelivery]  
    F --> G[Firmar Payload]  
    G --> H[Enviar Solicitud HTTP]  

    %% Manejo de Éxito/Fallo  
    H -->|Éxito| I[Actualizar Estado del Webhook]  
    H -->|Fallo| J[Actualizar Estado del Webhook]  
    J --> K[Verificar Contador de Reintentos]  
    K -->|Reintentos Restantes| L[Programar Reintento con Retardo]  
    L --> F  
    K -->|Límite de Reintentos Alcanzado| M[Registrar Fallo Final]  
```

## Rutas Críticas y Posibles Cuellos de Botella

1. **Interacción con la Blockchain**  
   
   - Las verificaciones de confirmación dependen de la disponibilidad del RPC de la blockchain  
   - Conexión WebSocket para monitoreo en tiempo real  

2. **Fiabilidad del Queue Service**  
   
   - Esencial para el procesamiento asíncrono de transacciones y webhooks  
   - El mecanismo de respaldo brinda resiliencia pero puede introducir retrasos  

3. **Operaciones de Base de Datos**  
   
   - Alta dependencia de la base de datos para gestión de transacciones y direcciones  
   - El patrón *circuit breaker* previene fallos en cascada  

4. **Llamadas a APIs Externas**  
   
   - La entrega de webhooks depende de la disponibilidad de los endpoints del comercio  
   - Mecanismo de reintentos con retroceso exponencial asegura entrega eventual  

## Resumen de la Pila de Ejecución

La aplicación sigue una **arquitectura en capas** con separación clara de responsabilidades:  

1. **Capa de API HTTP** - Aplicación Express que maneja solicitudes  
2. **Capa de Servicios** - Lógica de negocio en servicios especializados  
3. **Capa de Acceso a Datos** - Interacciones con la base de datos mediante TypeORM  
4. **Capa de Integración Externa** - Interacciones con blockchain y webhooks  

El flujo de ejecución es **orientado a eventos**, con QueueService desacoplando componentes. Los mecanismos de respaldo garantizan que la aplicación funcione con capacidades reducidas incluso si hay fallos en dependencias externas.  
