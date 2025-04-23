import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { IsEmail, IsNotEmpty, IsUrl, IsOptional } from 'class-validator';
import { User } from './User';
import { PaymentAddress } from './PaymentAddress';
import { Transaction } from './Transaction';
import { Webhook } from './Webhook';
import { ApiKey } from './ApiKey';

export enum MerchantStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SUSPENDED = 'suspended'
}

export enum MerchantRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

@Entity('merchants')
export class Merchant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  @IsNotEmpty({ message: 'Business name is required' })
  businessName: string;

  @Column({ nullable: true, length: 255 })
  description: string;

  @Column({ unique: true })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  @IsUrl({}, { message: 'Website must be a valid URL' })
  @IsOptional()
  website: string;

  @Column({ nullable: true })
  @IsUrl({}, { message: 'Logo URL must be a valid URL' })
  @IsOptional()
  logoUrl: string;

  @Column({
    type: 'enum',
    enum: MerchantStatus,
    default: MerchantStatus.PENDING
  })
  status: MerchantStatus;

  @Column({
    type: 'enum',
    enum: MerchantRiskLevel,
    default: MerchantRiskLevel.MEDIUM
  })
  riskLevel: MerchantRiskLevel;

  @Column({ default: false })
  kycVerified: boolean;

  @Column({ nullable: true })
  kycDocuments: string; // JSON string containing document references

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  transactionFeePercent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  fixedFeeAmount: number;

  @Column({ default: 0 })
  dailyTransactionLimit: number;

  @Column({ default: 0 })
  monthlyTransactionLimit: number;

  @Column({ default: 0 })
  maxTransactionAmount: number;

  @Column({ default: 0 })
  minTransactionAmount: number;

  @Column({ default: true })
  autoSettlement: boolean;

  @Column({ nullable: true })
  settlementAddress: string; // Blockchain address for auto-settlement

  @Column({ nullable: true })
  ipWhitelist: string; // Comma-separated list of allowed IPs

  @Column({ default: false })
  testMode: boolean;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @OneToMany(() => PaymentAddress, paymentAddress => paymentAddress.merchant)
  paymentAddresses: PaymentAddress[];

  @OneToMany(() => Transaction, transaction => transaction.merchant)
  transactions: Transaction[];

  @OneToMany(() => Webhook, webhook => webhook.merchant)
  webhooks: Webhook[];

  @OneToMany(() => ApiKey, apiKey => apiKey.merchant)
  apiKeys: ApiKey[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Helper method to check if merchant has reached daily transaction limit
  hasReachedDailyLimit(amount: number, currentDailyTotal: number): boolean {
    if (this.dailyTransactionLimit <= 0) return false; // No limit set
    return currentDailyTotal + amount > this.dailyTransactionLimit;
  }

  // Helper method to check if merchant has reached monthly transaction limit
  hasReachedMonthlyLimit(amount: number, currentMonthlyTotal: number): boolean {
    if (this.monthlyTransactionLimit <= 0) return false; // No limit set
    return currentMonthlyTotal + amount > this.monthlyTransactionLimit;
  }

  // Helper method to check if transaction amount is within allowed range
  isTransactionAmountAllowed(amount: number): boolean {
    if (this.minTransactionAmount > 0 && amount < this.minTransactionAmount) {
      return false;
    }
    if (this.maxTransactionAmount > 0 && amount > this.maxTransactionAmount) {
      return false;
    }
    return true;
  }

  // Calculate fee for a transaction
  calculateFee(amount: number): number {
    const percentFee = amount * (this.transactionFeePercent / 100);
    return percentFee + this.fixedFeeAmount;
  }
}