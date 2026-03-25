const API_URL = (process.env.API_PROXY_URL || process.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

module.exports = async (req, res) => {
    const slug = Array.isArray(req.query.slug)
        ? req.query.slug.join('/')
        : req.query.slug || '';

    const searchIndex = req.url.indexOf('?');
    const search = searchIndex === -1 ? '' : req.url.slice(searchIndex);

    let upstream;
    try {
        upstream = await fetch(`${API_URL}/uploads/${slug}${search}`, {
            headers: { 'ngrok-skip-browser-warning': '1' },
        });
    } catch {
        res.status(502).end();
        return;
    }

    if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
    }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', upstream.headers.get('cache-control') || 'public, max-age=3600');
    const etag = upstream.headers.get('etag');
    if (etag) res.setHeader('ETag', etag);
    const lastModified = upstream.headers.get('last-modified');
    if (lastModified) res.setHeader('Last-Modified', lastModified);
    res.send(Buffer.from(await upstream.arrayBuffer()));
};
