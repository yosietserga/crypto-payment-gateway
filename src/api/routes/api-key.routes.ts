import { Router, Request, Response, NextFunction } from 'express';
import { check, validationResult } from 'express-validator';
import { getRepository } from 'typeorm';
import { ApiKey, ApiKeyStatus } from '../../db/entities/ApiKey';
import { Merchant } from '../../db/entities/Merchant';
import { authenticateMerchant } from '../../middleware/auth';
import { ApiError, asyncHandler } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * @route GET /api-keys
 * @desc Get all API keys for a merchant
 * @access Private
 */
router.get('/', authenticateMerchant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.merchant) {
      return next(new ApiError(401, 'User not authenticated', true));
    }
    
    const merchantId = req.merchant.id;
    
    const apiKeys = await getRepository(ApiKey).find({
      where: { merchantId },
      order: { createdAt: 'DESC' }
    });
    
    // Transform the result to not expose sensitive data
    const transformedKeys = apiKeys.map(key => ({
      id: key.id,
      keyPrefix: key.key.substring(0, 10) + '...',
      description: key.description,
      status: key.status,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      permissions: key.permissions,
      readOnly: key.readOnly,
      ipRestrictions: key.ipRestrictions
    }));
    
    return res.json({
      success: true,
      data: transformedKeys
    });
  } catch (error) {
    logger.error('Error fetching API keys', { error });
    next(new ApiError(500, 'Failed to fetch API keys', true));
  }
});

/**
 * @route POST /api-keys
 * @desc Create a new API key
 * @access Private
 */
router.post('/', [
  authenticateMerchant,
  check('description').optional().isString().trim(),
  check('readOnly').optional().isBoolean(),
  check('ipRestrictions').optional().isString().trim(),
  check('permissions').optional().isObject()
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    if (!req.user || !req.merchant) {
      return next(new ApiError(401, 'User not authenticated', true));
    }
    
    const merchantId = req.merchant.id;
    
    // Check if merchant exists and is active
    const merchant = await getRepository(Merchant).findOne({
      where: { id: merchantId }
    });
    
    if (!merchant) {
      return next(new ApiError(404, 'Merchant not found', true));
    }
    
    if (merchant.status !== 'active') {
      return next(new ApiError(403, 'Merchant account is not active', true));
    }
    
    // Create new API key
    const apiKeyRepo = getRepository(ApiKey);
    const apiKey = new ApiKey();
    apiKey.description = req.body.description || 'API Key';
    apiKey.readOnly = req.body.readOnly || false;
    apiKey.ipRestrictions = req.body.ipRestrictions || null;
    apiKey.permissions = req.body.permissions || { payments: true, payouts: true, addresses: true };
    apiKey.merchantId = merchantId;
    apiKey.status = ApiKeyStatus.ACTIVE;
    
    // Save the API key
    await apiKeyRepo.save(apiKey);
    
    // The raw secret is automatically generated in the entity's beforeInsert hook
    // It's available as a temporary property
    const rawSecret = (apiKey as any).rawSecret;
    
    return res.status(201).json({
      success: true,
      data: {
        id: apiKey.id,
        key: apiKey.key,
        secret: rawSecret, // Only returned once at creation time
        description: apiKey.description,
        status: apiKey.status,
        createdAt: apiKey.createdAt,
        permissions: apiKey.permissions,
        readOnly: apiKey.readOnly,
        ipRestrictions: apiKey.ipRestrictions
      }
    });
  } catch (error) {
    logger.error('Error creating API key', { error });
    next(new ApiError(500, 'Failed to create API key', true));
  }
});

/**
 * @route GET /api-keys/:id
 * @desc Get an API key by ID
 * @access Private
 */
router.get('/:id', authenticateMerchant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.merchant) {
      return next(new ApiError(401, 'User not authenticated', true));
    }
    
    const apiKeyId = req.params.id;
    const merchantId = req.merchant.id;
    
    const apiKey = await getRepository(ApiKey).findOne({
      where: { id: apiKeyId, merchantId }
    });
    
    if (!apiKey) {
      return next(new ApiError(404, 'API key not found', true));
    }
    
    // Don't expose sensitive data
    const transformedKey = {
      id: apiKey.id,
      keyPrefix: apiKey.key.substring(0, 10) + '...',
      description: apiKey.description,
      status: apiKey.status,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      permissions: apiKey.permissions,
      readOnly: apiKey.readOnly,
      ipRestrictions: apiKey.ipRestrictions
    };
    
    return res.json({
      success: true,
      data: transformedKey
    });
  } catch (error) {
    logger.error('Error fetching API key', { error });
    next(new ApiError(500, 'Failed to fetch API key', true));
  }
});

/**
 * @route PUT /api-keys/:id
 * @desc Update an API key
 * @access Private
 */
router.put('/:id', [
  authenticateMerchant,
  check('description').optional().isString().trim(),
  check('ipRestrictions').optional().isString().trim(),
  check('permissions').optional().isObject(),
  check('status').optional().isIn(['active', 'revoked'])
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    if (!req.user || !req.merchant) {
      return next(new ApiError(401, 'User not authenticated', true));
    }
    
    const apiKeyId = req.params.id;
    const merchantId = req.merchant.id;
    
    const apiKeyRepo = getRepository(ApiKey);
    let apiKey = await apiKeyRepo.findOne({
      where: { id: apiKeyId, merchantId }
    });
    
    if (!apiKey) {
      return next(new ApiError(404, 'API key not found', true));
    }
    
    // Update fields
    if (req.body.description !== undefined) {
      apiKey.description = req.body.description;
    }
    
    if (req.body.ipRestrictions !== undefined) {
      apiKey.ipRestrictions = req.body.ipRestrictions;
    }
    
    if (req.body.permissions !== undefined) {
      apiKey.permissions = req.body.permissions;
    }
    
    if (req.body.status !== undefined) {
      apiKey.status = req.body.status as ApiKeyStatus;
    }
    
    // Save updated key
    apiKey = await apiKeyRepo.save(apiKey);
    
    return res.json({
      success: true,
      data: {
        id: apiKey.id,
        keyPrefix: apiKey.key.substring(0, 10) + '...',
        description: apiKey.description,
        status: apiKey.status,
        updatedAt: apiKey.updatedAt,
        permissions: apiKey.permissions,
        readOnly: apiKey.readOnly,
        ipRestrictions: apiKey.ipRestrictions
      }
    });
  } catch (error) {
    logger.error('Error updating API key', { error });
    next(new ApiError(500, 'Failed to update API key', true));
  }
});

/**
 * @route DELETE /api-keys/:id
 * @desc Revoke an API key
 * @access Private
 */
router.delete('/:id', authenticateMerchant, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !req.merchant) {
      return next(new ApiError(401, 'User not authenticated', true));
    }
    
    const apiKeyId = req.params.id;
    const merchantId = req.merchant.id;
    
    const apiKeyRepo = getRepository(ApiKey);
    const apiKey = await apiKeyRepo.findOne({
      where: { id: apiKeyId, merchantId }
    });
    
    if (!apiKey) {
      return next(new ApiError(404, 'API key not found', true));
    }
    
    // Don't actually delete, just revoke
    apiKey.status = ApiKeyStatus.REVOKED;
    await apiKeyRepo.save(apiKey);
    
    return res.json({
      success: true,
      data: { message: 'API key revoked successfully' }
    });
  } catch (error) {
    logger.error('Error revoking API key', { error });
    next(new ApiError(500, 'Failed to revoke API key', true));
  }
});

export default router;
