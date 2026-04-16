import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard';

describe('CsrfGuard', () => {
    const guard = new CsrfGuard();

    function buildContext(cookie?: string, header?: string) {
        return {
            switchToHttp: () => ({
                getRequest: () => ({
                    headers: {
                        cookie,
                        'x-csrf-token': header,
                    },
                }),
            }),
        } as ExecutionContext;
    }

    it('accepts matching csrf cookie and header', () => {
        expect(guard.canActivate(buildContext('cantina_csrf=token-123', 'token-123'))).toBe(true);
    });

    it('rejects mismatched csrf token', () => {
        expect(() => guard.canActivate(buildContext('cantina_csrf=token-123', 'token-456'))).toThrow(ForbiddenException);
    });
});
