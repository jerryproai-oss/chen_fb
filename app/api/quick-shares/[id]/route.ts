import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

// ── 有效分類 ─────────────────────────────────────────────────

const VALID_CATEGORIES = ['FOOD', 'TRAVEL', 'SHOPPING', 'LIFE', 'WORK', 'STUDY', 'HEALTH', 'OTHER'] as const;
type Category = (typeof VALID_CATEGORIES)[number];

// ── OG Meta 抓取 ────────────────────────────────────────────

async function fetchOGMeta(url: string): Promise<{ title?: string; description?: string; imageUrl?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShiriBot/1.0)' },
    });
    clearTimeout(timeout);

    const html = await res.text();
    const getMetaContent = (property: string) => {
      const match = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'));
      return match ? match[1] : undefined;
    };

    const title = getMetaContent('og:title')
      || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
    const description = getMetaContent('og:description') || getMetaContent('description');
    const imageUrl = getMetaContent('og:image');

    return { title, description, imageUrl };
  } catch {
    return {};
  }
}

// ── DELETE /api/quick-shares/[id] ────────────────────────────

export const DELETE = withAuth(async ({ user }, _req, routeCtx) => {
  const { id } = await routeCtx.params;

  const share = await prisma.quickShare.findUnique({
    where: { id },
    select: { authorId: true },
  });

  if (!share) {
    return NextResponse.json({ error: '找不到此分享' }, { status: 404 });
  }

  if (share.authorId !== user.id) {
    return NextResponse.json({ error: '僅作者可以刪除' }, { status: 403 });
  }

  await prisma.quickShare.delete({ where: { id } });

  return NextResponse.json({ success: true });
});

// ── PATCH /api/quick-shares/[id] — 置頂 / 編輯 ──────────────

export const PATCH = withAuth(async ({ user }, req, routeCtx) => {
  const { id } = await routeCtx.params;

  let body: {
    pinned?: boolean;
    content?: string;
    title?: string;
    description?: string;
    visibility?: string;
    category?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const share = await prisma.quickShare.findUnique({
    where: { id },
    select: { authorId: true, type: true },
  });

  if (!share) {
    return NextResponse.json({ error: '找不到此分享' }, { status: 404 });
  }

  if (share.authorId !== user.id) {
    return NextResponse.json({ error: '僅作者可以操作' }, { status: 403 });
  }

  // 建構更新資料
  const updateData: Record<string, unknown> = {};

  // 置頂
  if (typeof body.pinned === 'boolean') {
    updateData.pinned = body.pinned;
  }

  // 能見度
  if (body.visibility === 'PRIVATE' || body.visibility === 'FAMILY') {
    updateData.visibility = body.visibility;
  }

  // 分類 — null 表示清除
  if (body.category !== undefined) {
    if (body.category === null || body.category === '') {
      updateData.category = null;
    } else if ((VALID_CATEGORIES as readonly string[]).includes(body.category.toUpperCase())) {
      updateData.category = body.category.toUpperCase();
    }
  }

  // 內容編輯（依類型處理）
  if (body.content !== undefined && typeof body.content === 'string' && body.content.trim()) {
    updateData.content = body.content.trim();

    if (share.type === 'LINK') {
      if (!/^https?:\/\//i.test(body.content.trim())) {
        return NextResponse.json({ error: '請輸入有效的網址' }, { status: 400 });
      }
      // 重新抓取 OG meta
      const ogMeta = await fetchOGMeta(body.content.trim());
      updateData.title = ogMeta.title || body.content.trim();
      updateData.description = ogMeta.description || null;
      updateData.imageUrl = ogMeta.imageUrl || null;
    } else if (share.type === 'LOCATION') {
      updateData.mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(body.content.trim())}`;
    } else if (share.type === 'MEMO') {
      if (body.content.trim().length > 500) {
        return NextResponse.json({ error: '備忘文字不能超過 500 字' }, { status: 400 });
      }
    }
  }

  // 標題（位置名稱）
  if (body.title !== undefined && share.type === 'LOCATION') {
    updateData.title = body.title?.trim() || null;
  }

  // 描述
  if (body.description !== undefined && share.type === 'LOCATION') {
    updateData.description = body.description?.trim() || null;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: '沒有要更新的欄位' }, { status: 400 });
  }

  const updated = await prisma.quickShare.update({
    where: { id },
    data: updateData,
    include: {
      author: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
  });

  return NextResponse.json(updated);
});
