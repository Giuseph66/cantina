import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import {
    CreateCategoryDto,
    UpdateCategoryDto,
    CreateProductDto,
    UpdateProductDto,
    UpdateSettingsDto,
    UpdateOrderStatusDto,
} from './dto/admin.dto';
import { OrderStatus } from '../common/enums';
import { UploadsService } from '../uploads/uploads.service';
import { AppSettings, AppSettingsService } from '../common/services/app-settings.service';

@Injectable()
export class AdminService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly audit: AuditService,
        private readonly uploadsService: UploadsService,
        private readonly appSettings: AppSettingsService,
    ) { }

    // ─── Categories ────────────────────────────────────────────────────────────
    async createCategory(dto: CreateCategoryDto, actorId: string) {
        const cat = await this.prisma.category.create({ data: dto });
        await this.audit.log(actorId, 'CATEGORY_CREATED', 'Category', cat.id, { name: cat.name });
        return cat;
    }

    async updateCategory(id: string, dto: UpdateCategoryDto, actorId: string) {
        const cat = await this.prisma.category.update({ where: { id }, data: dto });
        await this.audit.log(actorId, 'CATEGORY_UPDATED', 'Category', id, dto as Record<string, unknown>);
        return cat;
    }

    async deleteCategory(id: string, actorId: string) {
        const cat = await this.prisma.category.delete({ where: { id } });
        await this.audit.log(actorId, 'CATEGORY_DELETED', 'Category', id, { name: cat.name });
        return cat;
    }

    async getCategories() {
        return this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
    }

    // ─── Products ──────────────────────────────────────────────────────────────
    async createProduct(dto: CreateProductDto, actorId: string) {
        const data = this.normalizeProductDto(dto);
        const product = await this.prisma.product.create({ data });
        await this.audit.log(actorId, 'PRODUCT_CREATED', 'Product', product.id, {
            name: product.name,
            priceCents: product.priceCents,
        });
        return product;
    }

    async updateProduct(id: string, dto: UpdateProductDto, actorId: string) {
        const data = this.normalizeProductDto(dto);
        const currentProduct = await this.prisma.product.findUnique({
            where: { id },
            select: { imageUrl: true },
        });

        const product = await this.prisma.product.update({ where: { id }, data });

        if (data.imageUrl && currentProduct?.imageUrl && currentProduct.imageUrl !== data.imageUrl) {
            this.uploadsService.deleteFileByUrl(currentProduct.imageUrl);
        }

        await this.audit.log(actorId, 'PRODUCT_UPDATED', 'Product', id, data as Record<string, unknown>);
        return product;
    }

    async deleteProduct(id: string, actorId: string) {
        const product = await this.prisma.product.update({
            where: { id },
            data: { isActive: false },
        });
        await this.audit.log(actorId, 'PRODUCT_DEACTIVATED', 'Product', id, { name: product.name });
        return product;
    }

    async getProducts() {
        const products = await this.prisma.product.findMany({
            include: { category: true },
            orderBy: { name: 'asc' },
        });

        return products.map(product => ({
            ...product,
            imageUrl: this.uploadsService.normalizePublicUrl(product.imageUrl),
        }));
    }

    // ─── Orders ────────────────────────────────────────────────────────────────
    async getOrders(status?: OrderStatus, dateFrom?: string, dateTo?: string) {
        const where = {
            ...(status ? { status } : {}),
            ...this.buildOrdersDateFilter(dateFrom, dateTo),
        };

        return this.prisma.order.findMany({
            where,
            include: {
                user: { select: { id: true, name: true, email: true } },
                items: {
                    select: {
                        id: true,
                        productId: true,
                        productName: true,
                        qty: true,
                        unitPriceCents: true,
                        subtotalCents: true,
                        product: { select: { id: true, name: true, imageUrl: true } },
                    },
                },
                ticket: { select: { id: true, codeShort: true, consumedAt: true, expiresAt: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 200,
        });
    }

    async updateOrderStatus(id: string, dto: UpdateOrderStatusDto, actorId: string) {
        const order = await this.prisma.order.update({
            where: { id },
            data: { status: dto.status },
        });
        await this.audit.log(actorId, 'ORDER_STATUS_UPDATED', 'Order', id, { status: dto.status });
        return order;
    }

    // ─── Audit ─────────────────────────────────────────────────────────────────
    async getAuditLogs(limit = 100, offset = 0, action?: string) {
        const where = action ? { action } : {};
        const [logs, total] = await Promise.all([
            this.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
                include: {
                    actor: { select: { id: true, name: true, role: true } },
                },
            }),
            this.prisma.auditLog.count({ where }),
        ]);
        return {
            logs: logs.map(log => ({
                ...log,
                payloadJson: log.payloadJson ? JSON.parse(log.payloadJson as string) : {},
            })),
            total,
        };
    }

    // ─── Settings ──────────────────────────────────────────────────────────────
    getSettings(): AppSettings {
        return this.appSettings.getSettings();
    }

    updateSettings(dto: UpdateSettingsDto, actorId: string) {
        const updated = this.appSettings.updateSettings(dto);
        void this.audit.log(actorId, 'SETTINGS_UPDATED', 'Settings', null, dto as Record<string, unknown>);
        return updated;
    }

    private normalizeProductDto<T extends CreateProductDto | UpdateProductDto>(dto: T): T {
        return {
            ...dto,
            imageUrl: this.uploadsService.normalizePublicUrl(dto.imageUrl) ?? undefined,
        };
    }

    private buildOrdersDateFilter(dateFrom?: string, dateTo?: string) {
        const from = this.parseDateBoundary(dateFrom, 'start');
        const to = this.parseDateBoundary(dateTo, 'end');

        if (!from && !to) {
            return {};
        }

        return {
            createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
            },
        };
    }

    private parseDateBoundary(value: string | undefined, mode: 'start' | 'end') {
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return null;
        }

        const [yearStr, monthStr, dayStr] = value.split('-');
        const year = Number.parseInt(yearStr, 10);
        const month = Number.parseInt(monthStr, 10);
        const day = Number.parseInt(dayStr, 10);

        if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
            return null;
        }

        return mode === 'start'
            ? new Date(year, month - 1, day, 0, 0, 0, 0)
            : new Date(year, month - 1, day, 23, 59, 59, 999);
    }
}
