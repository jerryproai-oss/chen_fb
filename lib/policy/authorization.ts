import type { Role, UserStatus } from '@prisma/client';

/**
 * 授權策略所需的最小使用者資訊。
 * 不綁定完整 Prisma User model，方便測試。
 */
export interface PolicyUser {
  id: string;
  role: Role;
  status: UserStatus;
}

/**
 * 是否可以管理使用者（檢視使用者列表、修改使用者資料等）。
 * 僅限 ADMIN。
 */
export function canManageUsers(actor: PolicyUser): boolean {
  return actor.role === 'ADMIN';
}

/**
 * 是否可以建立新使用者。
 * 僅限 ADMIN。
 */
export function canCreateUser(actor: PolicyUser): boolean {
  return actor.role === 'ADMIN';
}

/**
 * 是否可以停用指定使用者。
 * ADMIN 可以停用他人，但不能停用自己。
 *
 * @param actor - 執行動作的使用者
 * @param targetUserId - 被停用的目標使用者 ID
 */
export function canDisableUser(
  actor: PolicyUser,
  targetUserId: string,
): boolean {
  if (actor.role !== 'ADMIN') return false;
  if (actor.id === targetUserId) return false;
  return true;
}

/**
 * 是否可以重設他人密碼（管理員功能）。
 * 僅限 ADMIN。
 */
export function canResetPassword(actor: PolicyUser): boolean {
  return actor.role === 'ADMIN';
}

/**
 * 是否可以變更自己的密碼。
 * 任何狀態為 ACTIVE 的使用者皆可。
 */
export function canChangeOwnPassword(actor: PolicyUser): boolean {
  return actor.status === 'ACTIVE';
}
