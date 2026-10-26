import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/** 共用的 user include */
const USER_SELECT = { user: { select: { displayName: true } } } as const;

// ── GET /api/contacts/check-duplicate ────────────────────────────────────────

/**
 * 建立聯絡人前的重複檢查
 *
 * Query params:
 * - name（必填）：姓名（不分大小寫）
 * - phone（選填）：同時比對電話
 *
 * 搜尋範圍：
 * - 使用者自己的聯絡人
 * - 所有已共享的聯絡人
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name')?.trim();
  const phone = searchParams.get('phone')?.trim();

  if (!name) {
    return NextResponse.json(
      { error: 'name 為必填查詢參數' },
      { status: 400 },
    );
  }

  try {
    // 組合查詢條件：姓名（不分大小寫）+ 可見範圍
    const whereCondition: Record<string, unknown> = {
      name: { equals: name, mode: 'insensitive' },
      OR: [
        { userId: user.id },
        { isShared: true },
      ],
    };

    // 若提供電話，也加入比對
    if (phone) {
      whereCondition.phone = phone;
    }

    const duplicates = await prisma.contact.findMany({
      where: whereCondition,
      include: USER_SELECT,
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ duplicates });
  } catch (error) {
    console.error('[GET /api/contacts/check-duplicate] 查詢失敗:', error);
    return NextResponse.json({ error: '重複檢查失敗' }, { status: 500 });
  }
});
