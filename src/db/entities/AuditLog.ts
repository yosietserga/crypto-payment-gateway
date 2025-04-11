import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './User';

export enum AuditLogAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_CONFIRMED = 'payment_confirmed',
  PAYMENT_SETTLED = 'payment_settled',
  ADDRESS_GENERATED = 'address_generated',
  ADDRESS_CREATED = 'address_created',
  ADDRESS_EXPIRED = 'address_expired',
  API_KEY_CREATED = 'api_key_created',
  API_KEY_REVOKED = 'api_key_revoked',
  WEBHOOK_CREATED = 'webhook_created',
  WEBHOOK_UPDATED = 'webhook_updated',
  WEBHOOK_DELETED = 'webhook_deleted',
  MERCHANT_CREATED = 'merchant_created',
  MERCHANT_UPDATED = 'merchant_updated',
  MERCHANT_STATUS_CHANGED = 'merchant_status_changed',
  MANUAL_TRANSACTION_OVERRIDE = 'manual_transaction_override',
  SYSTEM_ERROR = 'system_error',
  SECURITY_ALERT = 'security_alert',
  SETTLEMENT_TRIGGERED = 'settlement_triggered',
  SETTLEMENT_PROCESSED = 'settlement_processed',
  TRANSACTION_STATUS_UPDATED = 'transaction_status_updated',
  COLD_STORAGE_TRANSFER = 'cold_storage_transfer',
  COLD_STORAGE_TRANSFER_TRIGGERED = 'cold_storage_transfer_triggered'
}

export enum AuditLogEntityType {
  USER = 'user',
  MERCHANT = 'merchant',
  PAYMENT_ADDRESS = 'payment_address',
  TRANSACTION = 'transaction',
  WEBHOOK = 'webhook',
  API_KEY = 'api_key',
  SYSTEM = 'system'
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: AuditLogAction
  })
  action: AuditLogAction;

  @Column({
    type: 'enum',
    enum: AuditLogEntityType
  })
  entityType: AuditLogEntityType;

  @Column({ nullable: true })
  @Index()
  entityId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  previousState: object | null;

  @Column({ type: 'jsonb', nullable: true })
  newState: object | null;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  ipAddress: string | null;

  @Column({ nullable: true })
  userAgent: string | null;

  @ManyToOne(() => User, user => user.auditLogs, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ nullable: true })
  userId: string | null;

  @Column({ nullable: true })
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