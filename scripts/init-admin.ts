#!/usr/bin/env tsx
/**
 * 管理員初始化腳本
 *
 * 首次部署時在 NAS Docker 容器內執行，用於建立系統管理員帳號。
 * 執行方式: npm run init-admin
 *
 * ⚠️ 注意：使用相對路徑 import，因為 tsx 不支援 tsconfig paths (@/ alias)。
 */

import * as readline from "node:readline";
import { prisma } from "../lib/db/client";
import { hashPassword } from "../lib/auth/password";

// ── 稽核日誌（直接使用 prisma，避免 @/ alias 問題）──────

const AuditActions = {
  ADMIN_INIT: "ADMIN_INIT",
} as const;

const ResourceTypes = {
  USER: "USER",
} as const;

const Outcomes = {
  SUCCESS: "SUCCESS",
} as const;

// ── 輸入驗證規則 ─────────────────────────────────────────

const USERNAME_REGEX = /^[A-Za-z0-9_]{2,30}$/;
const DISPLAY_NAME_MIN = 1;
const DISPLAY_NAME_MAX = 50;
const PASSWORD_MIN_LENGTH = 8;

// ── 互動式輸入工具 ───────────────────────────────────────

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    // 手動處理隱藏輸入
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    let input = "";
    stdin.resume();
    stdin.on("data", function onData(ch: Buffer) {
      const c = ch.toString();
      if (c === "\n" || c === "\r" || c === "\u0004") {
        if (stdin.isTTY) {
          stdin.setRawMode(wasRaw ?? false);
        }
        stdin.removeListener("data", onData);
        stdin.pause();
        rl.close();
        process.stdout.write("\n");
        resolve(input);
      } else if (c === "\u0003") {
        // Ctrl+C
        console.log("\n\n已取消。");
        process.exit(1);
      } else if (c === "\u007f" || c === "\b") {
        // Backspace
        input = input.slice(0, -1);
      } else {
        input += c;
      }
    });
  });
}

// ── 帶驗證的輸入函式 ─────────────────────────────────────

async function askUsername(): Promise<string> {
  while (true) {
    const username = (await ask("請輸入管理員帳號（2-30 字，英文字母、數字、底線）：")).trim();
    if (!USERNAME_REGEX.test(username)) {
      console.log("❌ 帳號格式不正確，只能使用英文字母、數字和底線，長度 2-30 字。\n");
      continue;
    }
    return username;
  }
}

async function askDisplayName(): Promise<string> {
  while (true) {
    const displayName = (await ask("請輸入顯示名稱（1-50 字）：")).trim();
    if (
      displayName.length < DISPLAY_NAME_MIN ||
      displayName.length > DISPLAY_NAME_MAX
    ) {
      console.log(`❌ 顯示名稱長度需在 ${DISPLAY_NAME_MIN}-${DISPLAY_NAME_MAX} 字之間。\n`);
      continue;
    }
    return displayName;
  }
}

async function askPasswordWithConfirmation(): Promise<string> {
  while (true) {
    const password = await askHidden(
      `請輸入密碼（至少 ${PASSWORD_MIN_LENGTH} 字）：`,
    );
    if (password.length < PASSWORD_MIN_LENGTH) {
      console.log(`❌ 密碼至少需要 ${PASSWORD_MIN_LENGTH} 個字元。\n`);
      continue;
    }

    const confirm = await askHidden("請再次輸入密碼確認：");
    if (password !== confirm) {
      console.log("❌ 兩次輸入的密碼不一致，請重新輸入。\n");
      continue;
    }

    return password;
  }
}

// ── 主程式 ───────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("");
  console.log("═══════════════════════════════════════");
  console.log("  拾日 — 管理員帳號初始化");
  console.log("═══════════════════════════════════════");
  console.log("");

  // 1. 檢查是否已有 ADMIN 使用者
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });

  if (existingAdmin) {
    console.log("系統已有管理員帳號，如需新增請使用管理介面。");
    return;
  }

  // 2. 詢問帳號
  const username = await askUsername();

  // 檢查帳號是否已存在（雖然首次應該沒有，但做防禦性檢查）
  const existingUser = await prisma.user.findUnique({
    where: { usernameNormalized: username.toLowerCase() },
    select: { id: true },
  });

  if (existingUser) {
    console.log(`❌ 帳號「${username}」已存在。`);
    process.exit(1);
  }

  // 3. 詢問顯示名稱
  const displayName = await askDisplayName();

  // 4 & 5. 詢問並確認密碼
  const password = await askPasswordWithConfirmation();

  // 6. 建立 admin 使用者
  console.log("\n正在建立管理員帳號...\n");

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      username,
      usernameNormalized: username.toLowerCase(),
      displayName,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      mustChangePassword: false,
      passwordVersion: 1,
    },
  });

  // 7. 寫入稽核日誌
  await prisma.auditEvent.create({
    data: {
      actorId: user.id,
      action: AuditActions.ADMIN_INIT,
      resourceType: ResourceTypes.USER,
      resourceId: user.id,
      outcome: Outcomes.SUCCESS,
    },
  });

  // 8. 輸出成功訊息
  console.log("✅ 管理員帳號建立完成！");
  console.log(`帳號：${username}`);
  console.log(`顯示名稱：${displayName}`);
  console.log("角色：管理員");
  console.log("");
  console.log("請使用此帳號登入系統。");
}

// ── 執行 ─────────────────────────────────────────────────

main()
  .catch((error) => {
    console.error("\n❌ 發生錯誤:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
