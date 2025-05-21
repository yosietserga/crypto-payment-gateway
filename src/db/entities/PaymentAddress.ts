import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { IsNotEmpty, IsEnum } from 'class-validator';
import { Merchant } from './Merchant';
import { Transaction } from './Transaction';

export enum AddressStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  USED = 'used',
  BLACKLISTED = 'blacklisted'
}

export enum AddressType {
  MERCHANT_PAYMENT = 'merchant_payment',
  HOT_WALLET = 'hot_wallet',
  COLD_WALLET = 'cold_wallet',
  SETTLEMENT = 'settlement'
}

@Entity('payment_addresses')
export class PaymentAddress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index({ unique: true })
  @IsNotEmpty({ message: 'Address is required' })
  address: string;

  @Column({ nullable: true })
  privateKey: string; // Encrypted, only stored for hot wallet addresses

  @Column({ nullable: true })
  hdPath: string; // Derivation path for HD wallet

  @Column({
    type: 'enum',
    enum: AddressStatus,
    default: AddressStatus.ACTIVE
  })
  @IsEnum(AddressStatus)
  status: AddressStatus;

  @Column({
    type: 'enum',
    enum: AddressType,
    default: AddressType.MERCHANT_PAYMENT
  })
  @IsEnum(AddressType)
  type: AddressType;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  expectedAmount: number; // Expected payment amount

  @Column({ nullable: true })
  currency: string; // USDT, etc.

  @Column({ nullable: true })
  reference: string; // External reference ID for merchant use

  @Column({ nullable: true })
  expiresAt: Date; // When this address expires

  @Column({ default: false })
  isMonitored: boolean; // Whether this address is being monitored

  @Column({ nullable: true })
  callbackUrl: string; // URL to call when payment is received

  @Column({ nullable: true, type: 'jsonb' })
  metadata: object; // Additional metadata

  @ManyToOne(() => Merchant, merchant => merchant.paymentAddresses)
  @JoinColumn({ name: 'merchant_id' })
  merchant: Merchant;

  @Column({ nullable: true })
  merchantId: string;

  @OneToMany(() => Transaction, transaction => transaction.paymentAddress)
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Check if address is expired
  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  // Mark address as expired
  markAsExpired(): void {
    this.status = AddressStatus.EXPIRED;
  }

  // Mark address as used
  markAsUsed(): void {
    this.status = AddressStatus.USED;
  }

  // Check if address is valid for receiving payments
  isValidForPayment(): boolean {
    return this.status === AddressStatus.ACTIVE && !this.isExpired();
  }
}