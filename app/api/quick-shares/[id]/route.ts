import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

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

// ── include 共用 ─────────────────────────────────────────────

const shareInclude = {
  author: {
    select: { id: true, displayName: true, avatarUrl: true },
  },
  categoryRef: {
    select: { id: true, name: true, emoji: true },
  },
};

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
    categoryId?: string | null;
    memo?: string | null;
    linkUrl?: string | null;
    locationAddress?: string | null;
    locationName?: string | null;
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
  if (body.categoryId !== undefined) {
    if (body.categoryId === null || body.categoryId === '') {
      updateData.categoryId = null;
    } else {
      const catExists = await prisma.shareCategory.findUnique({ where: { id: body.categoryId } });
      if (!catExists) {
        return NextResponse.json({ error: '無效的分類' }, { status: 400 });
      }
      updateData.categoryId = body.categoryId;
    }
  }

  // 主要內容編輯
  if (body.content !== undefined && typeof body.content === 'string' && body.content.trim()) {
    updateData.content = body.content.trim();

    if (share.type === 'LINK') {
      if (!/^https?:\/\//i.test(body.content.trim())) {
        return NextResponse.json({ error: '請輸入有效的網址' }, { status: 400 });
      }
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

  // 附加備忘
  if (body.memo !== undefined) {
    const m = typeof body.memo === 'string' ? body.memo.trim() : null;
    if (m && m.length > 500) {
      return NextResponse.json({ error: '備忘文字不能超過 500 字' }, { status: 400 });
    }
    updateData.memo = m || null;
  }

  // 附加網址
  if (body.linkUrl !== undefined) {
    const lu = typeof body.linkUrl === 'string' ? body.linkUrl.trim() : null;
    if (lu) {
      if (!/^https?:\/\//i.test(lu)) {
        return NextResponse.json({ error: '附加網址格式不正確' }, { status: 400 });
      }
      updateData.linkUrl = lu;
      const ogMeta = await fetchOGMeta(lu);
      updateData.linkTitle = ogMeta.title || null;
      updateData.linkImage = ogMeta.imageUrl || null;
    } else {
      updateData.linkUrl = null;
      updateData.linkTitle = null;
      updateData.linkImage = null;
    }
  }

  // 附加位置
  if (body.locationAddress !== undefined) {
    const la = typeof body.locationAddress === 'string' ? body.locationAddress.trim() : null;
    if (la) {
      updateData.locationAddress = la;
      updateData.locationName = body.locationName?.trim() || null;
      updateData.locationMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(la)}`;
    } else {
      updateData.locationAddress = null;
      updateData.locationName = null;
      updateData.locationMapUrl = null;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: '沒有要更新的欄位' }, { status: 400 });
  }

  const updated = await prisma.quickShare.update({
    where: { id },
    data: updateData,
    include: shareInclude,
  });

  return NextResponse.json(updated);
});
