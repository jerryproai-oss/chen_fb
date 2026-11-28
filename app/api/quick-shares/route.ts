import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

// ── OG Meta 抓取 ────────────────────────────────────────────

async function fetchOGMeta(url: string): Promise<{ title?: string; description?: string; imageUrl?: string }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ShiriBot/1.0)' },
    });

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

// ── GET /api/quick-shares ────────────────────────────────────

export const GET = withAuth(async ({ user }, req) => {
  const url = new URL(req.url);
  const typeFilter = url.searchParams.get('type')?.toUpperCase();
  const categoryId = url.searchParams.get('categoryId');

  const validTypes = ['LINK', 'LOCATION', 'MEMO'];
  const whereType = typeFilter && validTypes.includes(typeFilter)
    ? { type: typeFilter as 'LINK' | 'LOCATION' | 'MEMO' }
    : {};

  const whereCategory = categoryId
    ? { categoryId }
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
        whereCategory,
      ],
    },
    include: shareInclude,
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
    categoryId?: string | null;
    // 附加欄位
    memo?: string;
    linkUrl?: string;
    locationAddress?: string;
    locationName?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { type, content, title, description, visibility, categoryId } = body;

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

  // 驗證 categoryId（選填）
  let catId: string | null = null;
  if (categoryId) {
    const catExists = await prisma.shareCategory.findUnique({ where: { id: categoryId } });
    if (!catExists) {
      return NextResponse.json({ error: '無效的分類' }, { status: 400 });
    }
    catId = categoryId;
  }

  // 依主要類型處理
  let shareTitle = title?.trim() || null;
  let shareDescription = description?.trim() || null;
  let shareImageUrl: string | null = null;
  let shareMapUrl: string | null = null;

  if (type === 'LINK') {
    if (!/^https?:\/\//i.test(content.trim())) {
      return NextResponse.json({ error: '請輸入有效的網址（以 http:// 或 https:// 開頭）' }, { status: 400 });
    }
    const ogMeta = await fetchOGMeta(content.trim());
    shareTitle = shareTitle || ogMeta.title || content.trim();
    shareDescription = ogMeta.description || null;
    shareImageUrl = ogMeta.imageUrl || null;
  } else if (type === 'LOCATION') {
    shareMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(content.trim())}`;
    shareDescription = description?.trim() || null;
  } else if (type === 'MEMO') {
    if (content.trim().length > 500) {
      return NextResponse.json({ error: '備忘文字不能超過 500 字' }, { status: 400 });
    }
  }

  // 處理附加備忘
  const shareMemo = body.memo?.trim() || null;
  if (shareMemo && shareMemo.length > 500) {
    return NextResponse.json({ error: '備忘文字不能超過 500 字' }, { status: 400 });
  }

  // 處理附加網址
  let shareLinkUrl: string | null = null;
  let shareLinkTitle: string | null = null;
  let shareLinkImage: string | null = null;
  if (body.linkUrl?.trim()) {
    const linkUrl = body.linkUrl.trim();
    if (!/^https?:\/\//i.test(linkUrl)) {
      return NextResponse.json({ error: '附加網址格式不正確' }, { status: 400 });
    }
    shareLinkUrl = linkUrl;
    const ogMeta = await fetchOGMeta(linkUrl);
    shareLinkTitle = ogMeta.title || null;
    shareLinkImage = ogMeta.imageUrl || null;
  }

  // 處理附加位置
  let shareLocationAddress: string | null = null;
  let shareLocationName: string | null = null;
  let shareLocationMapUrl: string | null = null;
  if (body.locationAddress?.trim()) {
    shareLocationAddress = body.locationAddress.trim();
    shareLocationName = body.locationName?.trim() || null;
    shareLocationMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shareLocationAddress)}`;
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
      memo: shareMemo,
      linkUrl: shareLinkUrl,
      linkTitle: shareLinkTitle,
      linkImage: shareLinkImage,
      locationAddress: shareLocationAddress,
      locationName: shareLocationName,
      locationMapUrl: shareLocationMapUrl,
      visibility: vis as 'PRIVATE' | 'FAMILY',
      categoryId: catId,
    },
    include: shareInclude,
  });

  return NextResponse.json(share, { status: 201 });
});
