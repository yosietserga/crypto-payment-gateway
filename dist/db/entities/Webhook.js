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
exports.Webhook = exports.WebhookStatus = exports.WebhookEvent = void 0;
const typeorm_1 = require("typeorm");
const class_validator_1 = require("class-validator");
const Merchant_1 = require("./Merchant");
var WebhookEvent;
(function (WebhookEvent) {
    WebhookEvent["PAYMENT_RECEIVED"] = "payment.received";
    WebhookEvent["PAYMENT_CONFIRMED"] = "payment.confirmed";
    WebhookEvent["PAYMENT_FAILED"] = "payment.failed";
    WebhookEvent["ADDRESS_CREATED"] = "address.created";
    WebhookEvent["ADDRESS_EXPIRED"] = "address.expired";
    WebhookEvent["SETTLEMENT_COMPLETED"] = "settlement.completed";
    WebhookEvent["TRANSACTION_SETTLED"] = "transaction.settled";
})(WebhookEvent || (exports.WebhookEvent = WebhookEvent = {}));
var WebhookStatus;
(function (WebhookStatus) {
    WebhookStatus["ACTIVE"] = "active";
    WebhookStatus["INACTIVE"] = "inactive";
    WebhookStatus["FAILED"] = "failed"; // After multiple failed attempts
})(WebhookStatus || (exports.WebhookStatus = WebhookStatus = {}));
let Webhook = class Webhook {
    // Check if webhook should be retried
    shouldRetry() {
        return this.failedAttempts < this.maxRetries;
    }
    // Increment failed attempts
    incrementFailedAttempts(reason) {
        this.failedAttempts += 1;
        this.lastFailureReason = reason;
        this.lastAttemptAt = new Date();
        if (this.failedAttempts >= this.maxRetries) {
            this.status = WebhookStatus.FAILED;
        }
    }
    // Reset failed attempts
    resetFailedAttempts() {
        this.failedAttempts = 0;
        this.lastFailureReason = ""; // Empty string instead of null
        this.lastSuccessAt = new Date();
        this.lastAttemptAt = new Date();
        this.status = WebhookStatus.ACTIVE;
    }
    // Calculate next retry time
    getNextRetryTime() {
        const nextRetry = new Date(this.lastAttemptAt || new Date());
        nextRetry.setSeconds(nextRetry.getSeconds() + this.retryInterval * Math.pow(2, this.failedAttempts - 1)); // Exponential backoff
        return nextRetry;
    }
};
exports.Webhook = Webhook;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Webhook.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Webhook URL is required' }),
    (0, class_validator_1.IsUrl)({}, { message: 'Webhook URL must be a valid URL' }),
    __metadata("design:type", String)
], Webhook.prototype, "url", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: WebhookEvent,
        array: true,
        default: [WebhookEvent.PAYMENT_RECEIVED, WebhookEvent.PAYMENT_CONFIRMED]
    }),
    __metadata("design:type", Array)
], Webhook.prototype, "events", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: WebhookStatus,
        default: WebhookStatus.ACTIVE
    }),
    (0, class_validator_1.IsEnum)(WebhookStatus),
    __metadata("design:type", String)
], Webhook.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Webhook.prototype, "secret", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 0 }),
    __metadata("design:type", Number)
], Webhook.prototype, "failedAttempts", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], Webhook.prototype, "lastFailureReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Date)
], Webhook.prototype, "lastSuccessAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Date)
], Webhook.prototype, "lastAttemptAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 3 }),
    __metadata("design:type", Number)
], Webhook.prototype, "maxRetries", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: 15 }) // in seconds
    ,
    __metadata("design:type", Number)
], Webhook.prototype, "retryInterval", void 0);
__decorate([
    (0, typeorm_1.Column)({ default: true }),
    __metadata("design:type", Boolean)
], Webhook.prototype, "sendPayload", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Merchant_1.Merchant, merchant => merchant.webhooks),
    (0, typeorm_1.JoinColumn)({ name: 'merchant_id' }),
    __metadata("design:type", Merchant_1.Merchant)
], Webhook.prototype, "merchant", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Webhook.prototype, "merchantId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], Webhook.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)(),
    __metadata("design:type", Date)
], Webhook.prototype, "updatedAt", void 0);
exports.Webhook = Webhook = __decorate([
    (0, typeorm_1.Entity)('webhooks')
], Webhook);
//# sourceMappingURL=Webhook.js.map