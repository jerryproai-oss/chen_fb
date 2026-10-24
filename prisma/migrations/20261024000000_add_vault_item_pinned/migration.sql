ALTER TABLE "vault_items" ADD COLUMN "pinned_at" TIMESTAMP(3);
CREATE INDEX "vault_items_user_id_pinned_at_idx" ON "vault_items"("user_id", "pinned_at" DESC);
