-- CreateTable: vault_pins
CREATE TABLE "vault_pins" (
    "user_id" UUID NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vault_pins_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable: vault_items
CREATE TABLE "vault_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title_enc" TEXT NOT NULL,
    "content_enc" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'NOTE',
    "iv" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vault_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: vault_attachments
CREATE TABLE "vault_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "path_enc" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vault_items_user_id_updated_at_idx" ON "vault_items"("user_id", "updated_at" DESC);

-- AddForeignKey
ALTER TABLE "vault_pins" ADD CONSTRAINT "vault_pins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_items" ADD CONSTRAINT "vault_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_attachments" ADD CONSTRAINT "vault_attachments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "vault_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
