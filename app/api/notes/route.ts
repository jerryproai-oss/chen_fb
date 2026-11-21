import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

// ── GET /api/notes — 列出我的記事（包括分享給我的）──────────
export const GET = withAuth(async ({ user }, req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const tag = url.searchParams.get('tag')?.trim() || '';
  const sort = url.searchParams.get('sort') || 'updatedAt';
  const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';

  const sortField = ['createdAt', 'updatedAt', 'title'].includes(sort) ? sort : 'updatedAt';

  // 建立篩選條件
  const searchFilter = q
    ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' as const } },
          { content: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const tagFilter = tag
    ? { tags: { some: { name: { equals: tag, mode: 'insensitive' as const } } } }
    : {};

  // 我能看到的記事：
  // 1) 我是作者
  // 2) visibility = FAMILY
  // 3) visibility = SELECTED 且我在 audiences 中
  const notes = await prisma.note.findMany({
    where: {
      AND: [
        {
          OR: [
            { authorId: user.id },
            { visibility: 'FAMILY' },
            {
              visibility: 'SELECTED',
              audiences: { some: { userId: user.id } },
            },
          ],
        },
        searchFilter,
        tagFilter,
      ],
    },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      tags: { select: { id: true, name: true } },
      audiences: { select: { userId: true } },
    },
    orderBy: [
      { pinned: 'desc' },
      { [sortField]: order },
    ],
  });

  return NextResponse.json(notes);
});

// ── POST /api/notes — 建立新記事 ─────────────────────────────
export const POST = withAuth(async ({ user }, req) => {
  const body = await req.json();
  const { title, content, color, pinned, visibility, audienceIds, tags } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: '標題不可為空' }, { status: 400 });
  }

  if (title.trim().length > 200) {
    return NextResponse.json({ error: '標題不可超過 200 字' }, { status: 400 });
  }

  const validVisibilities = ['PRIVATE', 'FAMILY', 'SELECTED'];
  const vis = validVisibilities.includes(visibility) ? visibility : 'PRIVATE';

  const note = await prisma.note.create({
    data: {
      authorId: user.id,
      title: title.trim(),
      content: content || '',
      color: color || null,
      pinned: !!pinned,
      visibility: vis,
      audiences:
        vis === 'SELECTED' && Array.isArray(audienceIds) && audienceIds.length > 0
          ? {
              create: audienceIds
                .filter((id: string) => typeof id === 'string' && id !== user.id)
                .map((userId: string) => ({ userId })),
            }
          : undefined,
      tags:
        Array.isArray(tags) && tags.length > 0
          ? {
              create: tags
                .filter((t: string) => typeof t === 'string' && t.trim().length > 0)
                .slice(0, 20)
                .map((name: string) => ({ name: name.trim() })),
            }
          : undefined,
    },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      tags: { select: { id: true, name: true } },
      audiences: { select: { userId: true } },
    },
  });

  return NextResponse.json(note, { status: 201 });
});
