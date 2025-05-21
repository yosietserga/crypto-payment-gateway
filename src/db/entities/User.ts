import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, BeforeInsert, BeforeUpdate, OneToOne, JoinColumn } from 'typeorm';
import { IsEmail, IsNotEmpty, Length } from 'class-validator';
import bcrypt from 'bcrypt';
import { config } from '../../config';
import { AuditLog } from './AuditLog';
import { Merchant } from './Merchant';

export enum UserRole {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  VIEWER = 'viewer'
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 100 })
  @IsNotEmpty({ message: 'First name is required' })
  firstName!: string;

  @Column({ length: 100 })
  @IsNotEmpty({ message: 'Last name is required' })
  lastName!: string;

  @Column({ unique: true })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email!: string;

  @Column()
  @IsNotEmpty({ message: 'Password is required' })
  @Length(8, 100, { message: 'Password must be between 8 and 100 characters' })
  password!: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.VIEWER
  })
  role!: UserRole;

  @Column({ default: false })
  isActive!: boolean;

  @Column({ nullable: true })
  lastLoginAt?: Date;

  @Column({ nullable: true })
  passwordResetToken?: string;

  @Column({ nullable: true })
  passwordResetExpires?: Date;

  @Column({ nullable: true })
  twoFactorSecret?: string;

  @Column({ default: false })
  twoFactorEnabled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => AuditLog, auditLog => auditLog.user)
  auditLogs!: AuditLog[];

  @OneToOne(() => Merchant, merchant => merchant.createdBy)
  merchant!: Merchant;

  // Track if password was changed
  private passwordChanged = false;

  // Setter for password that marks it as changed
  set passwordPlain(value: string) {
    this.password = value;
    this.passwordChanged = true;
  }

  // Hash password before inserting or updating
  @BeforeInsert()
  async hashPasswordOnInsert() {
    if (this.password) {
      this.password = await bcrypt.hash(this.password, config.security.bcryptSaltRounds);
    }
  }

  @BeforeUpdate()
  async hashPasswordOnUpdate() {
    // Only hash the password if it was explicitly changed
    if (this.passwordChanged && this.password) {
      this.password = await bcrypt.hash(this.password, config.security.bcryptSaltRounds);
      this.passwordChanged = false;
    }
  }

  // Method to validate password
  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }

  // Method to get full name
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }
}