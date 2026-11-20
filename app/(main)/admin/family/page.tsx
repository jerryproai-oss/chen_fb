'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  UserPlus,
  KeyRound,
  Ban,
  CheckCircle,
  X,
  Eye,
  EyeOff,
  Pencil,
} from 'lucide-react';
import Link from 'next/link';
import Avatar from '@/components/ui/Avatar';
import styles from './page.module.css';

interface FamilyMember {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'ADMIN' | 'MEMBER';
  status: 'ACTIVE' | 'DISABLED';
  mustChangePassword: boolean;
  createdAt: string;
}

/**
 * 家庭管理頁面（管理員限定）
 * 列出家人、新增帳號、停用/啟用、重設密碼
 */
export default function AdminFamilyPage() {
  const router = useRouter();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ── 新增家人表單 ──────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [addingUser, setAddingUser] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  // ── 重設密碼表單 ──────────────────────────────
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // ── 編輯帳號表單 ──────────────────────────────
  const [editMember, setEditMember] = useState<FamilyMember | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');

  // ── 載入家人列表 ──────────────────────────────
  async function loadMembers() {
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 403) {
        router.push('/journal');
        return;
      }
      if (!res.ok) throw new Error('無法載入');
      const data = await res.json();
      setMembers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 新增家人 ──────────────────────────────────
  async function handleAddUser() {
    if (!newUsername.trim() || !newDisplayName.trim() || !newPassword) return;
    setAddingUser(true);
    setAddError('');
    setAddSuccess('');

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          displayName: newDisplayName.trim(),
          temporaryPassword: newPassword,
          role: newRole,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '新增失敗');
      }

      const data = await res.json();
      setMembers((prev) => [...prev, data.user]);
      setAddSuccess(`帳號 ${data.user.username} 已建立！臨時密碼：${newPassword}`);
      setNewUsername('');
      setNewDisplayName('');
      setNewPassword('');
      setNewRole('MEMBER');
      setShowAddForm(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : '新增失敗');
    } finally {
      setAddingUser(false);
    }
  }

  // ── 停用/啟用帳號 ─────────────────────────────
  async function handleToggleStatus(member: FamilyMember) {
    const newStatus = member.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const action = newStatus === 'DISABLED' ? '停用' : '啟用';

    if (!confirm(`確定要${action} ${member.displayName} 的帳號嗎？`)) return;

    try {
      const res = await fetch(`/api/admin/users/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `${action}失敗`);
      }

      const data = await res.json();
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? data.user : m)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : `${action}失敗`);
    }
  }

  // ── 重設密碼 ──────────────────────────────────
  async function handleResetPassword() {
    if (!resetUserId || !resetPassword) return;
    setResetting(true);
    setResetError('');
    setResetSuccess('');

    try {
      const res = await fetch(`/api/admin/users/${resetUserId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temporaryPassword: resetPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '重設失敗');
      }

      const member = members.find((m) => m.id === resetUserId);
      setResetSuccess(`已重設 ${member?.displayName} 的密碼`);
      setResetUserId(null);
      setResetPassword('');
      // 重新載入以更新 mustChangePassword 狀態
      loadMembers();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : '重設失敗');
    } finally {
      setResetting(false);
    }
  }

  // ── 編輯帳號 ────────────────────────────────
  function openEdit(member: FamilyMember) {
    setEditMember(member);
    setEditDisplayName(member.displayName);
    setEditRole(member.role);
    setEditError('');
  }

  async function handleEditUser() {
    if (!editMember) return;
    setEditing(true);
    setEditError('');

    try {
      const res = await fetch(`/api/admin/users/${editMember.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editDisplayName.trim(),
          role: editRole,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '更新失敗');
      }

      const data = await res.json();
      setMembers((prev) =>
        prev.map((m) => (m.id === editMember.id ? data.user : m)),
      );
      setEditSuccess(`已更新 ${editDisplayName.trim()} 的帳號資料`);
      setEditMember(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : '更新失敗');
    } finally {
      setEditing(false);
    }
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loader}>載入中…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorMsg}>{error}</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <Link href="/profile" className={styles.backLink}>
          <ArrowLeft size={16} />
          返回
        </Link>
        <h1 className={styles.pageTitle}>家庭管理</h1>
        <p className={styles.pageSubtitle}>
          管理家庭成員帳號
        </p>
      </div>

      {/* 成功/錯誤提示 */}
      {addSuccess && (
        <div className={styles.successBanner}>
          {addSuccess}
          <button
            className={styles.bannerClose}
            onClick={() => setAddSuccess('')}
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {resetSuccess && (
        <div className={styles.successBanner}>
          {resetSuccess}
          <button
            className={styles.bannerClose}
            onClick={() => setResetSuccess('')}
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {editSuccess && (
        <div className={styles.successBanner}>
          {editSuccess}
          <button
            className={styles.bannerClose}
            onClick={() => setEditSuccess('')}
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 新增家人按鈕 */}
      {!showAddForm && (
        <button
          className={styles.addBtn}
          onClick={() => setShowAddForm(true)}
          type="button"
        >
          <UserPlus size={18} />
          新增家人
        </button>
      )}

      {/* 新增家人表單 */}
      {showAddForm && (
        <div className={styles.formCard}>
          <h2 className={styles.formTitle}>新增家人</h2>
          {addError && <div className={styles.formError}>{addError}</div>}

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="new-username">
              帳號 <span className={styles.required}>*</span>
            </label>
            <input
              id="new-username"
              type="text"
              className={styles.formInput}
              placeholder="英文、數字、底線，2-30 字"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              maxLength={30}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="new-display-name">
              顯示名稱 <span className={styles.required}>*</span>
            </label>
            <input
              id="new-display-name"
              type="text"
              className={styles.formInput}
              placeholder="例如：爸爸、媽媽"
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              maxLength={50}
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="new-password">
              臨時密碼 <span className={styles.required}>*</span>
            </label>
            <div className={styles.passwordWrapper}>
              <input
                id="new-password"
                type={showNewPassword ? 'text' : 'password'}
                className={styles.formInput}
                placeholder="至少 8 個字元"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowNewPassword(!showNewPassword)}
                aria-label={showNewPassword ? '隱藏密碼' : '顯示密碼'}
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor="new-role">角色</label>
            <select
              id="new-role"
              className={styles.formSelect}
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'MEMBER' | 'ADMIN')}
            >
              <option value="MEMBER">👤 成員</option>
              <option value="ADMIN">👑 管理員</option>
            </select>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={() => {
                setShowAddForm(false);
                setAddError('');
              }}
            >
              取消
            </button>
            <button
              type="button"
              className={styles.submitBtn}
              onClick={handleAddUser}
              disabled={
                addingUser ||
                !newUsername.trim() ||
                !newDisplayName.trim() ||
                newPassword.length < 8
              }
            >
              {addingUser ? '建立中…' : '建立帳號'}
            </button>
          </div>
        </div>
      )}

      {/* 家人列表 */}
      <div className={styles.memberList}>
        {members.map((member) => (
          <div
            key={member.id}
            className={`${styles.memberCard} ${
              member.status === 'DISABLED' ? styles.memberDisabled : ''
            }`}
          >
            <div className={styles.memberInfo}>
              <Avatar
                name={member.displayName}
                avatarUrl={member.avatarUrl}
                size="md"
              />
              <div className={styles.memberDetails}>
                <div className={styles.memberName}>
                  {member.displayName}
                  {member.role === 'ADMIN' && (
                    <span className={styles.adminBadge}>管理員</span>
                  )}
                  {member.status === 'DISABLED' && (
                    <span className={styles.disabledBadge}>已停用</span>
                  )}
                  {member.mustChangePassword && (
                    <span className={styles.tempBadge}>需更改密碼</span>
                  )}
                </div>
                <div className={styles.memberMeta}>
                  @{member.username} · 加入 {formatDate(member.createdAt)}
                </div>
              </div>
            </div>

            <div className={styles.memberActions}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => openEdit(member)}
                title="編輯帳號"
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => {
                  setResetUserId(member.id);
                  setResetPassword('');
                  setResetError('');
                  setResetSuccess('');
                }}
                title="重設密碼"
              >
                <KeyRound size={16} />
              </button>
              <button
                type="button"
                className={`${styles.actionBtn} ${
                  member.status === 'ACTIVE'
                    ? styles.actionDanger
                    : styles.actionSuccess
                }`}
                onClick={() => handleToggleStatus(member)}
                title={member.status === 'ACTIVE' ? '停用帳號' : '啟用帳號'}
              >
                {member.status === 'ACTIVE' ? (
                  <Ban size={16} />
                ) : (
                  <CheckCircle size={16} />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 編輯帳號對話框 */}
      {editMember && (
        <div className={styles.overlay} onClick={() => setEditMember(null)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.dialogTitle}>
              編輯 {editMember.displayName} 的帳號
            </h3>
            {editError && (
              <div className={styles.formError}>{editError}</div>
            )}
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="edit-display-name">
                顯示名稱 <span className={styles.required}>*</span>
              </label>
              <input
                id="edit-display-name"
                type="text"
                className={styles.formInput}
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                maxLength={50}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="edit-role">
                角色
              </label>
              <select
                id="edit-role"
                className={styles.formSelect}
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as 'MEMBER' | 'ADMIN')}
              >
                <option value="MEMBER">👤 成員</option>
                <option value="ADMIN">👑 管理員</option>
              </select>
            </div>
            <div className={styles.formField}>
              <p className={styles.formHint}>
                帳號（@{editMember.username}）建立後無法變更。
              </p>
            </div>
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setEditMember(null)}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={handleEditUser}
                disabled={editing || !editDisplayName.trim()}
              >
                {editing ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重設密碼對話框 */}
      {resetUserId && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3 className={styles.dialogTitle}>
              重設 {members.find((m) => m.id === resetUserId)?.displayName} 的密碼
            </h3>
            {resetError && (
              <div className={styles.formError}>{resetError}</div>
            )}
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="reset-password">
                新臨時密碼
              </label>
              <div className={styles.passwordWrapper}>
                <input
                  id="reset-password"
                  type={showPassword ? 'text' : 'password'}
                  className={styles.formInput}
                  placeholder="至少 8 個字元"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className={styles.formHint}>
                重設後，該帳號所有登入工作階段將被撤銷，需使用新密碼重新登入。
              </p>
            </div>
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => {
                  setResetUserId(null);
                  setResetError('');
                }}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={handleResetPassword}
                disabled={resetting || resetPassword.length < 8}
              >
                {resetting ? '重設中…' : '確定重設'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
