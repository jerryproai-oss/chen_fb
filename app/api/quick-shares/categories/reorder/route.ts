import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

// PUT /api/quick-shares/categories/reorder
export const PUT = withAuth(async ({ user }, req) => {
  let body: { orderedIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { orderedIds } = body;
  if (!orderedIds || !Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: '請提供排序清單' }, { status: 400 });
  }

  // Update sortOrder for each category
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.shareCategory.update({
        where: { id },
        data: { sortOrder: index + 1 },
      })
    )
  );

  const categories = await prisma.shareCategory.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  return NextResponse.json(categories);
});
