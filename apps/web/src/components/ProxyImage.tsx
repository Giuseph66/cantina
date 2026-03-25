import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { normalizeImageUrl } from '../utils/imageUrl';

function toUploadApiUrl(url: string) {
    try {
        const parsed = new URL(url, window.location.origin);
        const idx = parsed.pathname.indexOf('/uploads/');
        if (idx === -1) return null;
        return `/api/v1${parsed.pathname.slice(idx)}${parsed.search}`;
    } catch {
        return null;
    }
}

type ProxyImageProps = ImgHTMLAttributes<HTMLImageElement> & {
    src: string;
};

export function ProxyImage({ src, alt = '', ...props }: ProxyImageProps) {
    const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

    useEffect(() => {
        const normalizedSrc = normalizeImageUrl(src);
        if (!normalizedSrc) {
            setResolvedSrc(null);
            return;
        }

        const uploadApiUrl = toUploadApiUrl(normalizedSrc);
        if (!uploadApiUrl) {
            setResolvedSrc(normalizedSrc);
            return;
        }

        const controller = new AbortController();
        let objectUrl: string | null = null;

        void fetch(uploadApiUrl, {
            credentials: 'include',
            headers: { 'ngrok-skip-browser-warning': '1' },
            signal: controller.signal,
        })
            .then(async (response) => {
                if (!response.ok) throw new Error(`Image request failed with ${response.status}`);
                const blob = await response.blob();
                objectUrl = URL.createObjectURL(blob);
                setResolvedSrc(objectUrl);
            })
            .catch(() => {
                if (!controller.signal.aborted) {
                    setResolvedSrc(normalizedSrc);
                }
            });

        return () => {
            controller.abort();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [src]);

    if (!resolvedSrc) return null;

    return <img {...props} src={resolvedSrc} alt={alt} />;
}
