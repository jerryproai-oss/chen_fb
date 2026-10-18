import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/posts/[id]/comments/[commentId]
 *
 * 軟刪除留言。
 * 可以刪除的人：留言作者 或 貼文作者。
 */
export const DELETE = withAuth(
  async ({ user }, _req: NextRequest, routeCtx) => {
    const params = await routeCtx.params;
    const postId = params.id;
    const commentId = params.commentId;

    if (!UUID_PATTERN.test(postId)) {
      return NextResponse.json(
        { error: '無效的貼文 ID 格式' },
        { status: 400 },
      );
    }

    if (!UUID_PATTERN.test(commentId)) {
      return NextResponse.json(
        { error: '無效的留言 ID 格式' },
        { status: 400 },
      );
    }

    // ── 取得留言 ──────────────────────────────────────
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        post: {
          select: { id: true, authorId: true },
        },
      },
    });

    if (!comment || comment.deletedAt !== null) {
      return NextResponse.json(
        { error: '留言不存在' },
        { status: 404 },
      );
    }

    // 確認留言屬於指定的貼文
    if (comment.postId !== postId) {
      return NextResponse.json(
        { error: '留言不屬於此貼文' },
        { status: 404 },
      );
    }

    // ── 權限檢查：留言作者或貼文作者 ─────────────────
    const isCommentAuthor = comment.authorId === user.id;
    const isPostAuthor = comment.post.authorId === user.id;

    if (!isCommentAuthor && !isPostAuthor) {
      await logAudit({
        actorId: user.id,
        action: AuditActions.COMMENT_DELETE,
        resourceType: ResourceTypes.COMMENT,
        resourceId: commentId,
        outcome: Outcomes.DENIED,
      });
      return NextResponse.json(
        { error: '無權刪除此留言' },
        { status: 403 },
      );
    }

    // ── 軟刪除 ────────────────────────────────────────
    await prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    // ── 稽核 ──────────────────────────────────────────
    await logAudit({
      actorId: user.id,
      action: AuditActions.COMMENT_DELETE,
      resourceType: ResourceTypes.COMMENT,
      resourceId: commentId,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ success: true });
  },
);
