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
var IdempotencyKey_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyKey = void 0;
const typeorm_1 = require("typeorm");
let IdempotencyKey = IdempotencyKey_1 = class IdempotencyKey {
    // Check if key is expired
    isExpired() {
        if (!this.expiresAt)
            return false;
        return new Date() > this.expiresAt;
    }
    // These methods should be used in a service with TypeORM repository
    // Example usage:
    // const repository = connection.getRepository(IdempotencyKey);
    // const key = await repository.findOne({ where: { key: 'some-key' } });
    // Helper method to create a new key instance
    static createInstance(key, method, path, expiresAt) {
        const idempotencyKey = new IdempotencyKey_1();
        idempotencyKey.key = key;
        idempotencyKey.method = method;
        idempotencyKey.path = path;
        idempotencyKey.expiresAt = expiresAt;
        return idempotencyKey;
    }
    // Helper method to prepare update data for a response
    static getResponseUpdateData(statusCode, response) {
        return {
            statusCode,
            response,
            completedAt: new Date()
        };
    }
    // Helper method to get query for expired keys
    static getExpiredKeysQuery() {
        const now = new Date();
        return {
            where: {
                expiresAt: {
                    lessThan: now
                }
            }
        };
    }
};
exports.IdempotencyKey = IdempotencyKey;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], IdempotencyKey.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    (0, typeorm_1.Index)({ unique: true }),
    __metadata("design:type", String)
], IdempotencyKey.prototype, "key", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], IdempotencyKey.prototype, "merchantId", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], IdempotencyKey.prototype, "method", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], IdempotencyKey.prototype, "path", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], IdempotencyKey.prototype, "requestData", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", String)
], IdempotencyKey.prototype, "response", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true, default: 200 }),
    __metadata("design:type", Number)
], IdempotencyKey.prototype, "statusCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Date)
], IdempotencyKey.prototype, "completedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Date)
], IdempotencyKey.prototype, "expiresAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], IdempotencyKey.prototype, "createdAt", void 0);
exports.IdempotencyKey = IdempotencyKey = IdempotencyKey_1 = __decorate([
    (0, typeorm_1.Entity)('idempotency_keys')
], IdempotencyKey);
//# sourceMappingURL=IdempotencyKey.js.map