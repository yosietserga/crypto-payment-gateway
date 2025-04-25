import { ApiKey, ApiKeyStatus } from '../../../src/db/entities/ApiKey';
import { Merchant, MerchantStatus } from '../../../src/db/entities/Merchant';
import { getRepository } from 'typeorm';

describe('ApiKey Entity', () => {
  let merchant: Merchant;
  
  beforeEach(async () => {
    // Create a test merchant
    merchant = new Merchant();
    merchant.businessName = 'Test Business';
    merchant.email = 'test@example.com';
    merchant.status = MerchantStatus.ACTIVE;
    await getRepository(Merchant).save(merchant);
  });

  it('should generate key and secret on creation', async () => {
    const apiKey = new ApiKey();
    apiKey.merchant = merchant;
    apiKey.merchantId = merchant.id;
    
    // Trigger the BeforeInsert hook manually
    apiKey.generateKeyAndSecret();
    
    expect(apiKey.key).toBeDefined();
    expect(apiKey.key).toMatch(/^pk_[a-f0-9]{32}$/);
    expect(apiKey.secret).toBeDefined();
    expect(apiKey.secret.length).toBe(64); // SHA-256 hash is 64 characters
    
    // The raw secret should be available temporarily
    expect((apiKey as any).rawSecret).toBeDefined();
    expect((apiKey as any).rawSecret).toMatch(/^sk_[a-f0-9]{64}$/);
  });

  it('should correctly identify expired keys', async () => {
    const apiKey = new ApiKey();
    apiKey.merchant = merchant;
    apiKey.merchantId = merchant.id;
    apiKey.generateKeyAndSecret();
    
    // Key with no expiration date
    expect(apiKey.isExpired()).toBe(false);
    
    // Key with future expiration date
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30); // 30 days in the future
    apiKey.expiresAt = futureDate;
    expect(apiKey.isExpired()).toBe(false);
    
    // Key with past expiration date
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1); // 1 day in the past
    apiKey.expiresAt = pastDate;
    expect(apiKey.isExpired()).toBe(true);
  });

  it('should correctly validate API key status', async () => {
    const apiKey = new ApiKey();
    apiKey.merchant = merchant;
    apiKey.merchantId = merchant.id;
    apiKey.generateKeyAndSecret();
    
    // Active key
    apiKey.status = ApiKeyStatus.ACTIVE;
    expect(apiKey.isValid()).toBe(true);
    
    // Revoked key
    apiKey.status = ApiKeyStatus.REVOKED;
    expect(apiKey.isValid()).toBe(false);
    
    // Expired key by status
    apiKey.status = ApiKeyStatus.EXPIRED;
    expect(apiKey.isValid()).toBe(false);
    
    // Expired key by date but active status
    apiKey.status = ApiKeyStatus.ACTIVE;
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    apiKey.expiresAt = pastDate;
    expect(apiKey.isValid()).toBe(false);
  });

  it('should update last used timestamp and increment usage count', async () => {
    const apiKey = new ApiKey();
    apiKey.merchant = merchant;
    apiKey.merchantId = merchant.id;
    apiKey.generateKeyAndSecret();
    apiKey.usageCount = 5;
    
    const beforeUpdate = new Date();
    apiKey.updateLastUsed();
    
    expect(apiKey.lastUsedAt).toBeInstanceOf(Date);
    expect(apiKey.lastUsedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    expect(apiKey.usageCount).toBe(6);
  });

  it('should correctly validate IP restrictions', async () => {
    const apiKey = new ApiKey();
    apiKey.merchant = merchant;
    apiKey.merchantId = merchant.id;
    apiKey.generateKeyAndSecret();
    
    // No IP restrictions
    expect(apiKey.isIpAllowed('192.168.1.1')).toBe(true);
    
    // With IP restrictions
    apiKey.ipRestrictions = '192.168.1.1, 10.0.0.1';
    expect(apiKey.isIpAllowed('192.168.1.1')).toBe(true);
    expect(apiKey.isIpAllowed('10.0.0.1')).toBe(true);
    expect(apiKey.isIpAllowed('8.8.8.8')).toBe(false);
  });

  it('should revoke an API key', async () => {
    const apiKey = new ApiKey();
    apiKey.merchant = merchant;
    apiKey.merchantId = merchant.id;
    apiKey.generateKeyAndSecret();
    apiKey.status = ApiKeyStatus.ACTIVE;
    
    apiKey.revoke();
    expect(apiKey.status).toBe(ApiKeyStatus.REVOKED);
  });

  it('should verify API key secret correctly', async () => {
    const apiKey = new ApiKey();
    apiKey.merchant = merchant;
    apiKey.merchantId = merchant.id;
    apiKey.generateKeyAndSecret();
    
    const rawSecret = (apiKey as any).rawSecret;
    expect(apiKey.verifySecret(rawSecret)).toBe(true);
    expect(apiKey.verifySecret('wrong_secret')).toBe(false);
  });
});