# Crypto Payment Gateway Execution Flow

This document provides a comprehensive view of the application's execution flow, showing how different components interact during runtime.

## Application Initialization Flow

```mermaid
graph TD
    A[Application Start] --> B[Express App Initialization]
    B --> C[Apply Middleware]
    C --> D[Register API Routes]
    D --> E[Start HTTP Server]
    E --> F[Initialize Services]
    
    %% Services Initialization
    F --> G[QueueService.initialize]
    G -->|Success| H[WebhookService initialization]
    G -->|Failure| I[Enter Fallback Mode]
    I --> H
    
    H --> J[BlockchainService initialization]
    J --> K[TransactionMonitorService.initialize]
    
    %% Transaction Monitor Service Initialization
    K --> L[Start consuming from transaction.monitor queue]
    K --> M[Start monitoring active addresses]
    K --> N[Check QueueService status]
    N -->|Fallback Mode| O[Setup Direct Transaction Processing]
    N -->|Normal Mode| P[Setup QueueService Listener]
    
    %% Error Handling
    K -->|Error| Q[Continue with limited functionality]
    Q --> O
```

## Payment Processing Flow

```mermaid
graph TD
    A[Client Request] --> B[Generate Payment Address]
    B --> C[WalletService.generatePaymentAddress]
    C --> D[Create HD Wallet Address]
    D --> E[Store Address in Database]
    E --> F[Return Address to Client]
    
    %% Transaction Detection
    G[Incoming Transaction] --> H[BlockchainService Event Listener]
    H --> I[Process Incoming Transaction]
    I --> J[Create Transaction Record]
    J --> K[Send WebhookEvent.PAYMENT_RECEIVED]
    K --> L[Queue Transaction for Confirmation]
    
    %% Transaction Confirmation
    L --> M[TransactionMonitorService.checkTransactionConfirmations]
    M --> N[Get Transaction Receipt from Blockchain]
    N --> O[Calculate Confirmations]
    O -->|Insufficient Confirmations| P[Update Status to CONFIRMING]
    P --> Q[Schedule Next Confirmation Check]
    Q --> M
    
    O -->|Sufficient Confirmations| R[Update Status to CONFIRMED]
    R --> S[Send WebhookEvent.PAYMENT_CONFIRMED]
    S --> T[Queue for Settlement]
```

## Settlement Flow

```mermaid
graph TD
    A[SettlementService.scheduleSettlements] --> B[Find Confirmed Transactions]
    B --> C[Group by Merchant]
    C --> D[Queue Settlement Tasks]
    
    %% Settlement Processing
    D --> E[SettlementService.processMerchantSettlement]
    E --> F[Get/Create Hot Wallet]
    F --> G[For Each Transaction]
    G --> H[Settle Transaction]
    
    %% Transaction Settlement
    H --> I[Decrypt Private Key]
    I --> J[Create Blockchain Transaction]
    J --> K[Send Funds to Hot Wallet]
    K --> L[Update Transaction Status]
    L --> M[Send WebhookEvent.TRANSACTION_SETTLED]
```

## Fallback Mechanism Flow

```mermaid
graph TD
    A[QueueService.initialize] -->|Connection Error| B[Enter Fallback Mode]
    B --> C[Schedule Reconnection Attempts]
    B --> D[TransactionMonitorService detects fallback mode]
    D --> E[Setup Direct Transaction Processing]
    
    %% Direct Processing
    E --> F[Process Pending Transactions Directly]
    E --> G[Check Address Expirations Directly]
    
    %% Reconnection
    C -->|Reconnection Success| H[Exit Fallback Mode]
    H --> I[Retry Failed Messages]
    I --> J[Stop Direct Transaction Processing]
    
    C -->|Max Attempts Reached| K[Remain in Fallback Mode]
```

## Webhook Notification Flow

```mermaid
graph TD
    A[Event Trigger] --> B[WebhookService.sendWebhookNotification]
    B --> C[Get Active Webhooks]
    C --> D[For Each Webhook]
    D --> E[Queue Webhook Delivery]
    
    %% Webhook Processing
    E --> F[WebhookService.processWebhookDelivery]
    F --> G[Sign Payload]
    G --> H[Send HTTP Request]
    
    %% Success/Failure Handling
    H -->|Success| I[Update Webhook Status]
    H -->|Failure| J[Update Webhook Status]
    J --> K[Check Retry Count]
    K -->|Under Max Retries| L[Schedule Retry with Backoff]
    L --> F
    K -->|Max Retries Exceeded| M[Log Final Failure]
```

## Critical Paths and Potential Bottlenecks

1. **Blockchain Interaction**
   - Transaction confirmation checks rely on blockchain RPC availability
   - WebSocket connection for real-time transaction monitoring

2. **Queue Service Reliability**
   - Critical for asynchronous processing of transactions and webhooks
   - Fallback mechanism provides resilience but with potential delays

3. **Database Operations**
   - Heavy reliance on database for transaction and address management
   - Circuit breaker pattern helps prevent cascading failures

4. **External API Calls**
   - Webhook delivery depends on merchant endpoint availability
   - Retry mechanism with exponential backoff helps ensure eventual delivery

## Execution Stack Summary

The application follows a layered architecture with clear separation of concerns:

1. **HTTP API Layer** - Express application handling client requests
2. **Service Layer** - Core business logic in specialized services
3. **Data Access Layer** - Database interactions via TypeORM repositories
4. **External Integration Layer** - Blockchain and webhook interactions

The execution flow is primarily event-driven, with the QueueService providing decoupling between components. The fallback mechanisms ensure the application can continue functioning with degraded capabilities even when external dependencies are unavailable.