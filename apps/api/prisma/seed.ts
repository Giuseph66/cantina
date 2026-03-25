import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

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
            isActive: true,
            stockMode: 'CONTROLLED',
            stockQty: 50,
        },
        {
            name: 'Misto Quente',
            description: 'Pão de forma, presunto e queijo grelhados',
            priceCents: 790,
            categoryId: catLanches.id,
            isActive: true,
            stockMode: 'CONTROLLED',
            stockQty: 30,
        },
        {
            name: 'Risole de Carne',
            description: 'Massa crocante com recheio cremoso de carne temperada',
            priceCents: 700,
            categoryId: catSalgados.id,
            isActive: true,
            stockMode: 'CONTROLLED',
            stockQty: 25,
        },
        {
            name: 'Risole de Frango',
            description: 'Massa crocante com recheio de frango desfiado e temperado',
            priceCents: 700,
            categoryId: catSalgados.id,
            isActive: true,
            stockMode: 'CONTROLLED',
            stockQty: 25,
        },
        {
            name: 'Risole Presunto e Queijo',
            description: 'Massa crocante com recheio clássico de presunto e queijo',
            priceCents: 750,
            categoryId: catSalgados.id,
            isActive: true,
            stockMode: 'CONTROLLED',
            stockQty: 20,
        },
        {
            name: 'Assado',
            description: 'Salgado assado recheado, ideal para o intervalo',
            priceCents: 850,
            categoryId: catSalgados.id,
            isActive: true,
            stockMode: 'CONTROLLED',
            stockQty: 18,
        },
        {
            name: 'Torta de Frango',
            description: 'Fatia de torta salgada com recheio cremoso de frango',
            priceCents: 950,
            categoryId: catSalgados.id,
            isActive: true,
            stockMode: 'CONTROLLED',
            stockQty: 16,
        },
        {
            name: 'Suco de Laranja',
            description: 'Suco natural de laranja 300ml',
            priceCents: 590,
            categoryId: catBebidas.id,
            isActive: true,
            stockMode: 'UNLIMITED',
            stockQty: 0,
        },
        {
            name: 'Coca-Cola Lata',
            description: 'Coca-Cola bem gelada — lata 350ml',
            priceCents: 600,
            categoryId: catBebidas.id,
            isActive: true,
            stockMode: 'CONTROLLED',
            stockQty: 100,
        },
        {
            name: 'Café com Leite',
            description: 'Café coado com leite integral 200ml',
            priceCents: 350,
            categoryId: catBebidas.id,
            isActive: true,
            stockMode: 'UNLIMITED',
            stockQty: 0,
        },
    ];

    await prisma.creditNote.deleteMany();
    await prisma.ticket.deleteMany();
    await prisma.cashMovement.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.product.createMany({ data: products });

    console.log(`✅ ${products.length} produtos criados`);
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
