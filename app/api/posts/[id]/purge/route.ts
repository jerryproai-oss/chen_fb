import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { deleteByStoragePath } from '@/lib/google-drive';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/posts/[id]/purge
 *
 * 永久刪除貼文（硬刪除）。
 * 只能刪除已軟刪除的貼文（deletedAt IS NOT NULL）。
 * 權限：只有貼文作者或 ADMIN 可操作。
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

  // 只能永久刪除已軟刪除的貼文
  if (!post.deletedAt) {
    return NextResponse.json(
      { error: '只能永久刪除已在回收桶中的貼文' },
      { status: 400 },
    );
  }

  // 權限檢查：只有作者或 ADMIN 可永久刪除
  if (post.authorId !== user.id && user.role !== 'ADMIN') {
    await logAudit({
      actorId: user.id,
      action: AuditActions.POST_PURGE,
      resourceType: ResourceTypes.POST,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json(
      { error: '無權永久刪除此貼文' },
      { status: 403 },
    );
  }

  // 在 transaction 中刪除所有關聯資料
  let mediaPaths: string[] = [];

  try {
    mediaPaths = await prisma.$transaction(async (tx) => {
      // 1. 刪除 PostAudience 記錄
      await tx.postAudience.deleteMany({ where: { postId: id } });

      // 2. 刪除 PostReaction 記錄
      await tx.postReaction.deleteMany({ where: { postId: id } });

      // 3-5. 刪除 Poll 相關記錄（如果有的話）
      const poll = await tx.poll.findUnique({
        where: { postId: id },
        select: { id: true },
      });

      if (poll) {
        // 3. 刪除 PollVote
        await tx.pollVote.deleteMany({
          where: { option: { pollId: poll.id } },
        });
        // 4. 刪除 PollOption
        await tx.pollOption.deleteMany({ where: { pollId: poll.id } });
        // 5. 刪除 Poll
        await tx.poll.delete({ where: { id: poll.id } });
      }

      // 6. 刪除 Comment 記錄
      await tx.comment.deleteMany({ where: { postId: id } });

      // 7. 刪除相關 Notification（COMMENT 或 REACTION 類型）
      await tx.notification.deleteMany({
        where: {
          resourceId: id,
          type: { in: ['COMMENT', 'REACTION'] },
        },
      });

      // 8. 刪除 Bookmark 記錄
      await tx.postBookmark.deleteMany({ where: { postId: id } });

      // 9. 刪除 PostTag 記錄
      await tx.postTag.deleteMany({ where: { postId: id } });

      // 10. 取得 PostMedia 的 storagePath，然後刪除 PostMedia 記錄
      const mediaRecords = await tx.postMedia.findMany({
        where: { postId: id },
        select: { storagePath: true },
      });

      const paths = mediaRecords.map((m) => m.storagePath);

      await tx.postMedia.deleteMany({ where: { postId: id } });

      // 11. 刪除 Post 記錄
      await tx.post.delete({ where: { id } });

      return paths;
    });
  } catch (error) {
    console.error('永久刪除貼文失敗:', (error as Error).message);
    return NextResponse.json(
      { error: '永久刪除貼文失敗' },
      { status: 500 },
    );
  }

  // 12. 刪除 Google Drive 上的媒體檔案（在 transaction 成功後執行）
  for (const storagePath of mediaPaths) {
    try {
      await deleteByStoragePath(storagePath);
    } catch (error) {
      // 刪除失敗不阻擋流程
      console.error('刪除媒體檔案失敗:', (error as Error).message);
    }
  }

  // 稽核
  await logAudit({
    actorId: user.id,
    action: AuditActions.POST_PURGE,
    resourceType: ResourceTypes.POST,
    resourceId: id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({ success: true });
});
