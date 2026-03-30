ALTER TABLE "order_items" ADD COLUMN "product_name" TEXT NOT NULL DEFAULT '';

UPDATE "order_items"
SET "product_name" = COALESCE(
  (SELECT "name" FROM "products" WHERE "products"."id" = "order_items"."product_id"),
  ''
);

CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "payment_method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "external_id" TEXT,
    "external_reference" TEXT,
    "amount_cents" INTEGER NOT NULL,
    "payer_name" TEXT,
    "payer_email" TEXT,
    "payer_document" TEXT,
    "details_json" TEXT,
    "webhook_payload_json" TEXT,
    "last_error" TEXT,
    "paid_at" DATETIME,
    "expires_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "payment_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_transactions_external_id_key" ON "payment_transactions"("external_id");
CREATE INDEX "payment_transactions_order_id_status_idx" ON "payment_transactions"("order_id", "status");
CREATE INDEX "payment_transactions_external_reference_idx" ON "payment_transactions"("external_reference");
