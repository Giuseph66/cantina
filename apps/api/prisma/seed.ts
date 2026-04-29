import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const uploadsDir = join(__dirname, '..', 'uploads');

function hasExistingUpload(fileUrl?: string | null) {
    if (!fileUrl) return false;

    const match = fileUrl.match(/\/uploads\/([^/?#]+)/);
    if (!match?.[1]) return false;

    const filename = decodeURIComponent(match[1]);
    return existsSync(join(uploadsDir, filename));
}

async function main() {
    console.log('🌱 Starting seed...');

    // ─── Admin padrão ──────────────────────────────────────────────────────────
    const adminPassword = await bcrypt.hash('admin123', 12);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@cantina.local' },
        update: {},
        create: {
            name: 'Administrador',
            email: 'admin@cantina.local',
            passwordHash: adminPassword,
            role: 'ADMIN',
            isActive: true,
        },
    });
    console.log(`✅ Admin criado: ${admin.email}`);

    // ─── Caixa padrão ──────────────────────────────────────────────────────────
    const cashierPassword = await bcrypt.hash('caixa123', 12);
    const cashier = await prisma.user.upsert({
        where: { email: 'caixa@cantina.local' },
        update: {},
        create: {
            name: 'Caixa Principal',
            email: 'caixa@cantina.local',
            passwordHash: cashierPassword,
            role: 'CASHIER',
            isActive: true,
        },
    });
    console.log(`✅ Caixa criado: ${cashier.email}`);

    // ─── Categorias ────────────────────────────────────────────────────────────
    const catLanches = await prisma.category.upsert({
        where: { name: 'Lanches' },
        update: { sortOrder: 1, isActive: true },
        create: { name: 'Lanches', sortOrder: 1, isActive: true },
    });

    const catSalgados = await prisma.category.upsert({
        where: { name: 'Salgados' },
        update: { sortOrder: 2, isActive: true },
        create: { name: 'Salgados', sortOrder: 2, isActive: true },
    });

    const catBebidas = await prisma.category.upsert({
        where: { name: 'Bebidas' },
        update: { sortOrder: 3, isActive: true },
        create: { name: 'Bebidas', sortOrder: 3, isActive: true },
    });

    await prisma.category.updateMany({
        where: { name: 'Refeições' },
        data: { isActive: false, sortOrder: 99 },
    });

    console.log(`✅ Categorias ativas: Lanches, Salgados, Bebidas`);

    // ─── Produtos ──────────────────────────────────────────────────────────────
    const products: Prisma.ProductCreateManyInput[] = [
        {
            name: 'X-Burguer',
            description: 'Pão, hambúrguer 150g, queijo, alface e tomate',
            priceCents: 1290,
            categoryId: catLanches.id,
            imageUrl: '/uploads/53d689b9-70b3-4fa1-bdc2-6c384630a5e1.png',
            isActive: true,
            isSpecialToday: false,
            stockMode: 'CONTROLLED',
            stockQty: 50,
        },
        {
            name: 'Misto Quente',
            description: 'Pão de forma, presunto e queijo grelhados',
            priceCents: 790,
            categoryId: catLanches.id,
            imageUrl: '/uploads/3183ea50-46a7-4d48-94f2-757d2adf2727.png',
            isActive: true,
            isSpecialToday: true,
            stockMode: 'CONTROLLED',
            stockQty: 30,
        },
        {
            name: 'Risole de Carne',
            description: 'Massa crocante com recheio cremoso de carne temperada',
            priceCents: 700,
            categoryId: catSalgados.id,
            imageUrl: '/uploads/e6111ff6-c84a-4087-98f2-ee1dbc4c7f5c.png',
            isActive: true,
            isSpecialToday: false,
            stockMode: 'CONTROLLED',
            stockQty: 25,
        },
        {
            name: 'Risole de Frango',
            description: 'Massa crocante com recheio de frango desfiado e temperado',
            priceCents: 700,
            categoryId: catSalgados.id,
            imageUrl: '/uploads/e6111ff6-c84a-4087-98f2-ee1dbc4c7f5c.png',
            isActive: true,
            isSpecialToday: false,
            stockMode: 'CONTROLLED',
            stockQty: 25,
        },
        {
            name: 'Risole Presunto e Queijo',
            description: 'Massa crocante com recheio clássico de presunto e queijo',
            priceCents: 750,
            categoryId: catSalgados.id,
            imageUrl: '/uploads/d1a1c6b7-ce82-42e5-bec6-1176705913a6.png',
            isActive: true,
            isSpecialToday: false,
            stockMode: 'CONTROLLED',
            stockQty: 20,
        },
        {
            name: 'Assado',
            description: 'Salgado assado recheado, ideal para o intervalo',
            priceCents: 850,
            categoryId: catSalgados.id,
            imageUrl: '/uploads/0af9024d-5851-42cd-8785-4f7be7691b09.png',
            isActive: true,
            isSpecialToday: true,
            stockMode: 'CONTROLLED',
            stockQty: 18,
        },
        {
            name: 'Torta de Frango',
            description: 'Fatia de torta salgada com recheio cremoso de frango',
            priceCents: 950,
            categoryId: catSalgados.id,
            imageUrl: '/uploads/9860dffe-4383-4cb3-811c-be2c5e744c22.png',
            isActive: true,
            isSpecialToday: false,
            stockMode: 'CONTROLLED',
            stockQty: 16,
        },
        {
            name: 'Suco de Laranja',
            description: 'Suco natural de laranja 300ml',
            priceCents: 590,
            categoryId: catBebidas.id,
            imageUrl: '/uploads/28b35f02-c7e4-46fc-89d0-c7d632a9b1d1.png',
            isActive: true,
            isSpecialToday: false,
            stockMode: 'UNLIMITED',
            stockQty: 0,
        },
        {
            name: 'Coca-Cola Lata',
            description: 'Coca-Cola bem gelada — lata 350ml',
            priceCents: 600,
            categoryId: catBebidas.id,
            imageUrl: '/uploads/c4d972d5-8be9-4a03-a0ee-24ad2f2e2b81.png',
            isActive: true,
            isSpecialToday: true,
            stockMode: 'CONTROLLED',
            stockQty: 100,
        },
        {
            name: 'Café com Leite',
            description: 'Café coado com leite integral 200ml',
            priceCents: 350,
            categoryId: catBebidas.id,
            imageUrl: '/uploads/4d2614f8-a0a2-47a7-ad4e-a067514aef06.png',
            isActive: true,
            isSpecialToday: true,
            stockMode: 'UNLIMITED',
            stockQty: 0,
        },
    ];

    await prisma.creditNote.deleteMany();
    await prisma.ticket.deleteMany();
    await prisma.cashMovement.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();

    let createdProducts = 0;
    let updatedProducts = 0;

    for (const product of products) {
        const existing = await prisma.product.findFirst({
            where: { name: product.name },
        });

        if (!existing) {
            await prisma.product.create({ data: product });
            createdProducts += 1;
            continue;
        }

        const shouldUpdateImage = !!product.imageUrl && !hasExistingUpload(existing.imageUrl);

        // Preserve existing imageUrl when the file still exists.
        await prisma.product.update({
            where: { id: existing.id },
            data: {
                description: product.description,
                priceCents: product.priceCents,
                categoryId: product.categoryId,
                ...(shouldUpdateImage ? { imageUrl: product.imageUrl } : {}),
                isActive: product.isActive,
                isSpecialToday: product.isSpecialToday,
                stockMode: product.stockMode,
                stockQty: product.stockQty,
            },
        });
        updatedProducts += 1;
    }

    console.log(`✅ Produtos criados: ${createdProducts} | atualizados: ${updatedProducts}`);
    console.log('\n🎉 Seed concluído!');
    console.log('\nCredenciais de acesso:');
    console.log('  Admin   → admin@cantina.local  / admin123');
    console.log('  Caixa   → caixa@cantina.local  / caixa123');
}

main()
    .catch((e) => {
        console.error('❌ Seed falhou:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
