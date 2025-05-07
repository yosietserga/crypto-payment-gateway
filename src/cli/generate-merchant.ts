#!/usr/bin/env node
import 'reflect-metadata';
import { Command } from 'commander';
import bcrypt from 'bcrypt';
import { getConnection } from '../db/connection';
import { User, UserRole } from '../db/entities/User';
import { Merchant, MerchantStatus } from '../db/entities/Merchant';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../db/entities/AuditLog';
import { logger } from '../utils/logger';
import { config } from '../config';

// Ensure environment is set
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const program = new Command();

program
  .name('generate-merchant')
  .description('CLI tool to generate merchant records in the database')
  .version('1.0.0')
  .requiredOption('-e, --email <email>', 'Merchant email address')
  .requiredOption('-p, --password <password>', 'User password (min 8 characters)')
  .requiredOption('-c, --companyName <name>', 'Company/Business name')
  .requiredOption('-n, --contactName <name>', 'Contact person name')
  .option('-ph, --phone <phone>', 'Contact phone number')
  .option('-s, --status <status>', 'Merchant status (active, pending, suspended)', 'pending')
  .option('-r, --role <role>', 'User role (admin, operator, viewer)', 'viewer')
  .parse(process.argv);

const options = program.opts();

// Validate options
if (options.password.length < 8) {
  console.error('Error: Password must be at least 8 characters long');
  process.exit(1);
}

if (!options.email.includes('@')) {
  console.error('Error: Invalid email format');
  process.exit(1);
}

if (options.companyName && options.companyName.length < 2) {
  console.error('Error: Company name must be at least 2 characters long');
  process.exit(1);
}

if (options.contactName && options.contactName.length < 2) {
  console.error('Error: Contact name must be at least 2 characters long');
  process.exit(1);
}

// Validate status
const validStatuses = Object.values(MerchantStatus);
if (!validStatuses.includes(options.status as MerchantStatus)) {
  console.error(`Error: Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  process.exit(1);
}

// Validate role
const validRoles = Object.values(UserRole);
if (!validRoles.includes(options.role as UserRole)) {
  console.error(`Error: Invalid role. Must be one of: ${validRoles.join(', ')}`);
  process.exit(1);
}

async function createMerchant() {
  let connection = null;
  try {
    // Get database connection using the singleton pattern
    connection = await getConnection();
    const userRepository = connection.getRepository(User);
    const merchantRepository = connection.getRepository(Merchant);
    const auditLogRepository = connection.getRepository(AuditLog);
    
    // Check if user already exists
    const existingUser = await userRepository.findOne({ where: { email: options.email } });
    if (existingUser) {
      console.error(`Error: User with email ${options.email} already exists`);
      process.exit(1);
    }

    // Hash password using the configured salt rounds
    const salt = await bcrypt.genSalt(config.security.bcryptSaltRounds);
    const hashedPassword = await bcrypt.hash(options.password, salt);

    // Create user
    const user = new User();
    user.email = options.email;
    user.password = hashedPassword;
    user.firstName = options.contactName.split(' ')[0] || ''; // Extract first name from contact name
    user.lastName = options.contactName.split(' ').slice(1).join(' ') || ''; // Extract last name from contact name
    user.role = options.role as UserRole;
    
    // Start a transaction to ensure data consistency
    await connection.transaction(async transactionalEntityManager => {
      // Save the user
      const savedUser = await transactionalEntityManager.save(user);
      
      // Create merchant profile
      const merchant = new Merchant();
      merchant.businessName = options.companyName;
      merchant.email = options.email;
      merchant.phone = options.phone || '';
      merchant.status = options.status as MerchantStatus;
      merchant.createdBy = savedUser;
      const savedMerchant = await transactionalEntityManager.save(merchant);
      
      // Log the creation
      const auditLog = new AuditLog();
      auditLog.action = AuditLogAction.CREATE;
      auditLog.entityType = AuditLogEntityType.USER;
      auditLog.entityId = savedUser.id;
      auditLog.description = `CLI merchant creation: ${options.email}`;
      auditLog.previousState = null as any;
      auditLog.newState = { email: options.email, businessName: options.companyName };
      auditLog.userId = savedUser.id;
      await transactionalEntityManager.save(auditLog);
      
      console.log('Merchant created successfully:');
      console.log({
        user: {
          id: savedUser.id,
          email: savedUser.email,
          role: savedUser.role,
        },
        merchant: {
          id: savedMerchant.id,
          businessName: savedMerchant.businessName,
          status: savedMerchant.status
        }
      });
    });
    
    process.exit(0);
  } catch (error) {
    logger.error('Error creating merchant:', error);
    console.error('Failed to create merchant:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Execute the function
createMerchant();