#!/usr/bin/env node
/**
 * 非互動式管理員初始化腳本
 *
 * 用於 Docker 容器內執行，透過環境變數傳入帳號密碼。
 * 執行方式:
 *   ADMIN_USERNAME=xxx ADMIN_DISPLAY_NAME=xxx ADMIN_PASSWORD=xxx node scripts/init-admin-noninteractive.js
 *
 * 或在 NAS 上透過 docker exec:
 *   docker exec -e ADMIN_USERNAME=xxx -e ADMIN_DISPLAY_NAME=xxx -e ADMIN_PASSWORD=xxx shiri-web-1 node scripts/init-admin-noninteractive.js
 */

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const crypto = require('node:crypto');

// ── Argon2 替代方案：使用 Node.js 內建 scrypt ─────────────
// Docker 容器中可能沒有 argon2 的 native 依賴
// 但因為我們已經在 build 時安裝了 node_modules，argon2 應該可用

async function hashPassword(password) {
  try {
    const argon2 = require('argon2');
    return await argon2.hash(password, {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 65536,
      parallelism: 1,
    });
  } catch (e) {
    console.error('argon2 載入失敗，請確認 node_modules 已安裝:', e.message);
    process.exit(1);
  }
}

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const displayName = process.env.ADMIN_DISPLAY_NAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !displayName || !password) {
    console.error('❌ 需要設定環境變數: ADMIN_USERNAME, ADMIN_DISPLAY_NAME, ADMIN_PASSWORD');
    process.exit(1);
  }

  if (username.length < 2 || username.length > 30 || !/^[A-Za-z0-9_]+$/.test(username)) {
    console.error('❌ 帳號格式不正確（2-30 字，英文字母、數字、底線）');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('❌ 密碼至少需要 8 個字元');
    process.exit(1);
  }

  // 初始化 Prisma
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    // 檢查是否已有 ADMIN
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, username: true },
    });

    if (existingAdmin) {
      console.log(`系統已有管理員帳號 (${existingAdmin.username})，跳過初始化。`);
      return;
    }

    // 檢查帳號是否已存在
    const existing = await prisma.user.findUnique({
      where: { usernameNormalized: username.toLowerCase() },
      select: { id: true },
    });

    if (existing) {
      console.error(`❌ 帳號「${username}」已存在。`);
      process.exit(1);
    }

    // 建立管理員
    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username,
        usernameNormalized: username.toLowerCase(),
        displayName,
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        mustChangePassword: false,
        passwordVersion: 1,
      },
    });

    // 稽核日誌
    await prisma.auditEvent.create({
      data: {
        actorId: user.id,
        action: 'ADMIN_INIT',
        resourceType: 'USER',
        resourceId: user.id,
        outcome: 'SUCCESS',
      },
    });

    console.log('');
    console.log('✅ 管理員帳號建立完成！');
    console.log(`帳號：${username}`);
    console.log(`顯示名稱：${displayName}`);
    console.log('角色：管理員');
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ 發生錯誤:', err.message);
  process.exit(1);
});
