import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { canViewPost, canEditPost, canDeletePost } from '@/lib/policy/post-authorization';

/** 合法的隱私設定值 */
const VALID_VISIBILITIES = ['PRIVATE', 'FAMILY', 'SELECTED'] as const;
type ValidVisibility = (typeof VALID_VISIBILITIES)[number];

/** 合法的貼文狀態值 */
const VALID_STATUSES = ['DRAFT', 'PUBLISHED'] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 日期格式驗證 (YYYY-MM-DD) */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/posts/[id]
 *
 * 取得單篇貼文，含權限檢查。
 */
export const GET = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      author: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      audiences: {
        select: { userId: true },
      },
      media: {
        orderBy: { sortOrder: 'asc' },
      },
      _count: {
        select: {
          comments: { where: { deletedAt: null } },
          reactions: true,
        },
      },
    },
  });

  if (!post) {
    return NextResponse.json(
      { error: '貼文不存在' },
      { status: 404 },
    );
  }

  // ── 權限檢查 ────────────────────────────────────────
  const audienceUserIds = post.audiences.map((a) => a.userId);
  if (!canViewPost(user, post, audienceUserIds)) {
    return NextResponse.json(
      { error: '無權存取此貼文' },
      { status: 403 },
    );
  }

  return NextResponse.json({
    post: {
      id: post.id,
      authorId: post.authorId,
      author: post.author,
      recordDate: post.recordDate,
      title: post.title,
      subtitle: post.subtitle,
      bodyJson: post.bodyJson,
      bodyPlainText: post.bodyPlainText,
      visibility: post.visibility,
      status: post.status,
      version: post.version,
      publishedAt: post.publishedAt,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      audienceUserIds,
      commentCount: post._count.comments,
      reactionCount: post._count.reactions,
      media: post.media.map((m) => ({
        id: m.id,
        url: `/api/media/${m.id}`,
        filename: m.filename,
        mimeType: m.mimeType,
        fileSize: m.fileSize,
        width: m.width,
        height: m.height,
        sortOrder: m.sortOrder,
      })),
    },
  });
});

/**
 * PATCH /api/posts/[id]
 *
 * 編輯貼文（僅作者可操作）。
 *
 * Body (所有欄位皆可選):
 * - recordDate?: string (YYYY-MM-DD)
 * - title?: string (≤200 字)
 * - subtitle?: string | null (≤200 字)
 * - bodyJson?: string | null
 * - bodyPlainText?: string | null
 * - visibility?: Visibility
 * - status?: PostStatus
 * - audienceUserIds?: string[]
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  // ── 取得現有貼文 ────────────────────────────────────
  const existingPost = await prisma.post.findUnique({
    where: { id },
    include: {
      audiences: { select: { userId: true } },
    },
  });

  if (!existingPost) {
    return NextResponse.json(
      { error: '貼文不存在' },
      { status: 404 },
    );
  }

  // ── 權限檢查 ────────────────────────────────────────
  if (!canEditPost(user, existingPost)) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.POST_UPDATE,
      resourceType: ResourceTypes.POST,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json(
      { error: '無權編輯此貼文' },
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

  const {
    recordDate,
    title,
    subtitle,
    bodyJson,
    bodyPlainText,
    visibility,
    status,
    audienceUserIds,
    mediaIds,
  } = body as Record<string, unknown>;

  // ── 構建更新資料 ────────────────────────────────────
  const updateData: Record<string, unknown> = {};

  // recordDate
  if (recordDate !== undefined) {
    if (typeof recordDate !== 'string' || !DATE_PATTERN.test(recordDate)) {
      return NextResponse.json(
        { error: 'recordDate 格式為 YYYY-MM-DD' },
        { status: 400 },
      );
    }
    const parsedDate = new Date(recordDate + 'T00:00:00Z');
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { error: '無效的日期' },
        { status: 400 },
      );
    }
    updateData.recordDate = parsedDate;
  }

  // title
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: '標題不可為空' },
        { status: 400 },
      );
    }
    if (title.trim().length > 200) {
      return NextResponse.json(
        { error: '標題長度上限 200 字' },
        { status: 400 },
      );
    }
    updateData.title = title.trim();
  }

  // subtitle
  if (subtitle !== undefined) {
    if (subtitle === null) {
      updateData.subtitle = null;
    } else if (typeof subtitle !== 'string') {
      return NextResponse.json(
        { error: '副標題格式不正確' },
        { status: 400 },
      );
    } else if (subtitle.length > 200) {
      return NextResponse.json(
        { error: '副標題長度上限 200 字' },
        { status: 400 },
      );
    } else {
      updateData.subtitle = subtitle.trim();
    }
  }

  // bodyJson
  if (bodyJson !== undefined) {
    if (bodyJson !== null && typeof bodyJson !== 'string') {
      return NextResponse.json(
        { error: 'bodyJson 格式不正確' },
        { status: 400 },
      );
    }
    updateData.bodyJson = bodyJson;
  }

  // bodyPlainText
  if (bodyPlainText !== undefined) {
    if (bodyPlainText !== null && typeof bodyPlainText !== 'string') {
      return NextResponse.json(
        { error: 'bodyPlainText 格式不正確' },
        { status: 400 },
      );
    }
    updateData.bodyPlainText = bodyPlainText;
  }

  // visibility
  const newVisibility = (visibility as ValidVisibility) ?? existingPost.visibility;
  if (visibility !== undefined) {
    if (!VALID_VISIBILITIES.includes(newVisibility)) {
      return NextResponse.json(
        { error: '無效的隱私設定，可用值：PRIVATE, FAMILY, SELECTED' },
        { status: 400 },
      );
    }
    updateData.visibility = newVisibility;
  }

  // status
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status as ValidStatus)) {
      return NextResponse.json(
        { error: '無效的貼文狀態，可用值：DRAFT, PUBLISHED' },
        { status: 400 },
      );
    }
    updateData.status = status;

    // 首次發布設定 publishedAt
    if (status === 'PUBLISHED' && !existingPost.publishedAt) {
      updateData.publishedAt = new Date();
    }
  }

  // 版本遞增
  updateData.version = existingPost.version + 1;

  // ── 處理 audienceUserIds ────────────────────────────
  const effectiveVisibility = newVisibility;
  let validAudienceIds: string[] = [];

  if (effectiveVisibility === 'SELECTED') {
    if (audienceUserIds !== undefined) {
      if (!Array.isArray(audienceUserIds) || audienceUserIds.length === 0) {
        return NextResponse.json(
          { error: '指定家人模式必須提供至少一位指定對象' },
          { status: 400 },
        );
      }

      for (const uid of audienceUserIds) {
        if (typeof uid !== 'string' || !UUID_PATTERN.test(uid)) {
          return NextResponse.json(
            { error: '指定對象的 ID 格式不正確' },
            { status: 400 },
          );
        }
      }

      validAudienceIds = [...new Set(audienceUserIds as string[])].filter(
        (uid) => uid !== user.id,
      );

      const existingUsers = await prisma.user.findMany({
        where: {
          id: { in: validAudienceIds },
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      const existingIds = new Set(existingUsers.map((u) => u.id));
      const invalidIds = validAudienceIds.filter((uid) => !existingIds.has(uid));

      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: '部分指定對象不存在或已停用' },
          { status: 400 },
        );
      }
    }
  }

  // ── 驗證 mediaIds ──────────────────────────────────
  let validMediaIds: string[] | undefined;

  if (mediaIds !== undefined) {
    if (mediaIds === null) {
      // null 表示清除所有媒體
      validMediaIds = [];
    } else if (!Array.isArray(mediaIds)) {
      return NextResponse.json(
        { error: 'mediaIds 必須是陣列' },
        { status: 400 },
      );
    } else {
      if (mediaIds.length > 9) {
        return NextResponse.json(
          { error: '每篇貼文最多 9 張圖片' },
          { status: 400 },
        );
      }

      for (const mid of mediaIds) {
        if (typeof mid !== 'string' || !UUID_PATTERN.test(mid)) {
          return NextResponse.json(
            { error: '媒體 ID 格式不正確' },
            { status: 400 },
          );
        }
      }

      validMediaIds = [...new Set(mediaIds as string[])];

      if (validMediaIds.length > 0) {
        // 驗證所有 media 都屬於當前使用者，且 postId 為 null 或已屬於此貼文
        const ownedMedia = await prisma.postMedia.findMany({
          where: {
            id: { in: validMediaIds },
            uploaderId: user.id,
            OR: [
              { postId: null },
              { postId: id },
            ],
          },
          select: { id: true },
        });

        const ownedIds = new Set(ownedMedia.map((m) => m.id));
        const invalidMediaIds = validMediaIds.filter((mid) => !ownedIds.has(mid));

        if (invalidMediaIds.length > 0) {
          return NextResponse.json(
            { error: '部分媒體不存在、不屬於您、或已被關聯至其他貼文' },
            { status: 400 },
          );
        }
      }
    }
  }

  // ── 更新貼文 ────────────────────────────────────────
  const updatedPost = await prisma.$transaction(async (tx) => {
    // 如果 visibility 改變或有新的 audienceUserIds，更新 audiences
    const needUpdateAudiences =
      (visibility !== undefined && effectiveVisibility !== existingPost.visibility) ||
      (effectiveVisibility === 'SELECTED' && audienceUserIds !== undefined);

    if (needUpdateAudiences) {
      // 刪除舊的 audiences
      await tx.postAudience.deleteMany({ where: { postId: id } });

      // 如果是 SELECTED，建立新的 audiences
      if (effectiveVisibility === 'SELECTED' && validAudienceIds.length > 0) {
        await tx.postAudience.createMany({
          data: validAudienceIds.map((userId) => ({ postId: id, userId })),
        });
      }
    }

    // 如果提供了 mediaIds，更新 media 關聯
    if (validMediaIds !== undefined) {
      // 先將舊的 media 解除關聯（不刪除實際檔案）
      await tx.postMedia.updateMany({
        where: { postId: id },
        data: { postId: null, sortOrder: 0 },
      });

      // 關聯新的 media
      for (let i = 0; i < validMediaIds.length; i++) {
        await tx.postMedia.update({
          where: { id: validMediaIds[i] },
          data: { postId: id, sortOrder: i },
        });
      }
    }

    return tx.post.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        audiences: {
          select: { userId: true },
        },
        media: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: {
            comments: { where: { deletedAt: null } },
            reactions: true,
          },
        },
      },
    });
  });

  // ── 稽核 ────────────────────────────────────────────
  await logAudit({
    actorId: user.id,
    action: AuditActions.POST_UPDATE,
    resourceType: ResourceTypes.POST,
    resourceId: id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({
    post: {
      id: updatedPost.id,
      authorId: updatedPost.authorId,
      author: updatedPost.author,
      recordDate: updatedPost.recordDate,
      title: updatedPost.title,
      subtitle: updatedPost.subtitle,
      bodyJson: updatedPost.bodyJson,
      bodyPlainText: updatedPost.bodyPlainText,
      visibility: updatedPost.visibility,
      status: updatedPost.status,
      version: updatedPost.version,
      publishedAt: updatedPost.publishedAt,
      createdAt: updatedPost.createdAt,
      updatedAt: updatedPost.updatedAt,
      audienceUserIds: updatedPost.audiences.map((a) => a.userId),
      commentCount: updatedPost._count.comments,
      reactionCount: updatedPost._count.reactions,
      media: updatedPost.media.map((m) => ({
        id: m.id,
        url: `/api/media/${m.id}`,
        filename: m.filename,
        mimeType: m.mimeType,
        fileSize: m.fileSize,
        width: m.width,
        height: m.height,
        sortOrder: m.sortOrder,
      })),
    },
  });
});

/**
 * DELETE /api/posts/[id]
 *
 * 軟刪除貼文（僅作者可操作）。
 * 設定 deletedAt 而非實際刪除資料。
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  const post = await prisma.post.findUnique({
    where: { id },
  });

  if (!post) {
    return NextResponse.json(
      { error: '貼文不存在' },
      { status: 404 },
    );
  }

  // ── 權限檢查 ────────────────────────────────────────
  if (!canDeletePost(user, post)) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.POST_DELETE,
      resourceType: ResourceTypes.POST,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json(
      { error: '無權刪除此貼文' },
      { status: 403 },
    );
  }

  // ── 軟刪除 ──────────────────────────────────────────
  await prisma.post.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  // ── 稽核 ────────────────────────────────────────────
  await logAudit({
    actorId: user.id,
    action: AuditActions.POST_DELETE,
    resourceType: ResourceTypes.POST,
    resourceId: id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({ success: true });
});
