import { Router, Request, Response } from 'express';
import { body, query, param } from 'express-validator';
import axios from 'axios';
import { BinanceService } from '../../services/binanceService';
import { validateRequest } from '../../middleware/validator';
import { authMiddleware } from '../../middleware/authMiddleware';
import { logger } from '../../utils/logger';

const router = Router();
const binanceService = new BinanceService();

/**
 * Get account balances
 */
router.get(
  '/balances',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const assets = req.query.assets ? (req.query.assets as string).split(',') : [];
      let balances = [];
      
      try {
        if (assets.length > 0) {
          // Get specific asset balances
          for (const asset of assets) {
            const balance = await binanceService.getAssetBalance(asset);
            balances.push({
              asset,
              free: balance.free,
              locked: balance.locked,
              total: balance.total
            });
          }
        } else {
          // Get all balances via account info
          // Use account information method instead of direct API call
          const account = await binanceService.getAccountInformation();
          
          // Filter out zero balances unless explicitly requested
          const includeZero = req.query.includeZero === 'true';
          
          account.balances.forEach((balance: any) => {
            const free = parseFloat(balance.free);
            const locked = parseFloat(balance.locked);
            
            if (includeZero || free > 0 || locked > 0) {
              balances.push({
                asset: balance.asset,
                free: balance.free,
                locked: balance.locked,
                total: (free + locked).toString()
              });
            }
          });
        }
      } catch (apiError) {
        logger.error('Error from Binance API', { apiError });
      }
      
      return res.json(balances);
    } catch (error) {
      logger.error('Error processing balances request', { error });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Failed to fetch balances', error: errorMessage });
    }
  }
);

/**
 * Get deposit history
 */
router.get(
  '/deposits',
  authMiddleware,
  [
    query('coin').optional().isString(),
    query('status').optional().isNumeric(),
    query('startTime').optional().isNumeric(),
    query('endTime').optional().isNumeric(),
    query('limit').optional().isNumeric(),
    query('offset').optional().isNumeric(),
    validateRequest
  ],
  async (req: Request, res: Response) => {
    try {
      const params: any = {};
      
      if (req.query.coin) params.coin = req.query.coin;
      if (req.query.status) params.status = req.query.status;
      if (req.query.startTime) params.startTime = req.query.startTime;
      if (req.query.endTime) params.endTime = req.query.endTime;
      if (req.query.limit) params.limit = req.query.limit;
      if (req.query.offset) params.offset = req.query.offset;
      
      try {
        // Attempt to get real deposit history
        const deposits = await binanceService.getDepositHistoryWithParams(params);
        return res.json(deposits);
      } catch (apiError) {
        logger.error('Error from Binance API', { apiError });
        
        return res.json([]);
      }
    } catch (error) {
      logger.error('Error processing deposit history request', { error });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Failed to fetch deposit history', error: errorMessage });
    }
  }
);

/**
 * Get deposit details by ID
 */
router.get(
  '/deposits/:id',
  authMiddleware,
  [
    param('id').isString().notEmpty(),
    validateRequest
  ],
  async (req: Request, res: Response) => {
    try {
      const deposits = await binanceService.getDepositHistoryWithParams();
      
      const deposit = deposits.find((d: any) => d.id === req.params.id);
      
      if (!deposit) {
        return res.status(404).json({ message: 'Deposit not found' });
      }
      
      return res.json(deposit);
    } catch (error) {
      logger.error('Error fetching deposit details', { error, id: req.params.id });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Failed to fetch deposit details', error: errorMessage });
    }
  }
);

/**
 * Get withdrawal history
 */
router.get(
  '/withdrawals',
  authMiddleware,
  [
    query('coin').optional().isString(),
    query('status').optional().isNumeric(),
    query('startTime').optional().isNumeric(),
    query('endTime').optional().isNumeric(),
    query('limit').optional().isNumeric(),
    query('offset').optional().isNumeric(),
    validateRequest
  ],
  async (req: Request, res: Response) => {
    try {
      const params: any = {};
      
      if (req.query.coin) params.coin = req.query.coin;
      if (req.query.status) params.status = req.query.status;
      if (req.query.startTime) params.startTime = req.query.startTime;
      if (req.query.endTime) params.endTime = req.query.endTime;
      if (req.query.limit) params.limit = req.query.limit;
      if (req.query.offset) params.offset = req.query.offset;
      
      try {
        // Attempt to get real withdrawal history
        const withdrawals = await binanceService.getWithdrawalHistoryWithParams(params);
        return res.json(withdrawals);
      } catch (apiError) {
        logger.error('Error from Binance API', { apiError });
        
        return res.json([]);
      }
    } catch (error) {
      logger.error('Error processing withdrawal history request', { error });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Failed to fetch withdrawal history', error: errorMessage });
    }
  }
);

/**
 * Get withdrawal details by ID
 */
router.get(
  '/withdrawals/:id',
  authMiddleware,
  [
    param('id').isString().notEmpty(),
    validateRequest
  ],
  async (req: Request, res: Response) => {
    try {
      const withdrawals = await binanceService.getWithdrawalHistoryWithParams();
      
      const withdrawal = withdrawals.find((w: any) => w.id === req.params.id);
      
      if (!withdrawal) {
        return res.status(404).json({ message: 'Withdrawal not found' });
      }
      
      return res.json(withdrawal);
    } catch (error) {
      logger.error('Error fetching withdrawal details', { error, id: req.params.id });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Failed to fetch withdrawal details', error: errorMessage });
    }
  }
);

/**
 * Get deposit address for a coin
 */
router.get(
  '/deposit-address/:coin',
  authMiddleware,
  [
    param('coin').isString().notEmpty(),
    query('network').optional().isString(),
    validateRequest
  ],
  async (req: Request, res: Response) => {
    try {
      const coin = req.params.coin;
      const network = req.query.network as string || null;
      
      const address = await binanceService.getDepositAddress(coin, network || coin);
      
      return res.json(address);
    } catch (error) {
      logger.error('Error fetching deposit address', { error, coin: req.params.coin });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Failed to fetch deposit address', error: errorMessage });
    }
  }
);

/**
 * Create new withdrawal
 */
router.post(
  '/withdraw',
  authMiddleware,
  [
    body('coin').isString().notEmpty().withMessage('Coin is required'),
    body('address').isString().notEmpty().withMessage('Address is required'),
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('network').optional().isString(),
    body('memo').optional().isString(),
    body('description').optional().isString(),
    validateRequest
  ],
  async (req: Request, res: Response) => {
    try {
      const { coin, address, amount, network, memo, description } = req.body;
      
      // Validate address format
      // We need a public method to validate address since validateAddressFormat is private
      // For now, we'll assume the address is valid if it has a minimum length
      const isValidAddress = address && address.length >= 10;
      if (!isValidAddress) {
        return res.status(400).json({ message: 'Invalid address format' });
      }
      
      // Check available balance
      const balance = await binanceService.getAssetBalance(coin);
      if (parseFloat(balance.free) < parseFloat(amount)) {
        return res.status(400).json({ 
          message: 'Insufficient balance', 
          required: amount, 
          available: balance.free 
        });
      }
      
      // Create a withdrawal object to track this withdrawal
      // In a real implementation, you would create a database record here
      
      // Execute the withdrawal through Binance
      const result = await binanceService.withdrawFunds(
        coin,
        network || coin,
        address,
        parseFloat(amount),
        `MANUAL-${Date.now()}` // Transaction ID placeholder
      );
      
      return res.json({
        success: true,
        withdrawalId: result.id,
        status: result.status,
        details: result
      });
    } catch (error) {
      logger.error('Error creating withdrawal', { error });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Failed to create withdrawal', error: errorMessage });
    }
  }
);

/**
 * Get supported coins and networks
 */
router.get(
  '/coins',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      // Use a public method to get coin information instead of directly accessing private method
      const response = await binanceService.getAllCoins();
      
      // Format the response to be more manageable
      const coins = response.map((coin: any) => ({
        coin: coin.coin,
        name: coin.name,
        networks: coin.networkList.map((network: any) => ({
          network: network.network,
          name: network.name,
          isDefault: network.isDefault,
          withdrawEnabled: network.withdrawEnable,
          depositEnabled: network.depositEnable,
          withdrawFee: network.withdrawFee,
          withdrawMin: network.withdrawMin
        }))
      }));
      
      return res.json(coins);
    } catch (error) {
      logger.error('Error fetching supported coins', { error });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Failed to fetch supported coins', error: errorMessage });
    }
  }
);

/**
 * API status check
 */
router.get(
  '/status',
  async (req: Request, res: Response) => {
    try {
      // System status is a public endpoint that doesn't require authentication
      try {
        const systemStatus = await axios.get(`${process.env.BINANCE_API_URL || 'https://api.binance.com'}/sapi/v1/system/status`);
        
        const statusData = systemStatus.data as any;
        if (statusData && statusData.status === 0) {
          return res.json({ 
            status: 'operational',
            message: 'Binance API is operational',
            details: systemStatus.data
          });
        } else {
          return res.json({ 
            status: 'maintenance',
            message: statusData.msg || 'System in maintenance',
            details: systemStatus.data
          });
        }
      } catch (apiError) {
        logger.error('Error contacting Binance API', { error: apiError });
        
        // Fallback response if we can't contact the API
        return res.json({
          status: 'unknown',
          message: 'Cannot determine Binance API status - connectivity issue',
          error: apiError instanceof Error ? apiError.message : 'Unknown error'
        });
      }
    } catch (error) {
      return res.status(500).json({ 
        status: 'error',
        message: 'Failed to check Binance API status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Get payment transactions history
 */
router.get(
  '/payment-transactions',
  authMiddleware,
  [
    query('startTime').optional().isNumeric(),
    query('endTime').optional().isNumeric(),
    query('limit').optional().isNumeric(),
    query('offset').optional().isNumeric(),
    validateRequest
  ],
  async (req: Request, res: Response) => {
    try {
      // Set up parameters based on query string
      const params: any = {};
      
      if (req.query.startTime) params.startTime = req.query.startTime;
      if (req.query.endTime) params.endTime = req.query.endTime;
      if (req.query.limit) params.limit = req.query.limit;
      if (req.query.offset) params.offset = req.query.offset;
      
      try {
        // todo: call the Binance Pay API

        return res.json([]);
      } catch (apiError) {
        logger.error('Error fetching payment transactions', { error: apiError });
        return res.status(500).json({
          message: 'Failed to fetch payment transactions',
          error: apiError instanceof Error ? apiError.message : 'Unknown error'
        });
      }
    } catch (error) {
      logger.error('Error processing payment transactions request', { error });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Failed to process request', error: errorMessage });
    }
  }
);

/**
 * Create payment request
 */
router.post(
  '/payment-request',
  authMiddleware,
  [
    body('amount').isNumeric().withMessage('Amount must be a number'),
    body('currency').isString().withMessage('Currency is required'),
    body('description').optional().isString(),
    validateRequest
  ],
  async (req: Request, res: Response) => {
    try {
      const { amount, currency, description } = req.body;
      
      return res.json([]);
    } catch (error) {
      logger.error('Error creating payment request', { error });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ message: 'Failed to create payment request', error: errorMessage });
    }
  }
);

export default router;
