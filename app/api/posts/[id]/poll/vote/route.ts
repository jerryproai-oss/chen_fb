import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { canViewPost } from '@/lib/policy/post-authorization';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /api/posts/[id]/poll/vote
 *
 * 投票。支援單選和多選。
 * Body: { optionIds: string[] }
 */
export const PUT = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  // 解析 body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: '無效的請求格式' },
      { status: 400 },
    );
  }

  const { optionIds } = body as Record<string, unknown>;

  if (!Array.isArray(optionIds) || optionIds.length === 0) {
    return NextResponse.json(
      { error: '請選擇至少一個選項' },
      { status: 400 },
    );
  }

  for (const oid of optionIds) {
    if (typeof oid !== 'string' || !UUID_PATTERN.test(oid)) {
      return NextResponse.json(
        { error: '選項 ID 格式不正確' },
        { status: 400 },
      );
    }
  }

  // 取得貼文 + poll
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      audiences: { select: { userId: true } },
      poll: {
        include: {
          options: { select: { id: true } },
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

  // 權限檢查
  const audienceUserIds = post.audiences.map((a) => a.userId);
  if (!canViewPost(user, post, audienceUserIds)) {
    return NextResponse.json(
      { error: '無權存取此貼文' },
      { status: 403 },
    );
  }

  if (!post.poll) {
    return NextResponse.json(
      { error: '此貼文沒有投票' },
      { status: 404 },
    );
  }

  const poll = post.poll;

  // 檢查是否已過期或已關閉
  if ((poll.endsAt && new Date() > poll.endsAt) || poll.closedAt) {
    return NextResponse.json(
      { error: '此投票已結束' },
      { status: 400 },
    );
  }

  // 驗證 optionIds 都屬於此 poll
  const validOptionIds = new Set(poll.options.map((o) => o.id));
  const uniqueOptionIds = [...new Set(optionIds as string[])];
  const invalidIds = uniqueOptionIds.filter((oid) => !validOptionIds.has(oid));
  if (invalidIds.length > 0) {
    return NextResponse.json(
      { error: '部分選項不屬於此投票' },
      { status: 400 },
    );
  }

  // 單選只能選一個
  if (!poll.multiSelect && uniqueOptionIds.length > 1) {
    return NextResponse.json(
      { error: '此投票為單選，只能選擇一個選項' },
      { status: 400 },
    );
  }

  // Transaction：先刪舊投票，再建新投票
  await prisma.$transaction(async (tx) => {
    // 刪除使用者在此 poll 的所有舊投票
    const allOptionIds = poll.options.map((o) => o.id);
    await tx.pollVote.deleteMany({
      where: {
        optionId: { in: allOptionIds },
        userId: user.id,
      },
    });

    // 建立新投票
    await tx.pollVote.createMany({
      data: uniqueOptionIds.map((optionId) => ({
        optionId,
        userId: user.id,
      })),
    });
  });

  // 稽核
  await logAudit({
    actorId: user.id,
    action: AuditActions.POLL_VOTE,
    resourceType: ResourceTypes.POLL,
    resourceId: poll.id,
    outcome: Outcomes.SUCCESS,
  });

  // 發送投票通知給貼文作者
  if (post.authorId !== user.id) {
    const actorName = user.displayName || '有人';
    prisma.notification
      .create({
        data: {
          userId: post.authorId,
          actorId: user.id,
          type: 'POLL_VOTE',
          title: `${actorName} 在你的投票中投了票`,
          body: poll.question.slice(0, 100),
          linkUrl: `/posts/${id}`,
          resourceId: id,
        },
      })
      .catch((err: unknown) => console.error('[poll-vote] 通知建立失敗:', err));
  }

  return NextResponse.json({ success: true });
});

/**
 * DELETE /api/posts/[id]/poll/vote
 *
 * 取消投票。
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
    include: {
      audiences: { select: { userId: true } },
      poll: {
        include: {
          options: { select: { id: true } },
        },
      },
    },
  });

  if (!post || !post.poll) {
    return NextResponse.json(
      { error: '貼文或投票不存在' },
      { status: 404 },
    );
  }

  // 權限檢查
  const audienceUserIds = post.audiences.map((a) => a.userId);
  if (!canViewPost(user, post, audienceUserIds)) {
    return NextResponse.json(
      { error: '無權存取此貼文' },
      { status: 403 },
    );
  }

  const poll = post.poll;

  // 檢查是否已過期或已關閉
  if ((poll.endsAt && new Date() > poll.endsAt) || poll.closedAt) {
    return NextResponse.json(
      { error: '此投票已結束，無法取消' },
      { status: 400 },
    );
  }

  // 刪除使用者的所有投票
  const allOptionIds = poll.options.map((o) => o.id);
  await prisma.pollVote.deleteMany({
    where: {
      optionId: { in: allOptionIds },
      userId: user.id,
    },
  });

  return NextResponse.json({ success: true });
});
