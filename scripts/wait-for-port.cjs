const net = require('node:net');

const port = Number(process.argv[2] || 3000);
const host = process.argv[3] || '127.0.0.1';
const timeoutMs = Number(process.argv[4] || 30000);
const retryDelayMs = 250;
const start = Date.now();

function tryConnect() {
    const socket = net.createConnection({ port, host });

    socket.once('connect', () => {
        socket.end();
        process.stdout.write(`Porta ${host}:${port} pronta.\n`);
        process.exit(0);
    });

    socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start >= timeoutMs) {
            process.stderr.write(`Timeout aguardando ${host}:${port} por ${timeoutMs}ms.\n`);
            process.exit(1);
        }

        setTimeout(tryConnect, retryDelayMs);
    });
}

tryConnect();
