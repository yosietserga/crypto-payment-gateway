import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, BeforeInsert } from 'typeorm';
import { IsNotEmpty } from 'class-validator';
import { Merchant } from './Merchant';
import crypto from 'crypto';

export enum ApiKeyStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired'
}

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @IsNotEmpty({ message: 'API key is required' })
  key: string;

  @Column()
  @IsNotEmpty({ message: 'Secret is required' })
  secret: string; // Hashed secret

  @Column({ nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: ApiKeyStatus,
    default: ApiKeyStatus.ACTIVE
  })
  status: ApiKeyStatus;

  @Column({ nullable: true })
  expiresAt: Date;

  @Column({ nullable: true })
  lastUsedAt: Date;

  @Column({ default: 0 })
  usageCount: number;

  @Column({ nullable: true })
  ipRestrictions: string; // Comma-separated list of allowed IPs

  @Column({ default: false })
  readOnly: boolean;

  @Column({ nullable: true, type: 'jsonb' })
  permissions: object; // Specific permissions for this key

  @ManyToOne(() => Merchant, merchant => merchant.apiKeys)
  @JoinColumn({ name: 'merchant_id' })
  merchant: Merchant;

  @Column()
  merchantId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Generate a new API key and secret
  @BeforeInsert()
  generateKeyAndSecret() {
    if (!this.key) {
      this.key = `pk_${crypto.randomBytes(16).toString('hex')}`;
    }
    if (!this.secret) {
      const rawSecret = `sk_${crypto.randomBytes(32).toString('hex')}`;
      // Store hashed version of secret
      this.secret = crypto.createHash('sha256').update(rawSecret).digest('hex');
      // The raw secret should be returned to the user once and never stored
      (this as any).rawSecret = rawSecret;
    }
  }

  // Check if API key is expired
  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  // Check if API key is valid
  isValid(): boolean {
    return this.status === ApiKeyStatus.ACTIVE && !this.isExpired();
  }

  // Update last used timestamp
  updateLastUsed(): void {
    this.lastUsedAt = new Date();
    this.usageCount += 1;
  }

  // Verify if IP is allowed
  isIpAllowed(ip: string): boolean {
    if (!this.ipRestrictions) return true;
    const allowedIps = this.ipRestrictions.split(',').map(ip => ip.trim());
    return allowedIps.includes(ip);
  }

  // Revoke API key
  revoke(): void {
    this.status = ApiKeyStatus.REVOKED;
  }

  // Verify API key secret
  verifySecret(secret: string): boolean {
    const hashedSecret = crypto.createHash('sha256').update(secret).digest('hex');
    return this.secret === hashedSecret;
  }
}