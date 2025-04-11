import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index({ unique: true })
  key: string;

  @Column({ nullable: true })
  merchantId: string;

  @Column()
  method: string;

  @Column()
  path: string;

  @Column({ type: 'jsonb', nullable: true })
  requestData: object;

  @Column({ nullable: true })
  response: string;

  @Column({ nullable: true, default: 200 })
  statusCode: number;

  @Column({ nullable: true })
  completedAt: Date;

  @Column({ nullable: true })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  // Check if key is expired
  isExpired(): boolean {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  // These methods should be used in a service with TypeORM repository
  // Example usage:
  // const repository = connection.getRepository(IdempotencyKey);
  // const key = await repository.findOne({ where: { key: 'some-key' } });
  
  // Helper method to create a new key instance
  static createInstance(key: string, method: string, path: string, expiresAt: Date): IdempotencyKey {
    const idempotencyKey = new IdempotencyKey();
    idempotencyKey.key = key;
    idempotencyKey.method = method;
    idempotencyKey.path = path;
    idempotencyKey.expiresAt = expiresAt;
    return idempotencyKey;
  }
  
  // Helper method to prepare update data for a response
  static getResponseUpdateData(statusCode: number, response: string): Partial<IdempotencyKey> {
    return {
      statusCode,
      response,
      completedAt: new Date()
    };
  }
  
  // Helper method to get query for expired keys
  static getExpiredKeysQuery(): any {
    const now = new Date();
    return {
      where: {
        expiresAt: {
          lessThan: now
        }
      }
    };
  }


}