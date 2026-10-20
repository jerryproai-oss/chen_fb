import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { syncPostTags } from '@/lib/tags';

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

/** 色碼 Hex 格式驗證 (#RGB 或 #RRGGBB) */
const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * GET /api/posts
 *
 * 取得目前使用者自己的貼文列表（含草稿）。
 * 支援 cursor-based 分頁。
 *
 * Query params:
 * - cursor: 上一頁最後一篇貼文的 ID
 * - limit: 每頁筆數 (1-50, 預設 20)
 * - status: 篩選貼文狀態 (DRAFT | PUBLISHED)
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);

  // ── 分頁參數 ────────────────────────────────────────
  const cursor = searchParams.get('cursor');
  const limitParam = searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 50);

  if (cursor && !UUID_PATTERN.test(cursor)) {
    return NextResponse.json(
      { error: '無效的 cursor 格式' },
      { status: 400 },
    );
  }

  // ── 狀態篩選 ────────────────────────────────────────
  const statusFilter = searchParams.get('status');
  if (statusFilter && !VALID_STATUSES.includes(statusFilter as ValidStatus)) {
    return NextResponse.json(
      { error: '無效的 status 篩選值，可用值：DRAFT, PUBLISHED' },
      { status: 400 },
    );
  }

  // ── 查詢 ────────────────────────────────────────────
  const where: Record<string, unknown> = {
    authorId: user.id,
    deletedAt: null,
  };

  if (statusFilter) {
    where.status = statusFilter;
  }

  const posts = await prisma.post.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // 多取一筆判斷是否還有下一頁
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1, // 跳過 cursor 本身
        }
      : {}),
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
      poll: {
        select: { id: true },
      },
      tags: {
        include: { tag: true },
      },
      _count: {
        select: {
          comments: { where: { deletedAt: null } },
          reactions: true,
        },
      },
    },
  });

  const hasMore = posts.length > limit;
  const resultPosts = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore ? resultPosts[resultPosts.length - 1].id : null;

  return NextResponse.json({
    posts: resultPosts.map((p) => ({
      id: p.id,
      authorId: p.authorId,
      author: p.author,
      recordDate: p.recordDate,
      title: p.title,
      subtitle: p.subtitle,
      bodyJson: p.bodyJson,
      bodyPlainText: p.bodyPlainText,
      visibility: p.visibility,
      status: p.status,
      version: p.version,
      publishedAt: p.publishedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      audienceUserIds: p.audiences.map((a) => a.userId),
      commentCount: p._count.comments,
      reactionCount: p._count.reactions,
      media: p.media.map((m) => ({
        id: m.id,
        url: `/api/media/${m.id}`,
        filename: m.filename,
        mimeType: m.mimeType,
        fileSize: m.fileSize,
        width: m.width,
        height: m.height,
        sortOrder: m.sortOrder,
      })),
      hasPoll: !!p.poll,
      pinnedAt: p.pinnedAt,
      locationName: p.locationName,
      bgColor: p.bgColor,
      isMilestone: p.isMilestone,
      milestoneType: p.milestoneType,
      tags: p.tags.map((pt) => pt.tag.name),
    })),
    nextCursor,
  });
});

/**
 * POST /api/posts
 *
 * 建立新貼文。
 *
 * Body:
 * - recordDate: string (YYYY-MM-DD, 必填)
 * - title: string (必填, ≤200 字)
 * - subtitle?: string (≤200 字)
 * - bodyJson?: string (結構化內容)
 * - bodyPlainText?: string (純文字)
 * - visibility?: Visibility (預設 PRIVATE)
 * - status?: PostStatus (預設 DRAFT)
 * - audienceUserIds?: string[] (SELECTED 模式時的指定家人)
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
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
    poll,
    locationName,
    bgColor,
    isMilestone,
    milestoneType,
  } = body as Record<string, unknown>;

  // ── 驗證 recordDate ─────────────────────────────────
  if (typeof recordDate !== 'string' || !DATE_PATTERN.test(recordDate)) {
    return NextResponse.json(
      { error: 'recordDate 為必填，格式為 YYYY-MM-DD' },
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

  // ── 驗證 title ──────────────────────────────────────
  // 標題為選填，但標題+內容+媒體至少需要一項
  if (title !== undefined && title !== null && typeof title === 'string' && title.trim().length > 200) {
    return NextResponse.json(
      { error: '標題長度上限 200 字' },
      { status: 400 },
    );
  }

  const trimmedTitle = (typeof title === 'string' ? title.trim() : '') || '';
  const hasBody = typeof bodyPlainText === 'string' && bodyPlainText.trim().length > 0;
  const hasMediaIds = Array.isArray(mediaIds) && mediaIds.length > 0;

  if (!trimmedTitle && !hasBody && !hasMediaIds) {
    return NextResponse.json(
      { error: '請填寫標題、內容或上傳媒體（至少需要一項）' },
      { status: 400 },
    );
  }

  // ── 驗證 subtitle ──────────────────────────────────
  if (subtitle !== undefined && subtitle !== null) {
    if (typeof subtitle !== 'string') {
      return NextResponse.json(
        { error: '副標題格式不正確' },
        { status: 400 },
      );
    }
    if (subtitle.length > 200) {
      return NextResponse.json(
        { error: '副標題長度上限 200 字' },
        { status: 400 },
      );
    }
  }

  // ── 驗證 bodyJson ──────────────────────────────────
  if (bodyJson !== undefined && bodyJson !== null && typeof bodyJson !== 'string') {
    return NextResponse.json(
      { error: 'bodyJson 格式不正確' },
      { status: 400 },
    );
  }

  // ── 驗證 bodyPlainText ─────────────────────────────
  if (bodyPlainText !== undefined && bodyPlainText !== null && typeof bodyPlainText !== 'string') {
    return NextResponse.json(
      { error: 'bodyPlainText 格式不正確' },
      { status: 400 },
    );
  }

  // ── 驗證 visibility ────────────────────────────────
  const postVisibility: ValidVisibility =
    (visibility as ValidVisibility) ?? 'PRIVATE';

  if (!VALID_VISIBILITIES.includes(postVisibility)) {
    return NextResponse.json(
      { error: '無效的隱私設定，可用值：PRIVATE, FAMILY, SELECTED' },
      { status: 400 },
    );
  }

  // ── 驗證 status ────────────────────────────────────
  const postStatus: ValidStatus =
    (status as ValidStatus) ?? 'DRAFT';

  if (!VALID_STATUSES.includes(postStatus)) {
    return NextResponse.json(
      { error: '無效的貼文狀態，可用值：DRAFT, PUBLISHED' },
      { status: 400 },
    );
  }

  // ── 驗證 locationName ──────────────────────────────
  if (locationName !== undefined && locationName !== null) {
    if (typeof locationName !== 'string') {
      return NextResponse.json(
        { error: '地點名稱格式不正確' },
        { status: 400 },
      );
    }
    if (locationName.trim().length > 100) {
      return NextResponse.json(
        { error: '地點名稱長度上限 100 字' },
        { status: 400 },
      );
    }
  }

  // ── 驗證 bgColor ───────────────────────────────────
  if (bgColor !== undefined && bgColor !== null) {
    if (typeof bgColor !== 'string' || !HEX_COLOR_PATTERN.test(bgColor)) {
      return NextResponse.json(
        { error: '無效的背景色色碼格式，需為 Hex 格式（例如 #FFF8DC）' },
        { status: 400 },
      );
    }
  }

  // ── 驗證 isMilestone & milestoneType ──────────────
  if (isMilestone !== undefined && typeof isMilestone !== 'boolean') {
    return NextResponse.json(
      { error: 'isMilestone 必須為布林值' },
      { status: 400 },
    );
  }

  if (milestoneType !== undefined && milestoneType !== null) {
    if (typeof milestoneType !== 'string') {
      return NextResponse.json(
        { error: '里程碑類型格式不正確' },
        { status: 400 },
      );
    }
    if (milestoneType.trim().length > 50) {
      return NextResponse.json(
        { error: '里程碑類型長度上限 50 字' },
        { status: 400 },
      );
    }
  }

  // ── 驗證 audienceUserIds ───────────────────────────
  let validAudienceIds: string[] = [];

  if (postVisibility === 'SELECTED') {
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

    // 去重並排除自己
    validAudienceIds = [...new Set(audienceUserIds as string[])].filter(
      (id) => id !== user.id,
    );

    // 驗證指定的使用者都存在且 ACTIVE
    const existingUsers = await prisma.user.findMany({
      where: {
        id: { in: validAudienceIds },
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    const existingIds = new Set(existingUsers.map((u) => u.id));
    const invalidIds = validAudienceIds.filter((id) => !existingIds.has(id));

    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: '部分指定對象不存在或已停用' },
        { status: 400 },
      );
    }
  }

  // ── 驗證 mediaIds ──────────────────────────────────
  let validMediaIds: string[] = [];

  if (mediaIds !== undefined && mediaIds !== null) {
    if (!Array.isArray(mediaIds)) {
      return NextResponse.json(
        { error: 'mediaIds 必須是陣列' },
        { status: 400 },
      );
    }

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

    // 驗證所有 media 都屬於當前使用者且 postId 為 null
    const ownedMedia = await prisma.postMedia.findMany({
      where: {
        id: { in: validMediaIds },
        uploaderId: user.id,
        postId: null,
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

  // ── 建立貼文 ────────────────────────────────────────
  const now = new Date();

  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        authorId: user.id,
        recordDate: parsedDate,
        title: trimmedTitle || '無標題',
        subtitle: subtitle ? (subtitle as string).trim() : null,
        bodyJson: (bodyJson as string) ?? null,
        bodyPlainText: (bodyPlainText as string) ?? null,
        visibility: postVisibility,
        status: postStatus,
        publishedAt: postStatus === 'PUBLISHED' ? now : null,
        locationName:
          typeof locationName === 'string' && locationName.trim().length > 0
            ? locationName.trim()
            : null,
        bgColor:
          typeof bgColor === 'string' && HEX_COLOR_PATTERN.test(bgColor)
            ? bgColor
            : null,
        isMilestone: isMilestone === true,
        milestoneType:
          isMilestone === true &&
          typeof milestoneType === 'string' &&
          milestoneType.trim().length > 0
            ? milestoneType.trim()
            : null,
        audiences:
          postVisibility === 'SELECTED' && validAudienceIds.length > 0
            ? {
                create: validAudienceIds.map((userId) => ({ userId })),
              }
            : undefined,
      },
    });

    // 關聯媒體
    if (validMediaIds.length > 0) {
      for (let i = 0; i < validMediaIds.length; i++) {
        await tx.postMedia.update({
          where: { id: validMediaIds[i] },
          data: { postId: created.id, sortOrder: i },
        });
      }
    }

    // 建立投票
    if (poll && typeof poll === 'object' && !Array.isArray(poll)) {
      const pollData = poll as Record<string, unknown>;
      const question = pollData.question;
      const options = pollData.options;
      const multiSelect = pollData.multiSelect === true;
      const endsAt = pollData.endsAt;

      if (typeof question === 'string' && question.trim().length > 0
          && Array.isArray(options) && options.length >= 2 && options.length <= 10) {
        // 驗證每個選項至少有文字
        const validOptions = options.filter(
          (o: unknown) => typeof o === 'object' && o !== null
            && typeof (o as Record<string, unknown>).text === 'string'
            && ((o as Record<string, unknown>).text as string).trim().length > 0,
        );

        if (validOptions.length >= 2) {
          await tx.poll.create({
            data: {
              postId: created.id,
              question: question.trim(),
              multiSelect,
              endsAt: endsAt && typeof endsAt === 'string' ? new Date(endsAt) : null,
              options: {
                create: validOptions.map((o: unknown, i: number) => {
                  const opt = o as Record<string, unknown>;
                  return {
                    text: (opt.text as string).trim(),
                    description: opt.description && typeof opt.description === 'string'
                      ? (opt.description as string).trim() : null,
                    imageUrl: opt.imageMediaId && typeof opt.imageMediaId === 'string'
                      ? `/api/media/${opt.imageMediaId}` : null,
                    linkUrl: opt.linkUrl && typeof opt.linkUrl === 'string'
                      ? (opt.linkUrl as string).trim() : null,
                    sortOrder: i,
                  };
                }),
              },
            },
          });
        }
      }
    }

    // 同步 Hashtag 標籤
    await syncPostTags(
      tx,
      created.id,
      typeof bodyPlainText === 'string' ? bodyPlainText : undefined,
      user.id,
    );

    return tx.post.findUniqueOrThrow({
      where: { id: created.id },
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
        poll: {
          select: { id: true },
        },
        tags: {
          include: { tag: true },
        },
      },
    });
  });

  // ── 稽核 ────────────────────────────────────────────
  await logAudit({
    actorId: user.id,
    action: AuditActions.POST_CREATE,
    resourceType: ResourceTypes.POST,
    resourceId: post.id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json(
    {
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
        audienceUserIds: post.audiences.map((a) => a.userId),
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
        hasPoll: !!post.poll,
        pinnedAt: post.pinnedAt,
        locationName: post.locationName,
        bgColor: post.bgColor,
        isMilestone: post.isMilestone,
        milestoneType: post.milestoneType,
        tags: post.tags.map((pt) => pt.tag.name),
      },
    },
    { status: 201 },
  );
});

