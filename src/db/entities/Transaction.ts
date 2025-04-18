import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { IsNotEmpty, IsEnum, Min } from 'class-validator';
import { Merchant } from './Merchant';
import { PaymentAddress } from './PaymentAddress';

export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMING = 'confirming',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  EXPIRED = 'expired',
  SETTLED = 'settled',
  COMPLETED = 'completed',
  UNDERPAID = 'underpaid'
}

export enum TransactionType {
  PAYMENT = 'payment',
  PAYOUT = 'payout',
  REFUND = 'refund',
  SETTLEMENT = 'settlement',
  FEE = 'fee',
  TRANSFER = 'transfer'
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, nullable: true })
  @IsNotEmpty({ message: 'Transaction hash is required' })
  txHash?: string;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING
  })
  @IsEnum(TransactionStatus)
  status: TransactionStatus;

  @Column({
    type: 'enum',
    enum: TransactionType,
    default: TransactionType.PAYMENT
  })
  @IsEnum(TransactionType)
  type: TransactionType;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  @Min(0)
  amount: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  @Min(0)
  feeAmount: number;

  @Column()
  currency: string; // USDT, etc.

  @Column({ default: 'BSC' })
  network: string; // BSC, ETH, etc.

  @Column({ nullable: true })
  fromAddress?: string;

  @Column({ nullable: true })
  toAddress?: string;

  @Column({ nullable: true })
  recipientAddress?: string;

  @Column({ default: 0 })
  confirmations: number;

  @Column({ nullable: true })
  blockNumber?: number;

  @Column({ nullable: true })
  blockHash?: string;

  @Column({ nullable: true })
  blockTimestamp?: Date;

  @Column({ default: false })
  webhookSent!: boolean;

  @Column({ nullable: true })
  webhookResponse?: string;

  @Column({ nullable: true })
  webhookUrl?: string;

  @Column({ nullable: true })
  callbackUrl?: string;

  @Column({ nullable: true })
  settlementTxHash?: string;

  @Column({ nullable: true, type: 'jsonb' })
  metadata?: object; // Additional metadata

  @Column({ nullable: true })
  @Index()
  externalId?: string; // External reference ID (e.g., order ID)

  @ManyToOne(() => Merchant, merchant => merchant.transactions)
  @JoinColumn({ name: 'merchant_id' })
  merchant!: Merchant;

  @Column({ nullable: true })
  merchantId!: string;

  @ManyToOne(() => PaymentAddress, paymentAddress => paymentAddress.transactions)
  @JoinColumn({ name: 'payment_address_id' })
  paymentAddress!: PaymentAddress;

  @Column({ nullable: true })
  paymentAddressId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // Check if transaction is fully confirmed
  isFullyConfirmed(requiredConfirmations: number): boolean {
    return this.confirmations >= requiredConfirmations;
  }

  // Mark transaction as confirmed
  markAsConfirmed(): void {
    this.status = TransactionStatus.CONFIRMED;
  }

  // Mark transaction as settled
  markAsSettled(settlementTxHash: string): void {
    this.status = TransactionStatus.SETTLED;
    this.settlementTxHash = settlementTxHash;
  }

  // Calculate net amount (after fees)
  getNetAmount(): number {
    return this.amount - this.feeAmount;
  }
}