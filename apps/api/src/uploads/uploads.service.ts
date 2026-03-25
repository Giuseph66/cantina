import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { basename, extname, join, normalize } from 'path';

const MIME_EXTENSION_MAP: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
};

@Injectable()
export class UploadsService {
    private readonly uploadsDir = join(process.cwd(), 'uploads');

    ensureUploadsDir() {
        if (!existsSync(this.uploadsDir)) {
            mkdirSync(this.uploadsDir, { recursive: true });
        }
    }

    getUploadsDir() {
        this.ensureUploadsDir();
        return this.uploadsDir;
    }

    getFileExtension(originalName: string, mimeType: string) {
        const originalExtension = extname(originalName).toLowerCase();
        return originalExtension || MIME_EXTENSION_MAP[mimeType] || '.bin';
    }

    buildPublicUrl(filename: string) {
        const encoded = encodeURIComponent(filename);

        if (process.env.APP_PUBLIC_URL) {
            const baseUrl = process.env.APP_PUBLIC_URL.replace(/\/$/, '');
            try {
                const hostname = new URL(baseUrl).hostname;
                if (!this.isLocalHostname(hostname)) {
                    return `${baseUrl}/uploads/${encoded}`;
                }
            } catch {
                // Invalid APP_PUBLIC_URL falls back to a relative path.
            }
        }

        // No APP_PUBLIC_URL → return a relative path so the Vite dev proxy
        // (and mobile browsers on the same network) can reach the file via the
        // frontend origin, avoiding hard-coded localhost references.
        return `/uploads/${encoded}`;
    }

    normalizePublicUrl(fileUrl?: string | null) {
        if (!fileUrl) return fileUrl;

        const filename = this.extractFilename(fileUrl);
        if (!filename) return fileUrl;

        return `/uploads/${encodeURIComponent(filename)}`;
    }

    deleteFileByUrl(fileUrl?: string | null) {
        if (!fileUrl) return;

        const filename = this.extractFilename(fileUrl);
        if (!filename) return;

        const filePath = normalize(join(this.getUploadsDir(), filename));
        if (!filePath.startsWith(this.getUploadsDir())) return;

        if (existsSync(filePath)) {
            unlinkSync(filePath);
        }
    }

    private extractFilename(fileUrl: string) {
        try {
            const parsedUrl = fileUrl.startsWith('http')
                ? new URL(fileUrl)
                : new URL(fileUrl, 'http://localhost');
            const pathname = parsedUrl.pathname;

            if (!pathname.startsWith('/uploads/')) return null;

            return basename(decodeURIComponent(pathname));
        } catch {
            return null;
        }
    }

    private isLocalHostname(hostname: string) {
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    }
}
