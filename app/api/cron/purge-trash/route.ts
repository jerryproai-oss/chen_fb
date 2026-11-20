import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { deleteByStoragePath } from '@/lib/google-drive';

/**
 * GET /api/cron/purge-trash
 *
 * 自動清理回收桶：永久刪除 deletedAt 超過 30 天的貼文。
 * 包含：PostMedia（Google Drive 檔案）、PostAudience、PostReaction、
 *       Poll（PollVote + PollOption）、Comment、Notification、PostBookmark、PostTag。
 *
 * 安全性：透過 Vercel Cron Secret 或環境變數 CRON_SECRET 驗證。
 * Vercel Cron 會自動帶 `Authorization: Bearer <CRON_SECRET>` header。
 */

const RETENTION_DAYS = 30;
const BATCH_SIZE = 20; // 每批處理的貼文數，避免 serverless timeout

export const maxDuration = 300; // 5 分鐘

export async function GET(req: NextRequest) {
  // ── 驗證 Cron Secret ─────────────────────────────────
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: '未授權' },
        { status: 401 },
      );
    }
  } else {
    // 無 CRON_SECRET 時，僅允許本地開發環境
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: '缺少 CRON_SECRET 環境變數' },
        { status: 500 },
      );
    }
  }

  // ── 查詢超過 30 天的軟刪除貼文 ───────────────────────
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

  const expiredPosts = await prisma.post.findMany({
    where: {
      deletedAt: {
        not: null,
        lt: cutoffDate,
      },
    },
    select: {
      id: true,
      title: true,
    },
    take: BATCH_SIZE,
    orderBy: { deletedAt: 'asc' }, // 先清理最舊的
  });

  if (expiredPosts.length === 0) {
    return NextResponse.json({
      success: true,
      message: '回收桶中沒有超過 30 天的貼文',
      purged: 0,
    });
  }

  // ── 逐筆清理 ─────────────────────────────────────────
  let purgedCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (const post of expiredPosts) {
    let mediaPaths: string[] = [];

    try {
      mediaPaths = await prisma.$transaction(async (tx) => {
        // 1. 刪除 PostAudience
        await tx.postAudience.deleteMany({ where: { postId: post.id } });

        // 2. 刪除 PostReaction
        await tx.postReaction.deleteMany({ where: { postId: post.id } });

        // 3-5. 刪除 Poll 相關記錄
        const poll = await tx.poll.findUnique({
          where: { postId: post.id },
          select: { id: true },
        });

        if (poll) {
          await tx.pollVote.deleteMany({
            where: { option: { pollId: poll.id } },
          });
          await tx.pollOption.deleteMany({ where: { pollId: poll.id } });
          await tx.poll.delete({ where: { id: poll.id } });
        }

        // 6. 刪除 Comment
        await tx.comment.deleteMany({ where: { postId: post.id } });

        // 7. 刪除 Notification
        await tx.notification.deleteMany({
          where: {
            resourceId: post.id,
            type: { in: ['COMMENT', 'REACTION'] },
          },
        });

        // 8. 刪除 Bookmark
        await tx.postBookmark.deleteMany({ where: { postId: post.id } });

        // 9. 刪除 PostTag
        await tx.postTag.deleteMany({ where: { postId: post.id } });

        // 10. 取得 PostMedia storagePath，然後刪除
        const mediaRecords = await tx.postMedia.findMany({
          where: { postId: post.id },
          select: { storagePath: true },
        });

        const paths = mediaRecords.map((m) => m.storagePath);
        await tx.postMedia.deleteMany({ where: { postId: post.id } });

        // 11. 刪除 Post
        await tx.post.delete({ where: { id: post.id } });

        return paths;
      });

      purgedCount++;
    } catch (error) {
      errorCount++;
      const msg = `DB 刪除失敗 [${post.id}]: ${(error as Error).message}`;
      console.error('[cron/purge-trash]', msg);
      errors.push(msg);
      continue; // 繼續處理下一筆
    }

    // 12. 刪除 Google Drive 檔案（在 transaction 成功後）
    for (const storagePath of mediaPaths) {
      try {
        await deleteByStoragePath(storagePath);
      } catch (error) {
        const msg = `Drive 刪除失敗 [${storagePath}]: ${(error as Error).message}`;
        console.error('[cron/purge-trash]', msg);
        errors.push(msg);
        // 不阻擋流程
      }
    }
  }

  // ── 檢查是否還有剩餘待清理的 ─────────────────────────
  const remainingCount = await prisma.post.count({
    where: {
      deletedAt: {
        not: null,
        lt: cutoffDate,
      },
    },
  });

  console.log(
    `[cron/purge-trash] 完成：已清理 ${purgedCount} 篇，失敗 ${errorCount} 篇，剩餘 ${remainingCount} 篇`,
  );

  return NextResponse.json({
    success: true,
    purged: purgedCount,
    errors: errorCount,
    remaining: remainingCount,
    ...(errors.length > 0 ? { errorDetails: errors } : {}),
  });
}
