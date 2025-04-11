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
var AuditLog_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLog = exports.AuditLogEntityType = exports.AuditLogAction = void 0;
const typeorm_1 = require("typeorm");
const User_1 = require("./User");
var AuditLogAction;
(function (AuditLogAction) {
    AuditLogAction["CREATE"] = "create";
    AuditLogAction["UPDATE"] = "update";
    AuditLogAction["DELETE"] = "delete";
    AuditLogAction["LOGIN"] = "login";
    AuditLogAction["LOGOUT"] = "logout";
    AuditLogAction["PAYMENT_RECEIVED"] = "payment_received";
    AuditLogAction["PAYMENT_CONFIRMED"] = "payment_confirmed";
    AuditLogAction["PAYMENT_SETTLED"] = "payment_settled";
    AuditLogAction["ADDRESS_GENERATED"] = "address_generated";
    AuditLogAction["ADDRESS_CREATED"] = "address_created";
    AuditLogAction["ADDRESS_EXPIRED"] = "address_expired";
    AuditLogAction["API_KEY_CREATED"] = "api_key_created";
    AuditLogAction["API_KEY_REVOKED"] = "api_key_revoked";
    AuditLogAction["WEBHOOK_CREATED"] = "webhook_created";
    AuditLogAction["WEBHOOK_UPDATED"] = "webhook_updated";
    AuditLogAction["WEBHOOK_DELETED"] = "webhook_deleted";
    AuditLogAction["MERCHANT_CREATED"] = "merchant_created";
    AuditLogAction["MERCHANT_UPDATED"] = "merchant_updated";
    AuditLogAction["MERCHANT_STATUS_CHANGED"] = "merchant_status_changed";
    AuditLogAction["MANUAL_TRANSACTION_OVERRIDE"] = "manual_transaction_override";
    AuditLogAction["SYSTEM_ERROR"] = "system_error";
    AuditLogAction["SECURITY_ALERT"] = "security_alert";
    AuditLogAction["SETTLEMENT_TRIGGERED"] = "settlement_triggered";
    AuditLogAction["SETTLEMENT_PROCESSED"] = "settlement_processed";
    AuditLogAction["TRANSACTION_STATUS_UPDATED"] = "transaction_status_updated";
    AuditLogAction["COLD_STORAGE_TRANSFER"] = "cold_storage_transfer";
    AuditLogAction["COLD_STORAGE_TRANSFER_TRIGGERED"] = "cold_storage_transfer_triggered";
})(AuditLogAction || (exports.AuditLogAction = AuditLogAction = {}));
var AuditLogEntityType;
(function (AuditLogEntityType) {
    AuditLogEntityType["USER"] = "user";
    AuditLogEntityType["MERCHANT"] = "merchant";
    AuditLogEntityType["PAYMENT_ADDRESS"] = "payment_address";
    AuditLogEntityType["TRANSACTION"] = "transaction";
    AuditLogEntityType["WEBHOOK"] = "webhook";
    AuditLogEntityType["API_KEY"] = "api_key";
    AuditLogEntityType["SYSTEM"] = "system";
})(AuditLogEntityType || (exports.AuditLogEntityType = AuditLogEntityType = {}));
let AuditLog = AuditLog_1 = class AuditLog {
    // Static method to create a new audit log entry
    static create(params) {
        const auditLog = new AuditLog_1();
        auditLog.action = params.action;
        auditLog.entityType = params.entityType;
        auditLog.entityId = params.entityId || null;
        auditLog.previousState = params.previousState || null;
        auditLog.newState = params.newState || null;
        auditLog.description = params.description || '';
        auditLog.ipAddress = params.ipAddress || null;
        auditLog.userAgent = params.userAgent || null;
        auditLog.userId = params.userId || null;
        auditLog.merchantId = params.merchantId || null;
        return auditLog;
    }
    // Helper method to sanitize sensitive data before logging
    static sanitizeData(data) {
        if (!data)
            return data;
        const sensitiveFields = ['password', 'secret', 'privateKey', 'token', 'apiKey'];
        const sanitized = { ...data };
        for (const field of sensitiveFields) {
            if (sanitized[field]) {
                sanitized[field] = '[REDACTED]';
            }
        }
        return sanitized;
    }
};
exports.AuditLog = AuditLog;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], AuditLog.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: AuditLogAction
    }),
    __metadata("design:type", String)
], AuditLog.prototype, "action", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: 'enum',
        enum: AuditLogEntityType
    }),
    __metadata("design:type", String)
], AuditLog.prototype, "entityType", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Object)
], AuditLog.prototype, "entityId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "previousState", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "newState", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], AuditLog.prototype, "description", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "ipAddress", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "userAgent", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => User_1.User, user => user.auditLogs, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", User_1.User)
], AuditLog.prototype, "user", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Object)
], AuditLog.prototype, "merchantId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Date)
], AuditLog.prototype, "createdAt", void 0);
exports.AuditLog = AuditLog = AuditLog_1 = __decorate([
    (0, typeorm_1.Entity)('audit_logs')
], AuditLog);
//# sourceMappingURL=AuditLog.js.map