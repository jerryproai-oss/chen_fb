-- 共享保險庫功能：新增 vault_members 資料表 + vault_items.created_by 欄位
-- 在 NAS 上使用：docker exec shiri-db psql -U shiri -d shiri -f /tmp/migration.sql
-- 或逐行執行以下 SQL

-- 1. vault_items 新增 created_by 欄位
ALTER TABLE "vault_items" ADD COLUMN IF NOT EXISTS "created_by" UUID;

-- 2. 建立 vault_members 資料表
CREATE TABLE IF NOT EXISTS "vault_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "vault_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vault_members_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "vault_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 3. 建立唯一索引（防止重複加入）
CREATE UNIQUE INDEX IF NOT EXISTS "vault_members_owner_id_member_id_key" ON "vault_members"("owner_id", "member_id");
