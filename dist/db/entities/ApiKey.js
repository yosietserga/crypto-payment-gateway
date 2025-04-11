"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKey = exports.ApiKeyStatus = void 0;
const typeorm_1 = require("typeorm");
const class_validator_1 = require("class-validator");
const Merchant_1 = require("./Merchant");
const crypto_1 = __importDefault(require("crypto"));
var ApiKeyStatus;
(function (ApiKeyStatus) {
    ApiKeyStatus["ACTIVE"] = "active";
    ApiKeyStatus["REVOKED"] = "revoked";
    ApiKeyStatus["EXPIRED"] = "expired";
})(ApiKeyStatus || (exports.ApiKeyStatus = ApiKeyStatus = {}));
let ApiKey = class ApiKey {
    // Generate a new API key and secret
    generateKeyAndSecret() {
        if (!this.key) {
            this.key = `pk_${crypto_1.default.randomBytes(16).toString('hex')}`;
        }
        if (!this.secret) {
            const rawSecret = `sk_${crypto_1.default.randomBytes(32).toString('hex')}`;
            // Store hashed version of secret
            this.secret = crypto_1.default.createHash('sha256').update(rawSecret).digest('hex');
            // The raw secret should be returned to the user once and never stored
            this.rawSecret = rawSecret;
        }
    }
    // Check if API key is expired
    isExpired() {
        if (!this.expiresAt)
            return false;
        return new Date() > this.expiresAt;
    }
    // Check if API key is valid
    isValid() {
        return this.status === ApiKeyStatus.ACTIVE && !this.isExpired();
    }
    // Update last used timestamp
    updateLastUsed() {
        this.lastUsedAt = new Date();
        this.usageCount += 1;
    }
    // Verify if IP is allowed
    isIpAllowed(ip) {
        if (!this.ipRestrictions)
            return true;
        const allowedIps = this.ipRestrictions.split(',').map(ip => ip.trim());
        return allowedIps.includes(ip);
    }
    // Revoke API key
    revoke() {
        this.status = ApiKeyStatus.REVOKED;
    }
    // Verify API key secret
    verifySecret(secret) {
        const hashedSecret = crypto_1.default.createHash('sha256').update(secret).digest('hex');
        return this.secret === hashedSecret;
    }
};
exports.ApiKey = ApiKey;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], ApiKey.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'API key is required' }),
    __metadata("design:type", String)
], ApiKey.prototype, "key", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Secret is required' }),
    __metadata("design:type", String)
], ApiKey.prototype, "secret", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], ApiKey.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: ApiKeyStatus,
        default: ApiKeyStatus.ACTIVE
    }),
    __metadata("design:type", String)
], ApiKey.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Date)
], ApiKey.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Date)
], ApiKey.prototype, "lastUsedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], ApiKey.prototype, "usageCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], ApiKey.prototype, "ipRestrictions", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], ApiKey.prototype, "readOnly", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, type: 'jsonb' }),
    __metadata("design:type", Object)
], ApiKey.prototype, "permissions", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Merchant_1.Merchant, merchant => merchant.apiKeys),
    (0, typeorm_1.JoinColumn)({ name: 'merchant_id' }),
    __metadata("design:type", Merchant_1.Merchant)
], ApiKey.prototype, "merchant", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], ApiKey.prototype, "merchantId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], ApiKey.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], ApiKey.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.BeforeInsert)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ApiKey.prototype, "generateKeyAndSecret", null);
exports.ApiKey = ApiKey = __decorate([
    (0, typeorm_1.Entity)('api_keys')
], ApiKey);
//# sourceMappingURL=ApiKey.js.map