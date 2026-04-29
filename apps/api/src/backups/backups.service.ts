import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { DocumentData, DocumentReference, Firestore, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { extname, isAbsolute, join } from 'path';

type BackupSource = 'cron' | 'manual';
type BackupOperationKind = 'BACKUP' | 'RESTORE';
type BackupOperationStatus = 'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED';

type FirestoreBackupDoc = {
    id: string;
    source: BackupSource;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED';
    createdAt: Timestamp;
    completedAt?: Timestamp;
    failedAt?: Timestamp;
    expiresAt: Timestamp;
    tableCount?: number;
    rowCount?: number;
    imageCount?: number;
    imageBytes?: number;
    errorMessage?: string;
};

type TableBackup = {
    table: string;
    rows: Record<string, unknown>[];
};

type ImageBackup = {
    filename: string;
    mimeType: string;
    base64: string;
    byteLength: number;
};

type BackupOperationProgress = {
    kind: BackupOperationKind | null;
    status: BackupOperationStatus;
    progress: number;
    stage: string;
    backupId: string | null;
    startedAt: string | null;
    updatedAt: string | null;
    finishedAt: string | null;
    errorMessage: string | null;
};

@Injectable()
export class BackupsService {
    private readonly logger = new Logger(BackupsService.name);
    private readonly firestoreAppName = 'cantina-backups';
    private readonly backupsCollection = process.env.FIRESTORE_BACKUPS_COLLECTION ?? 'cantina_backups';
    private readonly chunkSize = 700_000;
    private readonly retentionDays = 7;
    private firestore: Firestore | undefined;
    private operation: BackupOperationProgress = {
        kind: null,
        status: 'IDLE',
        progress: 0,
        stage: 'Sem operação em andamento',
        backupId: null,
        startedAt: null,
        updatedAt: null,
        finishedAt: null,
        errorMessage: null,
    };

    constructor(private readonly prisma: PrismaService) { }

    async createBackup(source: BackupSource = 'manual') {
        const firestore = this.getFirestore();
        const backupId = this.buildBackupId(new Date());
        this.startOperation('BACKUP', backupId);
        this.updateOperation(5, 'Inicializando backup');
        const backupRef = firestore.collection(this.backupsCollection).doc(backupId);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.retentionDays * 24 * 60 * 60 * 1000);

        await backupRef.set({
            id: backupId,
            source,
            status: 'RUNNING',
            createdAt: Timestamp.fromDate(now),
            expiresAt: Timestamp.fromDate(expiresAt),
        } satisfies FirestoreBackupDoc);

        try {
            this.updateOperation(15, 'Lendo tabelas do banco');
            const tables = await this.readDatabaseTables();
            this.updateOperation(28, 'Lendo imagens para backup');
            const images = this.readUploadsAsBase64();

            await this.persistTableBackups(backupRef, tables, (done, total) => {
                const ratio = total === 0 ? 1 : done / total;
                const progress = 30 + Math.round(ratio * 30);
                this.updateOperation(progress, `Persistindo tabelas (${done}/${total})`);
            });

            await this.persistImageBackups(backupRef, images, (done, total) => {
                const ratio = total === 0 ? 1 : done / total;
                const progress = 60 + Math.round(ratio * 30);
                this.updateOperation(progress, `Persistindo imagens (${done}/${total})`);
            });

            const rowCount = tables.reduce((acc, item) => acc + item.rows.length, 0);
            const imageBytes = images.reduce((acc, image) => acc + image.byteLength, 0);

            this.updateOperation(92, 'Finalizando backup');
            await backupRef.set({
                status: 'COMPLETED',
                completedAt: Timestamp.now(),
                tableCount: tables.length,
                rowCount,
                imageCount: images.length,
                imageBytes,
            } satisfies Partial<FirestoreBackupDoc>, { merge: true });

            this.updateOperation(96, 'Aplicando retenção de 7 dias');
            await this.pruneExpiredBackups(firestore);
            this.completeOperation('Backup concluído');

            return {
                id: backupId,
                source,
                tableCount: tables.length,
                rowCount,
                imageCount: images.length,
                imageBytes,
                createdAt: now.toISOString(),
                expiresAt: expiresAt.toISOString(),
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await backupRef.set({
                status: 'FAILED',
                failedAt: Timestamp.now(),
                errorMessage: message,
            } satisfies Partial<FirestoreBackupDoc>, { merge: true });
            this.failOperation(message);
            throw new InternalServerErrorException(`Falha ao criar backup no Firestore: ${message}`);
        }
    }

    async listBackups(limit = 20) {
        const firestore = this.getFirestore();
        const snapshot = await firestore
            .collection(this.backupsCollection)
            .orderBy('createdAt', 'desc')
            .limit(Math.max(1, Math.min(limit, 100)))
            .get();

        return snapshot.docs.map((doc) => {
            const data = doc.data() as FirestoreBackupDoc;
            return {
                id: doc.id,
                source: data.source,
                status: data.status,
                createdAt: data.createdAt?.toDate().toISOString() ?? null,
                completedAt: data.completedAt?.toDate().toISOString() ?? null,
                failedAt: data.failedAt?.toDate().toISOString() ?? null,
                expiresAt: data.expiresAt?.toDate().toISOString() ?? null,
                tableCount: data.tableCount ?? 0,
                rowCount: data.rowCount ?? 0,
                imageCount: data.imageCount ?? 0,
                imageBytes: data.imageBytes ?? 0,
                errorMessage: data.errorMessage ?? null,
            };
        });
    }

    async restoreBackup(backupId: string) {
        if (!backupId?.trim()) {
            throw new BadRequestException('ID do backup é obrigatório.');
        }

        const firestore = this.getFirestore();
        this.startOperation('RESTORE', backupId);
        this.updateOperation(6, 'Validando backup de origem');
        const backupRef = firestore.collection(this.backupsCollection).doc(backupId);
        const backupSnapshot = await backupRef.get();

        if (!backupSnapshot.exists) {
            throw new NotFoundException('Backup não encontrado.');
        }

        const backupDoc = backupSnapshot.data() as FirestoreBackupDoc;
        if (backupDoc.status !== 'COMPLETED') {
            throw new BadRequestException('Somente backups finalizados podem ser restaurados.');
        }

        try {
            const tables = await this.loadTableBackups(backupRef, (done, total) => {
                const ratio = total === 0 ? 1 : done / total;
                const progress = 10 + Math.round(ratio * 25);
                this.updateOperation(progress, `Lendo tabelas do backup (${done}/${total})`);
            });
            const images = await this.loadImageBackups(backupRef, (done, total) => {
                const ratio = total === 0 ? 1 : done / total;
                const progress = 35 + Math.round(ratio * 20);
                this.updateOperation(progress, `Lendo imagens do backup (${done}/${total})`);
            });

            this.updateOperation(60, 'Restaurando banco de dados');
            await this.restoreDatabaseTables(tables);
            this.updateOperation(86, 'Restaurando arquivos de imagem');
            this.restoreUploadFiles(images, (done, total) => {
                const ratio = total === 0 ? 1 : done / total;
                const progress = 86 + Math.round(ratio * 12);
                this.updateOperation(progress, `Regravando imagens (${done}/${total})`);
            });

            this.completeOperation('Restauração concluída');
            this.logger.log(`Backup restaurado com sucesso: ${backupId}`);
            return {
                id: backupId,
                restoredTables: tables.length,
                restoredRows: tables.reduce((acc, table) => acc + table.rows.length, 0),
                restoredImages: images.length,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.failOperation(message);
            throw error;
        }
    }

    getOperationProgress() {
        return { ...this.operation };
    }

    private getFirestore(): Firestore {
        if (this.firestore) {
            return this.firestore;
        }

        const serviceAccount = this.resolveServiceAccount();
        if (!serviceAccount) {
            throw new InternalServerErrorException(
                'Credencial do Firebase ausente. Configure FIREBASE_SERVICE_ACCOUNT_PATH ou FIREBASE_SERVICE_ACCOUNT_JSON.',
            );
        }

        const app = getApps().find((candidate) => candidate.name === this.firestoreAppName)
            ?? initializeApp(
                {
                    credential: cert(serviceAccount),
                },
                this.firestoreAppName,
            );

        this.firestore = getFirestore(app);
        return this.firestore;
    }

    private resolveServiceAccount() {
        const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (jsonEnv) {
            try {
                return JSON.parse(jsonEnv) as Record<string, string>;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new InternalServerErrorException(`FIREBASE_SERVICE_ACCOUNT_JSON inválido: ${message}`);
            }
        }

        const fileFromEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
        const defaultFileName = 'cantina-22dd3-firebase-adminsdk-fbsvc-63e1e6d12a.json';

        const candidates = [
            fileFromEnv ? (isAbsolute(fileFromEnv) ? fileFromEnv : join(process.cwd(), fileFromEnv)) : null,
            join(process.cwd(), defaultFileName),
            join(process.cwd(), 'apps', 'api', defaultFileName),
        ].filter((item): item is string => !!item);

        const foundPath = candidates.find((candidate) => existsSync(candidate));
        if (!foundPath) {
            return null;
        }

        try {
            return JSON.parse(readFileSync(foundPath, 'utf8')) as Record<string, string>;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new InternalServerErrorException(`Falha ao ler chave privada do Firebase em ${foundPath}: ${message}`);
        }
    }

    private async readDatabaseTables() {
        const tableRows = await this.prisma.$queryRawUnsafe<Array<{ name: string }>>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY name ASC`,
        );

        const result: TableBackup[] = [];

        for (const row of tableRows) {
            const table = row.name;
            const safeTable = this.escapeIdentifier(table);
            const rows = await this.prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${safeTable}"`);
            result.push({
                table,
                rows: rows.map((item) => this.normalizeRowForJson(item)),
            });
        }

        return result;
    }

    private normalizeRowForJson(row: Record<string, unknown>) {
        const normalized: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(row)) {
            if (typeof value === 'bigint') {
                normalized[key] = Number(value);
                continue;
            }
            if (value instanceof Date) {
                normalized[key] = value.toISOString();
                continue;
            }
            if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
                normalized[key] = Buffer.from(value).toString('base64');
                continue;
            }
            normalized[key] = value;
        }

        return normalized;
    }

    private async persistTableBackups(
        backupRef: DocumentReference<DocumentData>,
        tables: TableBackup[],
        onProgress?: (done: number, total: number) => void,
    ) {
        const total = tables.length;
        let done = 0;
        for (const table of tables) {
            const tableDoc = backupRef.collection('tables').doc(table.table);
            const serialized = JSON.stringify(table.rows);
            const chunks = this.splitIntoChunks(serialized);

            await tableDoc.set({
                table: table.table,
                rowCount: table.rows.length,
                chunkCount: chunks.length,
            });

            for (let index = 0; index < chunks.length; index += 1) {
                await tableDoc.collection('chunks').doc(String(index).padStart(6, '0')).set({
                    index,
                    data: chunks[index],
                });
            }
            done += 1;
            onProgress?.(done, total);
        }
    }

    private readUploadsAsBase64() {
        const uploadsDir = this.resolveUploadsDir();
        const entries = existsSync(uploadsDir) ? readdirSync(uploadsDir) : [];
        const images: ImageBackup[] = [];

        for (const entry of entries) {
            const filePath = join(uploadsDir, entry);
            if (!statSync(filePath).isFile()) continue;
            const raw = readFileSync(filePath);

            images.push({
                filename: entry,
                mimeType: this.resolveMimeType(entry),
                base64: raw.toString('base64'),
                byteLength: raw.byteLength,
            });
        }

        return images;
    }

    private async persistImageBackups(
        backupRef: DocumentReference<DocumentData>,
        images: ImageBackup[],
        onProgress?: (done: number, total: number) => void,
    ) {
        const total = images.length;
        let done = 0;
        for (const image of images) {
            const imageDoc = backupRef.collection('images').doc(image.filename);
            const chunks = this.splitIntoChunks(image.base64);

            await imageDoc.set({
                filename: image.filename,
                mimeType: image.mimeType,
                byteLength: image.byteLength,
                chunkCount: chunks.length,
            });

            for (let index = 0; index < chunks.length; index += 1) {
                await imageDoc.collection('chunks').doc(String(index).padStart(6, '0')).set({
                    index,
                    data: chunks[index],
                });
            }
            done += 1;
            onProgress?.(done, total);
        }
    }

    private async loadTableBackups(
        backupRef: DocumentReference<DocumentData>,
        onProgress?: (done: number, total: number) => void,
    ) {
        const tableDocs = await backupRef.collection('tables').get();
        const result: TableBackup[] = [];
        const total = tableDocs.docs.length;
        let done = 0;

        for (const tableDoc of tableDocs.docs) {
            const chunksSnapshot = await tableDoc.ref.collection('chunks').orderBy('index', 'asc').get();
            const payload = chunksSnapshot.docs.map((doc) => {
                const data = doc.data() as { data: string };
                return data.data;
            }).join('');

            result.push({
                table: tableDoc.id,
                rows: JSON.parse(payload) as Record<string, unknown>[],
            });
            done += 1;
            onProgress?.(done, total);
        }

        return result;
    }

    private async loadImageBackups(
        backupRef: DocumentReference<DocumentData>,
        onProgress?: (done: number, total: number) => void,
    ) {
        const imageDocs = await backupRef.collection('images').get();
        const result: ImageBackup[] = [];
        const total = imageDocs.docs.length;
        let done = 0;

        for (const imageDoc of imageDocs.docs) {
            const info = imageDoc.data() as { mimeType?: string; byteLength?: number };
            const chunksSnapshot = await imageDoc.ref.collection('chunks').orderBy('index', 'asc').get();
            const base64 = chunksSnapshot.docs.map((doc) => {
                const data = doc.data() as { data: string };
                return data.data;
            }).join('');

            result.push({
                filename: imageDoc.id,
                mimeType: info.mimeType ?? this.resolveMimeType(imageDoc.id),
                base64,
                byteLength: info.byteLength ?? Buffer.byteLength(base64, 'base64'),
            });
            done += 1;
            onProgress?.(done, total);
        }

        return result;
    }

    private async restoreDatabaseTables(tables: TableBackup[]) {
        const snapshotByTable = new Map(tables.map((item) => [item.table, item.rows]));

        await this.prisma.$transaction(async (tx) => {
            // Em SQLite, PRAGMA foreign_keys não pode ser alternado dentro de transação.
            // Usamos defer_foreign_keys para validar FKs apenas no commit.
            await tx.$executeRawUnsafe('PRAGMA defer_foreign_keys = ON');

            const existingTables = await tx.$queryRawUnsafe<Array<{ name: string }>>(
                `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY name ASC`,
            );

            for (const { name } of existingTables) {
                await tx.$executeRawUnsafe(`DELETE FROM "${this.escapeIdentifier(name)}"`);
            }

            for (const { name } of existingTables) {
                const rows = snapshotByTable.get(name) ?? [];
                for (const row of rows) {
                    const columns = Object.keys(row);
                    if (columns.length === 0) continue;

                    const sql = `INSERT INTO "${this.escapeIdentifier(name)}" (${columns
                        .map((column) => `"${this.escapeIdentifier(column)}"`)
                        .join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;

                    const values = columns.map((column) => row[column]);
                    await tx.$executeRawUnsafe(sql, ...values);
                }
            }

        });
    }

    private restoreUploadFiles(images: ImageBackup[], onProgress?: (done: number, total: number) => void) {
        const uploadsDir = this.resolveUploadsDir();
        if (!existsSync(uploadsDir)) {
            mkdirSync(uploadsDir, { recursive: true });
        }

        for (const entry of readdirSync(uploadsDir)) {
            rmSync(join(uploadsDir, entry), { recursive: true, force: true });
        }

        const total = images.length;
        let done = 0;
        for (const image of images) {
            const filePath = join(uploadsDir, image.filename);
            const bytes = Buffer.from(image.base64, 'base64');
            writeFileSync(filePath, bytes);
            done += 1;
            onProgress?.(done, total);
        }
    }

    private resolveUploadsDir() {
        const candidates = [
            join(process.cwd(), 'uploads'),
            join(process.cwd(), 'apps', 'api', 'uploads'),
            join(__dirname, '..', '..', 'uploads'),
            join(__dirname, '..', '..', '..', 'uploads'),
        ];

        const existingWithFiles = candidates.find((candidate) => {
            if (!existsSync(candidate)) return false;
            try {
                return readdirSync(candidate).length > 0;
            } catch {
                return false;
            }
        });

        if (existingWithFiles) return existingWithFiles;

        const firstExisting = candidates.find((candidate) => existsSync(candidate));
        if (firstExisting) return firstExisting;

        return candidates[0];
    }

    private resolveMimeType(filename: string) {
        const extension = extname(filename).toLowerCase();
        if (extension === '.png') return 'image/png';
        if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
        if (extension === '.webp') return 'image/webp';
        if (extension === '.gif') return 'image/gif';
        return 'application/octet-stream';
    }

    private splitIntoChunks(value: string) {
        const chunks: string[] = [];
        let cursor = 0;

        while (cursor < value.length) {
            chunks.push(value.slice(cursor, cursor + this.chunkSize));
            cursor += this.chunkSize;
        }

        if (chunks.length === 0) {
            chunks.push('');
        }

        return chunks;
    }

    private async pruneExpiredBackups(firestore: Firestore) {
        const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
        const snapshot = await firestore
            .collection(this.backupsCollection)
            .where('createdAt', '<', Timestamp.fromDate(cutoff))
            .get();

        for (const doc of snapshot.docs) {
            await this.deleteDocumentTree(doc.ref);
        }
    }

    private async deleteDocumentTree(
        docRef: DocumentReference<DocumentData>,
    ) {
        const subCollections = await docRef.listCollections();
        for (const collection of subCollections) {
            const docs = await collection.get();
            for (const doc of docs.docs) {
                await this.deleteDocumentTree(doc.ref);
            }
        }
        await docRef.delete();
    }

    private escapeIdentifier(identifier: string) {
        return identifier.replace(/"/g, '""');
    }

    private buildBackupId(date: Date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        const ss = String(date.getSeconds()).padStart(2, '0');
        return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
    }

    private startOperation(kind: BackupOperationKind, backupId: string) {
        if (this.operation.status === 'RUNNING') {
            throw new BadRequestException('Já existe uma operação de backup/restauração em andamento.');
        }
        const now = new Date().toISOString();
        this.operation = {
            kind,
            status: 'RUNNING',
            progress: 0,
            stage: kind === 'BACKUP' ? 'Iniciando backup' : 'Iniciando restauração',
            backupId,
            startedAt: now,
            updatedAt: now,
            finishedAt: null,
            errorMessage: null,
        };
    }

    private updateOperation(progress: number, stage: string) {
        if (this.operation.status !== 'RUNNING') return;
        this.operation.progress = Math.max(0, Math.min(100, progress));
        this.operation.stage = stage;
        this.operation.updatedAt = new Date().toISOString();
    }

    private completeOperation(stage: string) {
        const now = new Date().toISOString();
        this.operation = {
            ...this.operation,
            status: 'COMPLETED',
            progress: 100,
            stage,
            updatedAt: now,
            finishedAt: now,
            errorMessage: null,
        };
    }

    private failOperation(message: string) {
        const now = new Date().toISOString();
        this.operation = {
            ...this.operation,
            status: 'FAILED',
            stage: 'Operação falhou',
            updatedAt: now,
            finishedAt: now,
            errorMessage: message,
        };
    }
}
