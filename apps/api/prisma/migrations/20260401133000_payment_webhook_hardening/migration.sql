CREATE TABLE "payment_webhook_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "event_type" TEXT,
    "order_id" TEXT NOT NULL,
    "payment_transaction_id" TEXT NOT NULL,
    "payload_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_webhook_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payment_webhook_events_payment_transaction_id_fkey" FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_webhook_events_provider_event_key_key" ON "payment_webhook_events"("provider", "event_key");
CREATE INDEX "payment_webhook_events_payment_transaction_id_created_at_idx" ON "payment_webhook_events"("payment_transaction_id", "created_at");
CREATE INDEX "payment_webhook_events_order_id_created_at_idx" ON "payment_webhook_events"("order_id", "created_at");
