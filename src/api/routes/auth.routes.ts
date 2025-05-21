import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { asyncHandler, ApiError } from '../../middleware/errorHandler';
import { config } from '../../config';
import { User, UserRole } from '../../db/entities/User';
import { Merchant, MerchantStatus } from '../../db/entities/Merchant';
import { AuditLog, AuditLogAction, AuditLogEntityType } from '../../db/entities/AuditLog';
import { logger } from '../../utils/logger';
import { getConnection } from '../../db/connection';
import { loginRateLimitMiddleware } from '../../middleware/rateLimitMiddleware';

const router = Router();

/**
 * @route POST /api/v1/auth/register
 * @desc Register a new merchant account
 * @access Public
 */
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('companyName').isString().trim().isLength({ min: 2 }),
    body('contactName').isString().trim().isLength({ min: 2 }),
    body('contactPhone').optional().isMobilePhone('any')
  ],
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const { email, password, companyName, contactName, contactPhone } = req.body;

    try {
      // Get database connection
      const connection = await getConnection();
      const userRepository = connection.getRepository(User);
      const merchantRepository = connection.getRepository(Merchant);
      const auditLogRepository = connection.getRepository(AuditLog);
      
      // Check if user already exists
      const existingUser = await userRepository.findOne({ where: { email } });
      if (existingUser) {
        return next(new ApiError(409, 'User already exists', true));
      }

      // Create user - Let the User entity handle password hashing
      const user = new User();
      user.email = email;
      user.passwordPlain = password; // Using setter to mark password as changed
      user.firstName = contactName.split(' ')[0] || ''; // Extract first name from contact name
      user.lastName = contactName.split(' ').slice(1).join(' ') || ''; // Extract last name from contact name
      user.role = UserRole.VIEWER; // Use enum value instead of string
      const savedUser = await userRepository.save(user);

      // Create merchant profile
      const merchant = new Merchant();
      merchant.businessName = companyName; // Using businessName instead of companyName
      merchant.email = email;
      merchant.phone = contactPhone || '';
      merchant.status = MerchantStatus.ACTIVE; // Set status to active immediately
      merchant.createdBy = savedUser;
      const savedMerchant = await merchantRepository.save(merchant);

      // Log the registration
      const auditLog = new AuditLog();
      auditLog.action = AuditLogAction.CREATE;
      auditLog.entityType = AuditLogEntityType.USER;
      auditLog.entityId = savedUser.id;
      auditLog.description = `New merchant registration: ${email}`;
      auditLog.previousState = null as any;
      auditLog.newState = { email, businessName: companyName };
      auditLog.userId = savedUser.id;
      await auditLogRepository.save(auditLog);

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        config.security.jwtSecret as jwt.Secret,
        { expiresIn: config.security.jwtExpiresIn } as jwt.SignOptions
      );

      res.status(201).json({
        message: 'Registration successful',
        token,
        user: {
          id: savedUser.id,
          email: savedUser.email,
          role: savedUser.role,
          merchant: {
            id: savedMerchant.id,
            companyName: savedMerchant.businessName,
            status: savedMerchant.status
          }
        }
      });
    } catch (error) {
      logger.error('Registration error:', error);
      return next(new ApiError(500, 'Registration failed', true));
    }
  })
);

/**
 * @route POST /api/v1/auth/login
 * @desc Authenticate user & get token
 * @access Public
 */
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 })
  ],
  loginRateLimitMiddleware,
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, 'Validation error', true));
    }

    const { email, password } = req.body;

    try {
      // Get database connection
      const connection = await getConnection();
      const userRepository = connection.getRepository(User);
      const auditLogRepository = connection.getRepository(AuditLog);
      
      // Check if user exists
      const user = await userRepository.findOne({ 
        where: { email },
        relations: ['merchant']
      });

      if (!user) {
        // Don't reveal whether the user exists or not
        logger.debug(`Login attempt for non-existent user: ${email}`);
        return next(new ApiError(401, 'Invalid email or password', true));
      }

      // Check password
      const isMatch = await user.validatePassword(password);
      
      if (!isMatch) {
        // Log failed attempt but don't reveal if it's a password issue
        logger.debug(`Failed login attempt for user: ${email}`);
        return next(new ApiError(401, 'Invalid email or password', true));
      }
      
      // Update last login timestamp
      user.lastLoginAt = new Date();
      await userRepository.save(user);

      // Log the login
      const auditLog = new AuditLog();
      auditLog.action = AuditLogAction.LOGIN;
      auditLog.entityType = AuditLogEntityType.USER;
      auditLog.entityId = user.id;
      auditLog.description = `User login: ${email}`;
      auditLog.previousState = null as any;
      auditLog.newState = { email };
      auditLog.userId = user.id;
      await auditLogRepository.save(auditLog);

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        config.security.jwtSecret as jwt.Secret,
        { expiresIn: config.security.jwtExpiresIn } as jwt.SignOptions
      );

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          merchant: user.merchant ? {
            id: user.merchant.id,
            companyName: user.merchant.businessName,
            status: user.merchant.status
          } : null
        }
      });
    } catch (error) {
      logger.error('Login error:', error);
      return next(new ApiError(500, 'Login failed', true));
    }
  })
);

export default router;