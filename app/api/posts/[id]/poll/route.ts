import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { canViewPost } from '@/lib/policy/post-authorization';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/posts/[id]/poll
 *
 * 取得貼文附屬的投票內容、結果、我的投票。
 * 結果隨時可見（不需投票後才能看）。
 * 不匿名（顯示投票人 displayName）。
 */
export const GET = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  // 查詢貼文 + poll
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      audiences: { select: { userId: true } },
      poll: {
        include: {
          options: {
            orderBy: { sortOrder: 'asc' },
            include: {
              votes: {
                include: {
                  user: {
                    select: { id: true, displayName: true },
                  },
                },
              },
            },
          },
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
  const now = new Date();
  const isExpired = (poll.endsAt ? now > poll.endsAt : false) || !!poll.closedAt;

  // 計算總票數（不重複使用者數）
  const allVoterIds = new Set<string>();
  poll.options.forEach((opt) => {
    opt.votes.forEach((v) => allVoterIds.add(v.userId));
  });
  const totalVotes = allVoterIds.size;

  // 多選時用總票數（所有選項得票加總）作為分母，讓百分比加總為 100%
  const totalVotesCast = poll.options.reduce((sum, opt) => sum + opt.votes.length, 0);

  // 我的投票
  const myVotes = poll.options
    .filter((opt) => opt.votes.some((v) => v.userId === user.id))
    .map((opt) => opt.id);

  return NextResponse.json({
    poll: {
      id: poll.id,
      question: poll.question,
      multiSelect: poll.multiSelect,
      endsAt: poll.endsAt,
      closedAt: poll.closedAt,
      isExpired,
      isAuthor: post.authorId === user.id,
      totalVotes,
      totalVotesCast,
      options: poll.options.map((opt) => ({
        id: opt.id,
        text: opt.text,
        description: opt.description,
        imageUrl: opt.imageUrl,
        linkUrl: opt.linkUrl,
        sortOrder: opt.sortOrder,
        voteCount: opt.votes.length,
        percentage: (() => {
          if (poll.multiSelect) {
            // 多選：以總票數為分母，百分比加總為 100%
            return totalVotesCast > 0
              ? Math.round((opt.votes.length / totalVotesCast) * 100)
              : 0;
          }
          // 單選：以不重複投票人數為分母
          return totalVotes > 0
            ? Math.round((opt.votes.length / totalVotes) * 100)
            : 0;
        })(),
        voters: opt.votes.map((v) => v.user.displayName),
      })),
      myVotes,
    },
  });
});

/**
 * PATCH /api/posts/[id]/poll
 *
 * 關閉投票（僅貼文作者可操作）。
 */
export const PATCH = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id: postId } = await routeCtx.params;

  if (!UUID_PATTERN.test(postId)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      poll: true,
    },
  });

  if (!post) {
    return NextResponse.json(
      { error: '貼文不存在' },
      { status: 404 },
    );
  }

  if (post.authorId !== user.id) {
    return NextResponse.json(
      { error: '只有貼文作者可以關閉投票' },
      { status: 403 },
    );
  }

  if (!post.poll) {
    return NextResponse.json(
      { error: '此貼文沒有投票' },
      { status: 404 },
    );
  }

  if (post.poll.closedAt) {
    return NextResponse.json(
      { error: '此投票已關閉' },
      { status: 400 },
    );
  }

  const updatedPoll = await prisma.poll.update({
    where: { id: post.poll.id },
    data: { closedAt: new Date() },
  });

  return NextResponse.json({
    success: true,
    closedAt: updatedPoll.closedAt,
  });
});
