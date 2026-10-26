import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/media/:id/caption
 *
 * 更新媒體的心情文/說明文字。僅上傳者可編輯。
 *
 * Body: { caption: string | null }
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest, context) => {
  const { id } = await context.params as { id: string };

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: '無效的媒體 ID' }, { status: 400 });
  }

  // 解析 body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { caption } = body as Record<string, unknown>;

  // 驗證 caption
  if (caption !== null && caption !== undefined) {
    if (typeof caption !== 'string') {
      return NextResponse.json({ error: '心情文格式不正確' }, { status: 400 });
    }
    if (caption.trim().length > 500) {
      return NextResponse.json({ error: '心情文長度上限 500 字' }, { status: 400 });
    }
  }

  // 查找媒體
  const media = await prisma.postMedia.findUnique({
    where: { id },
    select: { id: true, uploaderId: true },
  });

  if (!media) {
    return NextResponse.json({ error: '找不到該媒體' }, { status: 404 });
  }

  // 權限：僅上傳者可編輯
  if (media.uploaderId !== user.id) {
    return NextResponse.json({ error: '無權限編輯此媒體' }, { status: 403 });
  }

  // 更新
  const trimmed = typeof caption === 'string' ? caption.trim() || null : null;

  const updated = await prisma.postMedia.update({
    where: { id },
    data: { caption: trimmed },
    select: { id: true, caption: true },
  });

  return NextResponse.json({ media: updated });
});
