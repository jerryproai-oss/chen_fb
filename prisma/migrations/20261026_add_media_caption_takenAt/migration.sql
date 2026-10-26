-- 為 PostMedia 新增心情文和拍攝時間欄位
ALTER TABLE "post_media" ADD COLUMN "caption" TEXT;
ALTER TABLE "post_media" ADD COLUMN "taken_at" TIMESTAMP(3);
