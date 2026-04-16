ALTER TABLE "payment_transactions" ADD COLUMN "attempt_key" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN "gateway_request_id" TEXT;
ALTER TABLE "payment_transactions" ADD COLUMN "webhook_verified_at" DATETIME;
ALTER TABLE "payment_transactions" ADD COLUMN "webhook_source" TEXT;

CREATE INDEX "payment_transactions_attempt_key_idx" ON "payment_transactions"("attempt_key");
