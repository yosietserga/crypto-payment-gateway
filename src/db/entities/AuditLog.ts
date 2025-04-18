import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './User';

/**
 * Audit log action types
 */
export enum AuditLogAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_CONFIRMED = 'payment_confirmed',
  PAYMENT_FAILED = 'payment_failed',
  WEBHOOK_SENT = 'webhook_sent',
  WEBHOOK_FAILED = 'webhook_failed',
  SETTLEMENT_INITIATED = 'settlement_initiated',
  SETTLEMENT_COMPLETED = 'settlement_completed',
  SETTLEMENT_FAILED = 'settlement_failed',
  WALLET_CREATED = 'wallet_created',
  WALLET_UPDATED = 'wallet_updated',
  ADDRESS_GENERATED = 'address_generated',
  ADDRESS_EXPIRED = 'address_expired',
  SYSTEM_ERROR = 'system_error',
  BINANCE_WITHDRAWAL = 'binance_withdrawal',
  BINANCE_DEPOSIT = 'binance_deposit',
  BINANCE_BALANCE_CHECK = 'binance_balance_check',
  BINANCE_API_ERROR = 'binance_api_error',
  WITHDRAWAL_FAILED = 'withdrawal_failed'
}

/**
 * Audit log entity types
 */
export enum AuditLogEntityType {
  USER = 'user',
  MERCHANT = 'merchant',
  TRANSACTION = 'transaction',
  PAYMENT_ADDRESS = 'payment_address',
  WALLET = 'wallet',
  WEBHOOK = 'webhook',
  API_KEY = 'api_key',
  SYSTEM = 'system',
  SETTLEMENT = 'settlement'
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    enum: AuditLogAction
  })
  action: AuditLogAction;

  @Column({
    type: 'varchar',
    enum: AuditLogEntityType
  })
  entityType: AuditLogEntityType;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  entityId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  previousState: object | null;

  @Column({ type: 'jsonb', nullable: true })
  newState: object | null;

  @Column({ type: 'varchar', nullable: true })
  description: string;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  userAgent: string | null;

  @ManyToOne(() => User, user => user.auditLogs, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', nullable: true })
  merchantId: string | null;

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  // Static method to create a new audit log entry
  static create(params: {
    action: AuditLogAction;
    entityType: AuditLogEntityType;
    entityId?: string;
    previousState?: object;
    newState?: object;
    description?: string;
    ipAddress?: string;
    userAgent?: string;
    userId?: string;
    merchantId?: string;
  }): AuditLog {
    const auditLog = new AuditLog();
    auditLog.action = params.action;
    auditLog.entityType = params.entityType;
    auditLog.entityId = params.entityId || null;
    auditLog.previousState = params.previousState || null;
    auditLog.newState = params.newState || null;
    auditLog.description = params.description || '';
    auditLog.ipAddress = params.ipAddress || null;
    auditLog.userAgent = params.userAgent || null;
    auditLog.userId = params.userId || null;
    auditLog.merchantId = params.merchantId || null;
    return auditLog;
  }

  // Helper method to sanitize sensitive data before logging
  static sanitizeData(data: any): any {
    if (!data) return data;
    
    const sensitiveFields = ['password', 'secret', 'privateKey', 'token', 'apiKey'];
    const sanitized = { ...data };
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }
}