import { NextRequest, NextResponse } from 'next/server';
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

// ── GET /api/quick-shares ────────────────────────────────────

export const GET = withAuth(async ({ user }, req) => {
  const url = new URL(req.url);
  const typeFilter = url.searchParams.get('type')?.toUpperCase();

  const validTypes = ['LINK', 'LOCATION', 'MEMO'];
  const whereType = typeFilter && validTypes.includes(typeFilter)
    ? { type: typeFilter as 'LINK' | 'LOCATION' | 'MEMO' }
    : {};

  const shares = await prisma.quickShare.findMany({
    where: {
      AND: [
        {
          OR: [
            { visibility: 'FAMILY' },
            { authorId: user.id },
          ],
        },
        whereType,
      ],
    },
    include: {
      author: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
    orderBy: [
      { pinned: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  return NextResponse.json(shares);
});

// ── POST /api/quick-shares ───────────────────────────────────

export const POST = withAuth(async ({ user }, req) => {
  let body: {
    type?: string;
    content?: string;
    title?: string;
    description?: string;
    visibility?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { type, content, title, description, visibility } = body;

  // 驗證 type
  if (!type || !['LINK', 'LOCATION', 'MEMO'].includes(type)) {
    return NextResponse.json({ error: '無效的分享類型' }, { status: 400 });
  }

  // 驗證 content
  if (!content || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: '內容不能為空' }, { status: 400 });
  }

  // 驗證 visibility
  const vis = visibility === 'PRIVATE' ? 'PRIVATE' : 'FAMILY';

  // 依類型處理
  let shareTitle = title?.trim() || null;
  let shareDescription = description?.trim() || null;
  let shareImageUrl: string | null = null;
  let shareMapUrl: string | null = null;

  if (type === 'LINK') {
    // 驗證 URL
    if (!/^https?:\/\//i.test(content.trim())) {
      return NextResponse.json({ error: '請輸入有效的網址（以 http:// 或 https:// 開頭）' }, { status: 400 });
    }

    // 後端抓取 OG meta（非阻塞：先回應、背景更新）
    const ogMeta = await fetchOGMeta(content.trim());
    shareTitle = ogMeta.title || content.trim();
    shareDescription = ogMeta.description || null;
    shareImageUrl = ogMeta.imageUrl || null;
  } else if (type === 'LOCATION') {
    shareMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(content.trim())}`;
    shareDescription = description?.trim() || null;
  } else if (type === 'MEMO') {
    // 驗證長度 1-500
    if (content.trim().length > 500) {
      return NextResponse.json({ error: '備忘文字不能超過 500 字' }, { status: 400 });
    }
  }

  const share = await prisma.quickShare.create({
    data: {
      authorId: user.id,
      type: type as 'LINK' | 'LOCATION' | 'MEMO',
      content: content.trim(),
      title: shareTitle,
      description: shareDescription,
      imageUrl: shareImageUrl,
      mapUrl: shareMapUrl,
      visibility: vis as 'PRIVATE' | 'FAMILY',
    },
    include: {
      author: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
  });

  return NextResponse.json(share, { status: 201 });
});
