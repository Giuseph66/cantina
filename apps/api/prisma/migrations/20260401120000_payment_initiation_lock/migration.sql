ALTER TABLE "orders" ADD COLUMN "payment_lock_id" TEXT;
ALTER TABLE "orders" ADD COLUMN "payment_lock_method" TEXT;
ALTER TABLE "orders" ADD COLUMN "payment_lock_expires_at" DATETIME;
