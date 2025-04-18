import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { IsNotEmpty, IsUrl, IsEnum } from 'class-validator';
import { Merchant } from './Merchant';

export enum WebhookEvent {
  PAYMENT_RECEIVED = 'payment.received',
  PAYMENT_CONFIRMED = 'payment.confirmed',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_UNDERPAID = 'payment.underpaid',
  PAYMENT_COMPLETED = 'payment.completed',
  ADDRESS_CREATED = 'address.created',
  ADDRESS_EXPIRED = 'address.expired',
  SETTLEMENT_COMPLETED = 'settlement.completed',
  TRANSACTION_SETTLED = 'transaction.settled',
  REFUND_INITIATED = 'refund.initiated',
  REFUND_COMPLETED = 'refund.completed',
  REFUND_FAILED = 'refund.failed',
  PAYOUT_INITIATED = 'payout.initiated',
  PAYOUT_PROCESSING = 'payout.processing',
  PAYOUT_COMPLETED = 'payout.completed',
  PAYOUT_FAILED = 'payout.failed'
}

export enum WebhookStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  FAILED = 'failed' // After multiple failed attempts
}

@Entity('webhooks')
export class Webhook {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @IsNotEmpty({ message: 'Webhook URL is required' })
  @IsUrl({}, { message: 'Webhook URL must be a valid URL' })
  url!: string;

  @Column({
    type: 'enum',
    enum: WebhookEvent,
    array: true,
    default: [WebhookEvent.PAYMENT_RECEIVED, WebhookEvent.PAYMENT_CONFIRMED]
  })
  events!: WebhookEvent[];

  @Column({
    type: 'enum',
    enum: WebhookStatus,
    default: WebhookStatus.ACTIVE
  })
  @IsEnum(WebhookStatus)
  status!: WebhookStatus;

  @Column({ nullable: true })
  secret?: string; // Secret for signing webhook payloads

  @Column({ default: 0 })
  failedAttempts!: number;

  @Column({ nullable: true })
  lastFailureReason?: string;

  @Column({ nullable: true })
  lastSuccessAt?: Date;

  @Column({ nullable: true })
  lastAttemptAt?: Date;

  @Column({ default: 3 })
  maxRetries!: number;

  @Column({ default: 15 }) // in seconds
  retryInterval!: number;

  @Column({ default: true })
  sendPayload!: boolean; // Whether to send full payload or just IDs

  @ManyToOne(() => Merchant, merchant => merchant.webhooks)
  @JoinColumn({ name: 'merchant_id' })
  merchant!: Merchant;

  @Column()
  merchantId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Check if webhook should be retried
  shouldRetry(): boolean {
    return this.failedAttempts < this.maxRetries;
  }

  // Increment failed attempts
  incrementFailedAttempts(reason: string): void {
    this.failedAttempts += 1;
    this.lastFailureReason = reason;
    this.lastAttemptAt = new Date();
    
    if (this.failedAttempts >= this.maxRetries) {
      this.status = WebhookStatus.FAILED;
    }
  }

  // Reset failed attempts
  resetFailedAttempts(): void {
    this.failedAttempts = 0;
    this.lastFailureReason = ""; // Empty string instead of null
    this.lastSuccessAt = new Date();
    this.lastAttemptAt = new Date();
    this.status = WebhookStatus.ACTIVE;
  }

  // Calculate next retry time
  getNextRetryTime(): Date {
    const nextRetry = new Date(this.lastAttemptAt || new Date());
    nextRetry.setSeconds(nextRetry.getSeconds() + this.retryInterval * Math.pow(2, this.failedAttempts - 1)); // Exponential backoff
    return nextRetry;
  }
}