PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_sub" TEXT,
    "picture_url" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "cpf" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CLIENT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

INSERT INTO "new_users" (
    "id",
    "name",
    "email",
    "password_hash",
    "role",
    "is_active",
    "created_at",
    "updated_at"
)
SELECT
    "id",
    "name",
    "email",
    "password_hash",
    "role",
    "is_active",
    "created_at",
    "updated_at"
FROM "users";

DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");
CREATE UNIQUE INDEX "users_cpf_key" ON "users"("cpf");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
