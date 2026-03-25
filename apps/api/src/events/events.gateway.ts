import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
    cors: {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
            if (!origin) { callback(null, true); return; }
            const allowed = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
                .split(',').map(o => o.trim());
            callback(null, allowed.includes(origin));
        },
        credentials: true,
    },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    handleConnection(client: Socket) {
        // console.log(`Client connected: ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        // console.log(`Client disconnected: ${client.id}`);
    }

    broadcastOrderStatus(orderId: string, userId: string, status: string, ticketCode?: string) {
        if (this.server) {
            this.server.emit('order_status_update', {
                orderId,
                userId,
                status,
                ticketCode,
                timestamp: new Date().toISOString(),
            });
        }
    }
}
