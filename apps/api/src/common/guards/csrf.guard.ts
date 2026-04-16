import * as crypto from 'node:crypto';
import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import {
    CSRF_HEADER_NAME,
    extractCsrfTokenFromCookie,
} from '../../auth/auth-cookie.util';

@Injectable()
export class CsrfGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        const cookieToken = extractCsrfTokenFromCookie(request);
        const headerToken = this.extractHeaderToken(request);

        if (!cookieToken || !headerToken) {
            throw new ForbiddenException('Token CSRF ausente.');
        }

        const cookieBuffer = Buffer.from(cookieToken);
        const headerBuffer = Buffer.from(headerToken);
        if (cookieBuffer.length !== headerBuffer.length || !crypto.timingSafeEqual(cookieBuffer, headerBuffer)) {
            throw new ForbiddenException('Token CSRF inválido.');
        }

        return true;
    }

    private extractHeaderToken(request: Request) {
        const headerValue = request.headers[CSRF_HEADER_NAME];

        if (Array.isArray(headerValue)) {
            return headerValue[0] ?? null;
        }

        if (typeof headerValue === 'string') {
            return headerValue;
        }

        return null;
    }
}
