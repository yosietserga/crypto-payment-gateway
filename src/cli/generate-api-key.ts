#!/usr/bin/env node
import 'reflect-metadata';
import { Command } from 'commander';
import { getConnection } from '../db/connection';
import { Merchant } from '../db/entities/Merchant';
import { ApiKey, ApiKeyStatus } from '../db/entities/ApiKey';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../db/entities/AuditLog';
import { logger } from '../utils/logger';
import { config } from '../config';

// Ensure environment is set
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// Fix for npm run with arguments
// When running with npm run, the actual command line looks like:
// node path/to/node_modules/.bin/ts-node path/to/script.ts arg1 arg2
// So we need to extract just our arguments
const program = new Command();

// Log the raw arguments for debugging
console.log('Raw arguments:', process.argv);

// Fix for npm run command
// When running via 'npm run generate-api-key -- -m abc123', npm adds its own arguments
// We need to detect if we're running through npm and adjust accordingly
let args = process.argv;

// Check if we're running through npm script
const runningThroughNpm = process.env.npm_lifecycle_event === 'generate-api-key';
if (runningThroughNpm) {
  console.log('Detected running through npm script');
  
  // When running through npm, the arguments are passed differently
  // We need to look for the -- separator in the command line
  
  // First, try to find the -- separator in the original command line
  let foundArgs = false;
  
  try {
    // Try to parse npm_config_argv if available
    if (process.env.npm_config_argv) {
      const npmArgv = JSON.parse(process.env.npm_config_argv || '{}');
      console.log('npm_config_argv:', npmArgv);
      
      if (npmArgv && npmArgv.original) {
        // Find the position of -- in the original command
        const dashDashPos = npmArgv.original.indexOf('--');
        if (dashDashPos > -1 && dashDashPos < npmArgv.original.length - 1) {
          // Extract the arguments after --
          const userArgs = npmArgv.original.slice(dashDashPos + 1);
          console.log('User arguments from npm_config_argv:', userArgs);
          
          // Construct new args array with node and script path, followed by user args
          args = [process.argv[0], process.argv[1], ...userArgs];
          console.log('Reconstructed arguments:', args);
          foundArgs = true;
        }
      }
    }
  } catch (error) {
    console.warn('Error parsing npm_config_argv:', error);
  }
  
  // Fallback: Try to find arguments directly in process.argv
  if (!foundArgs) {
    // Look for -- in process.argv
    const dashDashIndex = process.argv.indexOf('--');
    if (dashDashIndex > -1 && dashDashIndex < process.argv.length - 1) {
      // Extract arguments after --
      args = [process.argv[0], process.argv[1]];
      for (let i = dashDashIndex + 1; i < process.argv.length; i++) {
        args.push(process.argv[i]);
      }
      console.log('Arguments extracted from process.argv:', args);
      foundArgs = true;
    }
  }
  
  // If we still haven't found arguments, check if any arguments look like our options
  if (!foundArgs) {
    const hasOurArgs = process.argv.some(arg => /^-[mdeirp]$|^--(merchantId|description|expiresAt|ipRestrictions|readOnly|permissions)/.test(arg));
    if (hasOurArgs) {
      // Use process.argv as is
      console.log('Using process.argv as is since it contains option-like arguments');
      foundArgs = true;
    } else {
      console.warn('Warning: Could not find command line arguments');
      console.warn('When running through npm, you need to use -- to separate npm arguments from script arguments');
      console.warn('Example: npm run generate-api-key -- -m merchant123');
      process.exit(1);
    }
  }
}

program
  .name('generate-api-key')
  .description('CLI tool to generate API keys for merchants\n\nUsage examples:\n  npm run generate-api-key -- -m merchant123 -d "Test API Key"\n  ts-node src/cli/generate-api-key.ts -m merchant123 -r true')
  .version('1.0.0')
  .requiredOption('-m, --merchantId <id>', 'Merchant ID (required)')
  .option('-d, --description <description>', 'API key description')
  .option('-e, --expiresAt <date>', 'Expiration date (ISO format, e.g. 2023-12-31)')
  .option('-i, --ipRestrictions <ips>', 'Comma-separated list of allowed IPs')
  .option('-r, --readOnly <boolean>', 'Whether the API key is read-only (true/false)', 'false')
  .option('-p, --permissions <json>', 'JSON string of permissions')
  .on('--help', () => {
    console.log('');
    console.log('Important Notes:');
    console.log('  1. When running through npm, use -- to separate npm arguments from script arguments');
    console.log('     Example: npm run generate-api-key -- -m merchant123');
    console.log('  2. The API secret will be displayed only once and should be stored securely');
    console.log('  3. For permissions, provide a valid JSON string, e.g. \'{\'payments\':true,\'reports\':true}\'');
  });

// Parse the command line arguments with our adjusted args array
program.parse(args);

const options = program.opts();

// Log the parsed options for debugging
console.log('Parsed options:', options);

// Ensure merchantId is not being incorrectly set to a boolean value
// This can happen if --merchantId is provided without a value
if (options.merchantId === true) {
  console.error('Error: Merchant ID is required but no value was provided');
  console.error('Usage: npm run generate-api-key -- -m <merchantId>');
  process.exit(1);
}

async function createApiKey() {
  let connection = null;
  try {
    // Get database connection using the singleton pattern
    connection = await getConnection();
    const merchantRepository = connection.getRepository(Merchant);
    const apiKeyRepository = connection.getRepository(ApiKey);
    const auditLogRepository = connection.getRepository(AuditLog);
    
    // Check if merchant exists
    if (!options.merchantId) {
      console.error('Error: Merchant ID is required');
      console.error('Usage: npm run generate-api-key -- -m <merchantId>');
      process.exit(1);
    }
    
    // Validate merchant ID format (strict UUID validation)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(options.merchantId)) {
      console.error(`Error: Merchant ID '${options.merchantId}' is not a valid UUID format.`);
      console.error('Merchant IDs must be valid UUIDs, e.g. 9890c5f9-2f35-404b-adc0-2dba4038ff53');
      console.error('This is required by the database schema which expects UUID type for merchant IDs.');
      process.exit(1);
    }
    
    const merchant = await merchantRepository.findOne({ where: { id: options.merchantId } });
    if (!merchant) {
      console.error(`Error: Merchant with ID '${options.merchantId}' not found in the database.`);
      console.error('Please check the following:');
      console.error('  1. The merchant ID is correct and exists in the database');
      console.error('  2. You have the correct environment configured (current: ' + process.env.NODE_ENV + ')');
      console.error('  3. The database connection is properly configured');
      process.exit(1);
    }

    // Create API key
    const apiKey = new ApiKey();
    apiKey.merchant = merchant;
    apiKey.merchantId = merchant.id;
    apiKey.description = options.description || `API key created via CLI on ${new Date().toISOString()}`;
    
    // Set expiration if provided
    if (options.expiresAt) {
      const expiryDate = new Date(options.expiresAt);
      if (isNaN(expiryDate.getTime())) {
        console.error('Error: Invalid expiration date format. Use ISO format (e.g. 2023-12-31)');
        process.exit(1);
      }
      apiKey.expiresAt = expiryDate;
    }
    
    // Set IP restrictions if provided
    if (options.ipRestrictions) {
      apiKey.ipRestrictions = options.ipRestrictions;
    }
    
    // Set read-only flag
    // Handle different ways readOnly might be passed (string 'true'/'false' or boolean)
    if (typeof options.readOnly === 'string') {
      apiKey.readOnly = options.readOnly.toLowerCase() === 'true';
      console.log(`Setting readOnly to ${apiKey.readOnly} (from string value '${options.readOnly}')`);
    } else if (typeof options.readOnly === 'boolean') {
      apiKey.readOnly = options.readOnly;
      console.log(`Setting readOnly to ${apiKey.readOnly} (from boolean value)`);
    } else {
      apiKey.readOnly = false;
      console.log('Setting readOnly to false (default)');
    }
    
    // Set permissions if provided
    if (options.permissions) {
      try {
        apiKey.permissions = JSON.parse(options.permissions);
        
        // Validate that permissions is an object
        if (typeof apiKey.permissions !== 'object' || apiKey.permissions === null || Array.isArray(apiKey.permissions)) {
          throw new Error('Permissions must be a JSON object');
        }
        
        // Log the parsed permissions for confirmation
        console.log('Parsed permissions:', apiKey.permissions);
      } catch (error) {
        console.error('Error: Invalid JSON format for permissions');
        console.error('Please provide a valid JSON object, e.g. \'{\'payments\':true,\'reports\':true}\'');
        console.error('Technical details:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }
    
    // Start a transaction to ensure data consistency
    await connection.transaction(async transactionalEntityManager => {
      // Save the API key
      const savedApiKey = await transactionalEntityManager.save(apiKey);
      
      // Log the creation
      const auditLog = new AuditLog();
      auditLog.action = AuditLogAction.CREATE;
      auditLog.entityType = AuditLogEntityType.API_KEY;
      auditLog.entityId = savedApiKey.id;
      auditLog.description = `CLI API key creation for merchant: ${merchant.businessName}`;
      auditLog.previousState = null as any;
      auditLog.newState = { 
        merchantId: merchant.id, 
        description: apiKey.description,
        expiresAt: apiKey.expiresAt,
        readOnly: apiKey.readOnly
      };
      auditLog.userId = null; // CLI operation
      await transactionalEntityManager.save(auditLog);
      
      console.log('API key created successfully:');
      console.log({
        id: savedApiKey.id,
        key: savedApiKey.key,
        rawSecret: (savedApiKey as any).rawSecret, // This is only available once
        description: savedApiKey.description,
        merchantId: savedApiKey.merchantId,
        expiresAt: savedApiKey.expiresAt,
        readOnly: savedApiKey.readOnly,
        status: savedApiKey.status
      });
      
      console.log('\nIMPORTANT: The secret key is displayed only once. Please save it securely.');
    });
    
    process.exit(0);
  } catch (error) {
    logger.error('Error creating API key:', error);
    console.error('Failed to create API key:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Add a helpful message about how to use the command
function printUsageExample() {
  console.log('\nUsage examples:');
  console.log('  npm run generate-api-key -- -m "9890c5f9-2f35-404b-adc0-2dba4038ff53" -d "Test API Key"');
  console.log('  ts-node src/cli/generate-api-key.ts -m "9890c5f9-2f35-404b-adc0-2dba4038ff53" -r true');
  console.log('  npx ts-node src/cli/generate-api-key.ts --merchantId "9890c5f9-2f35-404b-adc0-2dba4038ff53" --description "Payment processing key"');
  console.log('\nNote: Merchant ID must be a valid UUID format. You can generate a UUID for testing with:');
  console.log('  node -e "console.log(require(\'crypto\').randomUUID())"\n');
}

// Check if we have any arguments at all
if (process.argv.length <= 2 && !runningThroughNpm) {
  console.error('Error: No arguments provided');
  printUsageExample();
  process.exit(1);
}

// Execute the function
createApiKey();