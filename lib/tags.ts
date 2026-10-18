import type { Prisma } from '@prisma/client';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/**
 * 從文字中提取 Hashtag。
 * 規則：
 * - 匹配 #[\u4e00-\u9fff\w]+ (支援中文和英文 tag)
 * - 最多 10 個 tag
 * - 去除重複（以 slug / 小寫為準）
 */
export function extractHashtags(text: string | null | undefined): string[] {
  if (!text) return [];

  const regex = /#([\u4e00-\u9fff\w]+)/g;
  const tags: string[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawName = match[1].trim();
    if (!rawName) continue;

    const lower = rawName.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      tags.push(rawName);
      if (tags.length >= 10) break;
    }
  }

  return tags;
}

/**
 * 根據 Tag 名稱生成 Slug。
 * 規則：英文轉小寫，中文保留原樣。
 */
export function slugifyTag(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * 同步貼文的標籤關聯。
 * 1. 從 bodyPlainText 提取 hashtag
 * 2. 刪除貼文舊的 PostTag
 * 3. 尋找或建立 Tag 記錄
 * 4. 建立新的 PostTag 關聯
 */
export async function syncPostTags(
  tx: Prisma.TransactionClient,
  postId: string,
  bodyPlainText: string | null | undefined,
  actorId?: string,
): Promise<string[]> {
  const tagNames = extractHashtags(bodyPlainText);

  // 刪除既有的標籤關聯
  await tx.postTag.deleteMany({
    where: { postId },
  });

  if (tagNames.length === 0) {
    return [];
  }

  for (const name of tagNames) {
    const slug = slugifyTag(name);

    // 查找是否已存在該 tag（以 slug 或 name 查找）
    let tag = await tx.tag.findFirst({
      where: {
        OR: [{ slug }, { name }],
      },
    });

    if (!tag) {
      tag = await tx.tag.create({
        data: {
          name,
          slug,
        },
      });

      // 記錄稽核日誌
      logAudit({
        actorId,
        action: AuditActions.TAG_CREATE,
        resourceType: ResourceTypes.TAG,
        resourceId: tag.id,
        outcome: Outcomes.SUCCESS,
      }).catch(console.error);
    }

    // 建立貼文與標籤的關聯
    await tx.postTag.create({
      data: {
        postId,
        tagId: tag.id,
      },
    });
  }

  return tagNames;
}
