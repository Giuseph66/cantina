import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
    constructor(private readonly prisma: PrismaService) { }

    async log(
        actorUserId: string | null,
        action: string,
        entity: string,
        entityId?: string | null,
        payload?: Record<string, unknown>,
    ): Promise<void> {
        await this.prisma.auditLog.create({
            data: {
                actorUserId,
                action,
                entity,
                entityId,
                payloadJson: (payload ? JSON.stringify(payload) : null) as any,
            },
        });
    }
}
