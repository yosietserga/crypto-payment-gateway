<?php

namespace CryptoPaymentGateway;

/**
 * Base exception class for Crypto Payment Gateway API errors
 */
class CryptoPaymentException extends \Exception
{
    /**
     * @var array|null Additional error data from the API response
     */
    protected $errorData;
    
    /**
     * Constructor
     *
     * @param string    $message  Error message
     * @param int       $code     Error code
     * @param array     $errorData Additional error data
     * @param \Throwable $previous Previous exception
     */
    public function __construct(string $message, int $code = 0, array $errorData = null, \Throwable $previous = null)
    {
        parent::__construct($message, $code, $previous);
        $this->errorData = $errorData;
    }
    
    /**
     * Get additional error data
     *
     * @return array|null Error data
     */
    public function getErrorData()
    {
        return $this->errorData;
    }
}

/**
 * Exception for authentication errors
 */
class CryptoPaymentAuthException extends CryptoPaymentException
{
}

/**
 * Exception for rate limit errors
 */
class CryptoPaymentRateLimitException extends CryptoPaymentException
{
    /**
     * @var int|null Timestamp when the rate limit will reset
     */
    protected $resetTime;
    
    /**
     * Constructor
     *
     * @param string    $message   Error message
     * @param int       $code      Error code
     * @param int|null  $resetTime Timestamp when the rate limit will reset
     * @param array     $errorData Additional error data
     * @param \Throwable $previous  Previous exception
     */
    public function __construct(string $message, int $code = 429, ?int $resetTime = null, array $errorData = null, \Throwable $previous = null)
    {
        parent::__construct($message, $code, $errorData, $previous);
        $this->resetTime = $resetTime;
    }
    
    /**
     * Get rate limit reset time
     *
     * @return int|null Timestamp when the rate limit will reset
     */
    public function getResetTime(): ?int
    {
        return $this->resetTime;
    }
    
    /**
     * Get seconds remaining until rate limit reset
     *
     * @return int|null Seconds until reset, or null if reset time is not available
     */
    public function getSecondsUntilReset(): ?int
    {
        if ($this->resetTime === null) {
            return null;
        }
        
        $remaining = $this->resetTime - time();
        return max(0, $remaining);
    }
}

/**
 * Exception for validation errors
 */
class CryptoPaymentValidationException extends CryptoPaymentException
{
    /**
     * @var array Validation errors by field
     */
    protected $errors = [];
    
    /**
     * Constructor
     *
     * @param string    $message  Error message
     * @param array     $errors   Validation errors by field
     * @param int       $code     Error code
     * @param \Throwable $previous Previous exception
     */
    public function __construct(string $message, array $errors = [], int $code = 422, \Throwable $previous = null)
    {
        parent::__construct($message, $code, $errors, $previous);
        $this->errors = $errors;
    }
    
    /**
     * Get validation errors
     *
     * @return array Validation errors by field
     */
    public function getValidationErrors(): array
    {
        return $this->errors;
    }
}