import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { canViewPost, canReactToPost } from '@/lib/policy/post-authorization';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 合法的心情回應類型 */
const VALID_REACTION_TYPES = [
  'LIKE',
  'LOVE',
  'CARE',
  'LAUGH',
  'WOW',
  'SAD',
  'ANGRY',
  'RECEIVED',
  'NO_PROBLEM',
] as const;
type ValidReactionType = (typeof VALID_REACTION_TYPES)[number];

/**
 * GET /api/posts/[id]/reactions
 *
 * 取得指定貼文的心情回應統計 + 目前使用者自己的回應。
 * 需要有貼文的閱讀權限。
 *
 * 回傳格式:
 * {
 *   summary: { LIKE: 3, LOVE: 1, ... },
 *   total: 4,
 *   myReaction: "LIKE" | null,
 *   reactions: [{ userId, displayName, avatarUrl, type, createdAt }, ...]
 * }
 */
export const GET = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id: postId } = await routeCtx.params;

  if (!UUID_PATTERN.test(postId)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  // ── 取得貼文並檢查權限 ──────────────────────────────
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      audiences: { select: { userId: true } },
    },
  });

  if (!post) {
    return NextResponse.json(
      { error: '貼文不存在' },
      { status: 404 },
    );
  }

  const audienceUserIds = post.audiences.map((a) => a.userId);
  if (!canViewPost(user, post, audienceUserIds)) {
    return NextResponse.json(
      { error: '無權存取此貼文' },
      { status: 403 },
    );
  }

  // ── 取得所有回應 ────────────────────────────────────
  const reactions = await prisma.postReaction.findMany({
    where: { postId },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // ── 統計 ────────────────────────────────────────────
  const summary: Record<string, number> = {};
  let myReaction: string | null = null;

  for (const r of reactions) {
    summary[r.type] = (summary[r.type] || 0) + 1;
    if (r.userId === user.id) {
      myReaction = r.type;
    }
  }

  return NextResponse.json({
    summary,
    total: reactions.length,
    myReaction,
    reactions: reactions.map((r) => ({
      userId: r.userId,
      displayName: r.user.displayName,
      avatarUrl: r.user.avatarUrl,
      type: r.type,
      createdAt: r.createdAt,
    })),
  });
});

/**
 * PUT /api/posts/[id]/reactions
 *
 * 設定或更換目前使用者對指定貼文的心情回應。
 * 每人每篇只能有一種心情回應（upsert）。
 *
 * Body:
 * - type: ReactionType (必填)
 */
export const PUT = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id: postId } = await routeCtx.params;

  if (!UUID_PATTERN.test(postId)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  // ── 取得貼文並檢查權限 ──────────────────────────────
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      audiences: { select: { userId: true } },
    },
  });

  if (!post) {
    return NextResponse.json(
      { error: '貼文不存在' },
      { status: 404 },
    );
  }

  const audienceUserIds = post.audiences.map((a) => a.userId);
  if (!canReactToPost(user, post, audienceUserIds)) {
    return NextResponse.json(
      { error: '無權對此貼文做心情回應' },
      { status: 403 },
    );
  }

  // ── 解析 Body ───────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: '無效的請求格式' },
      { status: 400 },
    );
  }

  const { type } = body as Record<string, unknown>;

  // ── 驗證 type ───────────────────────────────────────
  if (
    typeof type !== 'string' ||
    !VALID_REACTION_TYPES.includes(type as ValidReactionType)
  ) {
    return NextResponse.json(
      {
        error: `無效的心情類型，可用值：${VALID_REACTION_TYPES.join(', ')}`,
      },
      { status: 400 },
    );
  }

  // ── Upsert 心情回應 ────────────────────────────────
  const reaction = await prisma.postReaction.upsert({
    where: {
      postId_userId: {
        postId,
        userId: user.id,
      },
    },
    update: {
      type: type as ValidReactionType,
    },
    create: {
      postId,
      userId: user.id,
      type: type as ValidReactionType,
    },
  });

  // ── 觸發通知（非阻塞） ─────────────────────────────
  if (post.authorId !== user.id) {
    const actorName = user.displayName || '有人';
    const emojiMap: Record<string, string> = {
      LIKE: '👍', LOVE: '❤️', CARE: '🤗', LAUGH: '😂',
      WOW: '😮', SAD: '😢', ANGRY: '😡', RECEIVED: '✅', NO_PROBLEM: '👌',
    };
    const labelMap: Record<string, string> = {
      LIKE: '按讚', LOVE: '表達愛心', CARE: '給予擁抱', LAUGH: '覺得好笑',
      WOW: '感到驚訝', SAD: '覺得難過', ANGRY: '覺得生氣', RECEIVED: '表示收到', NO_PROBLEM: '表示沒問題',
    };
    const emoji = emojiMap[type] || '👍';
    const label = labelMap[type] || '做了回應';
    prisma.notification
      .create({
        data: {
          userId: post.authorId,
          actorId: user.id,
          type: 'REACTION',
          title: `${actorName} ${emoji} ${label}`,
          linkUrl: `/posts/${postId}`,
          resourceId: postId,
        },
      })
      .catch((err) => console.error('[notification] 心情回應通知建立失敗:', err instanceof Error ? err.message : 'unknown error'));
  }

  // ── 稽核 ────────────────────────────────────────────
  await logAudit({
    actorId: user.id,
    action: AuditActions.REACTION_SET,
    resourceType: ResourceTypes.POST,
    resourceId: postId,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({
    reaction: {
      postId: reaction.postId,
      userId: reaction.userId,
      type: reaction.type,
      createdAt: reaction.createdAt,
      updatedAt: reaction.updatedAt,
    },
  });
});

/**
 * DELETE /api/posts/[id]/reactions
 *
 * 取消目前使用者對指定貼文的心情回應。
 */
export const DELETE = withAuth(
  async ({ user }, _req: NextRequest, routeCtx) => {
    const { id: postId } = await routeCtx.params;

    if (!UUID_PATTERN.test(postId)) {
      return NextResponse.json(
        { error: '無效的貼文 ID 格式' },
        { status: 400 },
      );
    }

    // ── 檢查貼文是否存在 ──────────────────────────────
    const post = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return NextResponse.json(
        { error: '貼文不存在' },
        { status: 404 },
      );
    }

    // ── 刪除心情回應 ──────────────────────────────────
    try {
      await prisma.postReaction.delete({
        where: {
          postId_userId: {
            postId,
            userId: user.id,
          },
        },
      });
    } catch {
      // 如果不存在，視為成功（冪等操作）
      return NextResponse.json({ success: true });
    }

    // ── 稽核 ──────────────────────────────────────────
    await logAudit({
      actorId: user.id,
      action: AuditActions.REACTION_REMOVE,
      resourceType: ResourceTypes.POST,
      resourceId: postId,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ success: true });
  },
);
