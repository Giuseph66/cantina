import {
    Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { OrderStatus } from '../common/enums';
import { AdminService } from './admin.service';
import {
    CreateCategoryDto, UpdateCategoryDto,
    CreateProductDto, UpdateProductDto,
    UpdateSettingsDto, UpdateOrderStatusDto,
} from './dto/admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '@prisma/client';
import { Role } from '../common/enums';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    // Categories
    @Post('categories')
    createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() user: User) {
        return this.adminService.createCategory(dto, user.id);
    }

    @Get('categories')
    getCategories() {
        return this.adminService.getCategories();
    }

    @Put('categories/:id')
    updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto, @CurrentUser() user: User) {
        return this.adminService.updateCategory(id, dto, user.id);
    }

    @Delete('categories/:id')
    deleteCategory(@Param('id') id: string, @CurrentUser() user: User) {
        return this.adminService.deleteCategory(id, user.id);
    }

    // Products
    @Post('products')
    createProduct(@Body() dto: CreateProductDto, @CurrentUser() user: User) {
        return this.adminService.createProduct(dto, user.id);
    }

    @Get('products')
    getProducts() {
        return this.adminService.getProducts();
    }

    @Put('products/:id')
    updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: User) {
        return this.adminService.updateProduct(id, dto, user.id);
    }

    @Delete('products/:id')
    deleteProduct(@Param('id') id: string, @CurrentUser() user: User) {
        return this.adminService.deleteProduct(id, user.id);
    }

    // Orders
    @Get('orders')
    getOrders(
        @Query('status') status?: OrderStatus,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
    ) {
        return this.adminService.getOrders(status, dateFrom, dateTo);
    }

    @Patch('orders/:id/status')
    updateOrderStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto, @CurrentUser() user: User) {
        return this.adminService.updateOrderStatus(id, dto, user.id);
    }

    // Settings — GET também acessível ao CASHIER para ler allowReconfirmPickup
    @Get('settings')
    @Roles(Role.ADMIN, Role.CASHIER)
    getSettings() {
        return this.adminService.getSettings();
    }

    @Patch('settings')
    updateSettings(@Body() dto: UpdateSettingsDto, @CurrentUser() user: User) {
        return this.adminService.updateSettings(dto, user.id);
    }

    // Audit logs
    @Get('audit')
    getAuditLogs(
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
        @Query('action') action?: string,
    ) {
        return this.adminService.getAuditLogs(
            limit ? parseInt(limit, 10) : 100,
            offset ? parseInt(offset, 10) : 0,
            action || undefined,
        );
    }
}
