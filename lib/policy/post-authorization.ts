import type { Visibility, PostStatus } from '@prisma/client';
import type { PolicyUser } from './authorization';

/**
 * 授權策略所需的最小貼文資訊。
 */
export interface PolicyPost {
  id: string;
  authorId: string;
  visibility: Visibility;
  status: PostStatus;
  deletedAt: Date | null;
}

/**
 * 檢查使用者是否可以閱讀指定貼文。
 *
 * 隱私規則：
 * - PRIVATE：僅作者本人可見（管理員不可繞過）
 * - FAMILY：所有 ACTIVE 使用者可見
 * - SELECTED：作者本人 + 被指定的家人可見
 *
 * 額外規則：
 * - 已刪除的貼文不可見（除非是作者自己）
 * - 草稿只有作者自己能看
 *
 * @param actor - 執行動作的使用者
 * @param post - 被存取的貼文
 * @param audienceUserIds - SELECTED 模式下被指定的使用者 ID 列表
 */
export function canViewPost(
  actor: PolicyUser,
  post: PolicyPost,
  audienceUserIds?: string[],
): boolean {
  // 作者永遠可以看到自己的貼文（含草稿、含已刪除）
  if (actor.id === post.authorId) return true;

  // 非作者不能看已刪除的貼文
  if (post.deletedAt !== null) return false;

  // 非作者不能看草稿
  if (post.status === 'DRAFT') return false;

  // 非 ACTIVE 使用者不能看任何人的貼文
  if (actor.status !== 'ACTIVE') return false;

  switch (post.visibility) {
    case 'PRIVATE':
      // 只有作者（上面已處理），其他人一律不可見
      return false;

    case 'FAMILY':
      // 所有 ACTIVE 使用者可見
      return true;

    case 'SELECTED':
      // 作者（已處理）+ 指定家人
      return audienceUserIds?.includes(actor.id) ?? false;

    default:
      return false;
  }
}

/**
 * 檢查使用者是否可以編輯指定貼文。
 * 只有作者可以編輯，且貼文不能已被刪除。
 */
export function canEditPost(actor: PolicyUser, post: PolicyPost): boolean {
  if (post.deletedAt !== null) return false;
  return actor.id === post.authorId;
}

/**
 * 檢查使用者是否可以刪除指定貼文。
 * 只有作者可以刪除，且貼文不能已被刪除。
 */
export function canDeletePost(actor: PolicyUser, post: PolicyPost): boolean {
  if (post.deletedAt !== null) return false;
  return actor.id === post.authorId;
}

/**
 * 檢查使用者是否可以對指定貼文留言。
 * 需要有閱讀權限，且貼文已發布、未刪除。
 */
export function canCommentOnPost(
  actor: PolicyUser,
  post: PolicyPost,
  audienceUserIds?: string[],
): boolean {
  if (post.deletedAt !== null) return false;
  if (post.status !== 'PUBLISHED') return false;
  return canViewPost(actor, post, audienceUserIds);
}

/**
 * 檢查使用者是否可以對指定貼文做心情回應。
 * 需要有閱讀權限，且貼文已發布、未刪除。
 */
export function canReactToPost(
  actor: PolicyUser,
  post: PolicyPost,
  audienceUserIds?: string[],
): boolean {
  if (post.deletedAt !== null) return false;
  if (post.status !== 'PUBLISHED') return false;
  return canViewPost(actor, post, audienceUserIds);
}
