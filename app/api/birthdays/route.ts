import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * GET /api/birthdays
 *
 * 取得所有 ACTIVE 用戶的生日資訊，依距今天最近排序。
 * 回傳：{ birthdays: BirthdayItem[] }
 */
export const GET = withAuth(async () => {
  try {
    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        birthday: { not: null },
      },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        birthday: true,
      },
    });

    const now = new Date();
    const currentYear = now.getFullYear();
    const todayMidnight = new Date(currentYear, now.getMonth(), now.getDate()).getTime();
    const ONE_DAY_MS = 1000 * 60 * 60 * 24;

    const birthdays: { userId: string; displayName: string; avatarUrl: string | null; birthday: string; daysUntil: number }[] = [];

    for (const u of users) {
      if (u.birthday === null) continue;
      const bDate = u.birthday;
      // DB Date 存為 UTC 日期
      const bMonth = bDate.getUTCMonth();
      const bDay = bDate.getUTCDate();

      // 計算今年生日
      let targetBday = new Date(currentYear, bMonth, bDay);
      let diffDays = Math.round((targetBday.getTime() - todayMidnight) / ONE_DAY_MS);

      // 若今年生日已過，計算明年生日
      if (diffDays < 0) {
        targetBday = new Date(currentYear + 1, bMonth, bDay);
        diffDays = Math.round((targetBday.getTime() - todayMidnight) / ONE_DAY_MS);
      }

      const birthdayStr = bDate.toISOString().split('T')[0];

      birthdays.push({
        userId: u.id,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        birthday: birthdayStr,
        daysUntil: Math.max(0, diffDays),
      });
    }

    birthdays.sort((a, b) => a.daysUntil - b.daysUntil);

    return NextResponse.json({ birthdays });
  } catch (error) {
    console.error('[GET /api/birthdays] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得生日列表' }, { status: 500 });
  }
});
