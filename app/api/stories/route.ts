import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import type { StoryGroup, StoryItem } from '@/lib/types';

/**
 * GET /api/stories
 *
 * 取得所有未過期的限時動態（expiresAt > now()），依作者分組回傳
 */
export const GET = withAuth(async () => {
  try {
    const now = new Date();
    const rawStories = await prisma.story.findMany({
      where: {
        expiresAt: {
          gt: now,
        },
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc', // 組內按建立時間由舊到新播放
      },
    });

    // 依 authorId 分組
    const groupsMap = new Map<string, StoryGroup>();

    for (const story of rawStories) {
      if (!groupsMap.has(story.authorId)) {
        groupsMap.set(story.authorId, {
          author: {
            id: story.author.id,
            displayName: story.author.displayName,
            avatarUrl: story.author.avatarUrl,
          },
          items: [],
        });
      }

      const item: StoryItem = {
        id: story.id,
        text: story.text,
        mediaUrl: story.mediaId ? `/api/media/${story.mediaId}` : null,
        bgColor: story.bgColor,
        expiresAt: story.expiresAt.toISOString(),
        createdAt: story.createdAt.toISOString(),
      };

      groupsMap.get(story.authorId)!.items.push(item);
    }

    const stories = Array.from(groupsMap.values());

    return NextResponse.json({ stories });
  } catch (error) {
    console.error('[GET /api/stories] 取得限時動態失敗:', error);
    return NextResponse.json({ error: '無法取得限時動態' }, { status: 500 });
  }
});

/**
 * POST /api/stories
 *
 * 建立新限時動態（預設 24 小時後過期）
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { text, mediaId, bgColor } = body;

  const hasText = typeof text === 'string' && text.trim().length > 0;
  const hasMedia = typeof mediaId === 'string' && mediaId.trim().length > 0;

  if (!hasText && !hasMedia) {
    return NextResponse.json(
      { error: '文字內容或媒體附件至少需要提供一項' },
      { status: 400 },
    );
  }

  if (hasText && text.trim().length > 500) {
    return NextResponse.json({ error: '動態文字不可超過 500 字' }, { status: 400 });
  }

  // expiresAt 自動設為 24 小時後
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    const story = await prisma.story.create({
      data: {
        authorId: user.id,
        text: hasText ? text.trim() : null,
        mediaId: hasMedia ? mediaId.trim() : null,
        bgColor: typeof bgColor === 'string' ? bgColor.trim() : null,
        expiresAt,
      },
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.STORY_CREATE,
      resourceType: ResourceTypes.STORY,
      resourceId: story.id,
      outcome: Outcomes.SUCCESS,
    });

    const item: StoryItem = {
      id: story.id,
      text: story.text,
      mediaUrl: story.mediaId ? `/api/media/${story.mediaId}` : null,
      bgColor: story.bgColor,
      expiresAt: story.expiresAt.toISOString(),
      createdAt: story.createdAt.toISOString(),
    };

    return NextResponse.json({ story: item }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/stories] 建立動態失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.STORY_CREATE,
      resourceType: ResourceTypes.STORY,
      resourceId: null,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '建立限時動態失敗' }, { status: 500 });
  }
});
