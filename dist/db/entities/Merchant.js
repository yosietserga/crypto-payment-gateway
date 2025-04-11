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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Merchant = exports.MerchantRiskLevel = exports.MerchantStatus = void 0;
const typeorm_1 = require("typeorm");
const class_validator_1 = require("class-validator");
const User_1 = require("./User");
const PaymentAddress_1 = require("./PaymentAddress");
const Transaction_1 = require("./Transaction");
const Webhook_1 = require("./Webhook");
const ApiKey_1 = require("./ApiKey");
var MerchantStatus;
(function (MerchantStatus) {
    MerchantStatus["ACTIVE"] = "active";
    MerchantStatus["PENDING"] = "pending";
    MerchantStatus["SUSPENDED"] = "suspended";
})(MerchantStatus || (exports.MerchantStatus = MerchantStatus = {}));
var MerchantRiskLevel;
(function (MerchantRiskLevel) {
    MerchantRiskLevel["LOW"] = "low";
    MerchantRiskLevel["MEDIUM"] = "medium";
    MerchantRiskLevel["HIGH"] = "high";
})(MerchantRiskLevel || (exports.MerchantRiskLevel = MerchantRiskLevel = {}));
let Merchant = class Merchant {
    // Helper method to check if merchant has reached daily transaction limit
    hasReachedDailyLimit(amount, currentDailyTotal) {
        if (this.dailyTransactionLimit <= 0)
            return false; // No limit set
        return currentDailyTotal + amount > this.dailyTransactionLimit;
    }
    // Helper method to check if merchant has reached monthly transaction limit
    hasReachedMonthlyLimit(amount, currentMonthlyTotal) {
        if (this.monthlyTransactionLimit <= 0)
            return false; // No limit set
        return currentMonthlyTotal + amount > this.monthlyTransactionLimit;
    }
    // Helper method to check if transaction amount is within allowed range
    isTransactionAmountAllowed(amount) {
        if (this.minTransactionAmount > 0 && amount < this.minTransactionAmount) {
            return false;
        }
        if (this.maxTransactionAmount > 0 && amount > this.maxTransactionAmount) {
            return false;
        }
        return true;
    }
    // Calculate fee for a transaction
    calculateFee(amount) {
        const percentFee = amount * (this.transactionFeePercent / 100);
        return percentFee + this.fixedFeeAmount;
    }
};
exports.Merchant = Merchant;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Merchant.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 100 }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Business name is required' }),
    __metadata("design:type", String)
], Merchant.prototype, "businessName", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, length: 255 }),
    __metadata("design:type", String)
], Merchant.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ unique: true }),
    (0, class_validator_1.IsEmail)({}, { message: 'Invalid email format' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Email is required' }),
    __metadata("design:type", String)
], Merchant.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Merchant.prototype, "phone", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    (0, class_validator_1.IsUrl)({}, { message: 'Website must be a valid URL' }),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], Merchant.prototype, "website", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: MerchantStatus,
        default: MerchantStatus.PENDING
    }),
    __metadata("design:type", String)
], Merchant.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: MerchantRiskLevel,
        default: MerchantRiskLevel.MEDIUM
    }),
    __metadata("design:type", String)
], Merchant.prototype, "riskLevel", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Merchant.prototype, "kycVerified", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Merchant.prototype, "kycDocuments", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Merchant.prototype, "transactionFeePercent", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 2, default: 0 }),
    __metadata("design:type", Number)
], Merchant.prototype, "fixedFeeAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Merchant.prototype, "dailyTransactionLimit", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Merchant.prototype, "monthlyTransactionLimit", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Merchant.prototype, "maxTransactionAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Merchant.prototype, "minTransactionAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Merchant.prototype, "autoSettlement", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Merchant.prototype, "settlementAddress", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Merchant.prototype, "ipWhitelist", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], Merchant.prototype, "testMode", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => User_1.User),
    (0, typeorm_1.JoinColumn)({ name: 'created_by_id' }),
    __metadata("design:type", User_1.User)
], Merchant.prototype, "createdBy", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => PaymentAddress_1.PaymentAddress, paymentAddress => paymentAddress.merchant),
    __metadata("design:type", Array)
], Merchant.prototype, "paymentAddresses", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Transaction_1.Transaction, transaction => transaction.merchant),
    __metadata("design:type", Array)
], Merchant.prototype, "transactions", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Webhook_1.Webhook, webhook => webhook.merchant),
    __metadata("design:type", Array)
], Merchant.prototype, "webhooks", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => ApiKey_1.ApiKey, apiKey => apiKey.merchant),
    __metadata("design:type", Array)
], Merchant.prototype, "apiKeys", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Merchant.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Merchant.prototype, "updatedAt", void 0);
exports.Merchant = Merchant = __decorate([
    (0, typeorm_1.Entity)('merchants')
], Merchant);
//# sourceMappingURL=Merchant.js.map