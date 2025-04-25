import { PaymentAddress, AddressStatus, AddressType } from '../../../src/db/entities/PaymentAddress';
import { Merchant, MerchantStatus } from '../../../src/db/entities/Merchant';
import { getRepository } from 'typeorm';

describe('PaymentAddress Entity', () => {
  let merchant: Merchant;
  
  beforeEach(async () => {
    // Create a test merchant
    merchant = new Merchant();
    merchant.businessName = 'Test Business';
    merchant.email = 'test@example.com';
    merchant.status = MerchantStatus.ACTIVE;
    await getRepository(Merchant).save(merchant);
  });

  it('should correctly identify expired addresses', async () => {
    const address = new PaymentAddress();
    address.address = '0x1234567890abcdef1234567890abcdef12345678';
    address.merchant = merchant;
    address.merchantId = merchant.id;
    address.status = AddressStatus.ACTIVE;
    address.type = AddressType.MERCHANT_PAYMENT;
    
    // Address with no expiration date
    expect(address.isExpired()).toBe(false);
    
    // Address with future expiration date
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30); // 30 days in the future
    address.expiresAt = futureDate;
    expect(address.isExpired()).toBe(false);
    
    // Address with past expiration date
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1); // 1 day in the past
    address.expiresAt = pastDate;
    expect(address.isExpired()).toBe(true);
  });

  it('should mark address as expired', async () => {
    const address = new PaymentAddress();
    address.address = '0x1234567890abcdef1234567890abcdef12345678';
    address.merchant = merchant;
    address.merchantId = merchant.id;
    address.status = AddressStatus.ACTIVE;
    
    address.markAsExpired();
    expect(address.status).toBe(AddressStatus.EXPIRED);
  });

  it('should mark address as used', async () => {
    const address = new PaymentAddress();
    address.address = '0x1234567890abcdef1234567890abcdef12345678';
    address.merchant = merchant;
    address.merchantId = merchant.id;
    address.status = AddressStatus.ACTIVE;
    
    address.markAsUsed();
    expect(address.status).toBe(AddressStatus.USED);
  });

  it('should correctly validate if address is valid for payment', async () => {
    const address = new PaymentAddress();
    address.address = '0x1234567890abcdef1234567890abcdef12345678';
    address.merchant = merchant;
    address.merchantId = merchant.id;
    
    // Active address
    address.status = AddressStatus.ACTIVE;
    expect(address.isValidForPayment()).toBe(true);
    
    // Expired address by status
    address.status = AddressStatus.EXPIRED;
    expect(address.isValidForPayment()).toBe(false);
    
    // Used address
    address.status = AddressStatus.USED;
    expect(address.isValidForPayment()).toBe(false);
    
    // Blacklisted address
    address.status = AddressStatus.BLACKLISTED;
    expect(address.isValidForPayment()).toBe(false);
    
    // Active address but expired by date
    address.status = AddressStatus.ACTIVE;
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    address.expiresAt = pastDate;
    expect(address.isValidForPayment()).toBe(false);
  });

  it('should save and retrieve address with all properties', async () => {
    const address = new PaymentAddress();
    address.address = '0x1234567890abcdef1234567890abcdef12345678';
    address.privateKey = 'encrypted_private_key';
    address.hdPath = 'm/44\'/60\'/0\'/0/0';
    address.status = AddressStatus.ACTIVE;
    address.type = AddressType.MERCHANT_PAYMENT;
    address.expectedAmount = 100.5;
    address.currency = 'USDT';
    address.isMonitored = true;
    address.callbackUrl = 'https://example.com/callback';
    address.metadata = { orderId: '12345', customerId: 'cust-001' };
    address.merchant = merchant;
    address.merchantId = merchant.id;
    
    // Save the address
    const savedAddress = await getRepository(PaymentAddress).save(address);
    expect(savedAddress.id).toBeDefined();
    
    // Retrieve the address
    const retrievedAddress = await getRepository(PaymentAddress).findOne({
      where: { id: savedAddress.id }
    });
    expect(retrievedAddress).toBeDefined();
    if (retrievedAddress) {
      expect(retrievedAddress.address).toBe('0x1234567890abcdef1234567890abcdef12345678');
      expect(retrievedAddress.privateKey).toBe('encrypted_private_key');
      expect(retrievedAddress.hdPath).toBe('m/44\'60\'0\'0/0');
      expect(retrievedAddress.status).toBe(AddressStatus.ACTIVE);
      expect(retrievedAddress.type).toBe(AddressType.MERCHANT_PAYMENT);
      expect(Number(retrievedAddress.expectedAmount)).toBe(100.5);
      expect(retrievedAddress.currency).toBe('USDT');
      expect(retrievedAddress.isMonitored).toBe(true);
      expect(retrievedAddress.callbackUrl).toBe('https://example.com/callback');
      expect(retrievedAddress.metadata).toEqual({ orderId: '12345', customerId: 'cust-001' });
      expect(retrievedAddress.merchantId).toBe(merchant.id);
    }
  });
});