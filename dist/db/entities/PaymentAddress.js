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
exports.PaymentAddress = exports.AddressType = exports.AddressStatus = void 0;
const typeorm_1 = require("typeorm");
const class_validator_1 = require("class-validator");
const Merchant_1 = require("./Merchant");
const Transaction_1 = require("./Transaction");
var AddressStatus;
(function (AddressStatus) {
    AddressStatus["ACTIVE"] = "active";
    AddressStatus["EXPIRED"] = "expired";
    AddressStatus["USED"] = "used";
    AddressStatus["BLACKLISTED"] = "blacklisted";
})(AddressStatus || (exports.AddressStatus = AddressStatus = {}));
var AddressType;
(function (AddressType) {
    AddressType["MERCHANT_PAYMENT"] = "merchant_payment";
    AddressType["HOT_WALLET"] = "hot_wallet";
    AddressType["COLD_WALLET"] = "cold_wallet";
    AddressType["SETTLEMENT"] = "settlement";
})(AddressType || (exports.AddressType = AddressType = {}));
let PaymentAddress = class PaymentAddress {
    // Check if address is expired
    isExpired() {
        if (!this.expiresAt)
            return false;
        return new Date() > this.expiresAt;
    }
    // Mark address as expired
    markAsExpired() {
        this.status = AddressStatus.EXPIRED;
    }
    // Mark address as used
    markAsUsed() {
        this.status = AddressStatus.USED;
    }
    // Check if address is valid for receiving payments
    isValidForPayment() {
        return this.status === AddressStatus.ACTIVE && !this.isExpired();
    }
};
exports.PaymentAddress = PaymentAddress;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PaymentAddress.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    (0, typeorm_1.Index)({ unique: true }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Address is required' }),
    __metadata("design:type", String)
], PaymentAddress.prototype, "address", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], PaymentAddress.prototype, "privateKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], PaymentAddress.prototype, "hdPath", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: AddressStatus,
        default: AddressStatus.ACTIVE
    }),
    (0, class_validator_1.IsEnum)(AddressStatus),
    __metadata("design:type", String)
], PaymentAddress.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: AddressType,
        default: AddressType.MERCHANT_PAYMENT
    }),
    (0, class_validator_1.IsEnum)(AddressType),
    __metadata("design:type", String)
], PaymentAddress.prototype, "type", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 18, scale: 8, nullable: true }),
    __metadata("design:type", Number)
], PaymentAddress.prototype, "expectedAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], PaymentAddress.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Date)
], PaymentAddress.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: false }),
    __metadata("design:type", Boolean)
], PaymentAddress.prototype, "isMonitored", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], PaymentAddress.prototype, "callbackUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, type: 'jsonb' }),
    __metadata("design:type", Object)
], PaymentAddress.prototype, "metadata", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Merchant_1.Merchant, merchant => merchant.paymentAddresses),
    (0, typeorm_1.JoinColumn)({ name: 'merchant_id' }),
    __metadata("design:type", Merchant_1.Merchant)
], PaymentAddress.prototype, "merchant", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], PaymentAddress.prototype, "merchantId", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => Transaction_1.Transaction, transaction => transaction.paymentAddress),
    __metadata("design:type", Array)
], PaymentAddress.prototype, "transactions", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], PaymentAddress.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], PaymentAddress.prototype, "updatedAt", void 0);
exports.PaymentAddress = PaymentAddress = __decorate([
    (0, typeorm_1.Entity)('payment_addresses')
], PaymentAddress);
//# sourceMappingURL=PaymentAddress.js.map