import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export type TicketValidityMode = 'DURATION' | 'UNTIL_TIME';

export interface AppSettings {
    ticketWindowMinutes: number;
    ticketValidityMode: TicketValidityMode;
    ticketValidUntilTime: string | null;
    bannerMessage: string;
    openTime: string;
    closeTime: string;
    allowReconfirmPickup: boolean;
    allowOnPickupPayment: boolean;
    pixKey: string;
    allowCredit: boolean;
    notificationEmails: string;
}

const DEFAULT_SETTINGS: AppSettings = {
    ticketWindowMinutes: 30,
    ticketValidityMode: 'DURATION',
    ticketValidUntilTime: null,
    bannerMessage: '',
    openTime: '07:00',
    closeTime: '17:00',
    allowReconfirmPickup: true,
    allowOnPickupPayment: true,
    pixKey: '',
    allowCredit: true,
    notificationEmails: '',
};

@Injectable()
export class AppSettingsService {
    private readonly settingsFileCandidates = [
        path.join(process.cwd(), 'cantina-settings.json'),
        path.join(process.cwd(), 'prisma', 'cantina-settings.json'),
        path.join(process.cwd(), 'apps', 'api', 'cantina-settings.json'),
        path.join(process.cwd(), 'apps', 'api', 'prisma', 'cantina-settings.json'),
    ];

    private resolveSettingsFile(): string {
        const existingFile = this.settingsFileCandidates.find((filePath) => fs.existsSync(filePath));
        return existingFile ?? this.settingsFileCandidates[0];
    }

    private normalizeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
        const ticketWindowMinutes = Number(raw?.ticketWindowMinutes);
        const ticketValidityMode = raw?.ticketValidityMode === 'UNTIL_TIME' ? 'UNTIL_TIME' : 'DURATION';
        const ticketValidUntilTime = typeof raw?.ticketValidUntilTime === 'string' && /^\d{2}:\d{2}$/.test(raw.ticketValidUntilTime)
            ? raw.ticketValidUntilTime
            : null;

        return {
            ...DEFAULT_SETTINGS,
            ...raw,
            ticketWindowMinutes: Number.isFinite(ticketWindowMinutes) && ticketWindowMinutes >= 1 && ticketWindowMinutes <= 1440
                ? ticketWindowMinutes
                : DEFAULT_SETTINGS.ticketWindowMinutes,
            ticketValidityMode,
            ticketValidUntilTime,
        };
    }

    getSettings(): AppSettings {
        const settingsFile = this.resolveSettingsFile();
        if (!fs.existsSync(settingsFile)) {
            return DEFAULT_SETTINGS;
        }

        const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as Partial<AppSettings>;
        return this.normalizeSettings(parsed);
    }

    updateSettings(patch: Partial<AppSettings>): AppSettings {
        const settingsFile = this.resolveSettingsFile();
        const current = this.getSettings();
        const updated = this.normalizeSettings({ ...current, ...patch });
        fs.writeFileSync(settingsFile, JSON.stringify(updated, null, 2));
        return updated;
    }

    getTicketExpiresAt(reference = new Date()): Date {
        const settings = this.getSettings();
        if (settings.ticketValidityMode === 'UNTIL_TIME' && settings.ticketValidUntilTime) {
            const [hoursStr, minutesStr] = settings.ticketValidUntilTime.split(':');
            const hours = Number.parseInt(hoursStr, 10);
            const minutes = Number.parseInt(minutesStr, 10);

            if (Number.isFinite(hours) && Number.isFinite(minutes)) {
                const expiresAt = new Date(reference);
                expiresAt.setHours(hours, minutes, 0, 0);
                if (expiresAt <= reference) {
                    expiresAt.setDate(expiresAt.getDate() + 1);
                }
                return expiresAt;
            }
        }

        return new Date(reference.getTime() + settings.ticketWindowMinutes * 60 * 1000);
    }
}
