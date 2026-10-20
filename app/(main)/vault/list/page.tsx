'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock, Plus, KeyRound, FileText, Package,
  Trash2, ChevronLeft, Search, Copy, Eye, EyeOff,
  Users, UserPlus, UserMinus, Shield,
} from 'lucide-react';
import { deriveKey, decrypt, encrypt } from '@/lib/vault/crypto';
import { getVaultKey, clearVaultKey } from '@/lib/vault/keystore';
import Avatar from '@/components/ui/Avatar';
import styles from './page.module.css';

type VaultItem = {
  id: string;
  titleEnc: string;
  contentEnc: string;
  category: string;
  iv: string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

type DecryptedItem = {
  id: string;
  title: string;
  content: string;
  category: string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
};

type VaultMemberInfo = {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
};

type FamilyMember = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

const CATEGORIES = [
  { key: 'ALL', label: '全部', icon: Package },
  { key: 'PASSWORD', label: '帳密', icon: KeyRound },
  { key: 'NOTE', label: '筆記', icon: FileText },
  { key: 'OTHER', label: '其他', icon: Package },
] as const;

export default function VaultListPage() {
  const router = useRouter();
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('NOTE');
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showContent, setShowContent] = useState<Set<string>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const cryptoKeyRef = useRef<CryptoKey | null>(null);

  // 共享保險庫相關
  const [isSharedVault, setIsSharedVault] = useState(false);
  const [vaultOwnerId, setVaultOwnerId] = useState<string | null>(null);
  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const [vaultMembers, setVaultMembers] = useState<VaultMemberInfo[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

  const getVaultToken = useCallback(() => sessionStorage.getItem('vault-token'), []);
  const getSalt = useCallback(() => sessionStorage.getItem('vault-salt'), []);

  // Auto-lock check
  useEffect(() => {
    const token = getVaultToken();
    const expires = sessionStorage.getItem('vault-expires');
    if (!token || !expires || Date.now() > Number(expires)) {
      router.replace('/vault');
      return;
    }
    // 檢查是否為共享保險庫
    const owId = sessionStorage.getItem('vault-owner-id');
    if (owId) {
      setVaultOwnerId(owId);
      setIsSharedVault(true);
    }
  }, [router, getVaultToken]);

  // Load items
  useEffect(() => {
    const loadItems = async () => {
      const token = getVaultToken();
      const salt = getSalt();
      if (!token || !salt) { router.replace('/vault'); return; }

      try {
        const res = await fetch('/api/vault/items', {
          headers: { 'x-vault-token': token },
        });

        if (res.status === 401) { router.replace('/vault'); return; }
        if (!res.ok) throw new Error('載入失敗');

        const data = await res.json();
        setIsSharedVault(data.isShared ?? false);

        // 從記憶體取得已衍生的加密金鑰（不再從 sessionStorage 讀 PIN）
        if (!cryptoKeyRef.current) {
          const memKey = getVaultKey();
          if (!memKey) { router.replace('/vault'); return; }
          cryptoKeyRef.current = memKey;
        }
        const key = cryptoKeyRef.current;

        // Decrypt all items
        const decrypted: DecryptedItem[] = [];
        for (const item of data.items as VaultItem[]) {
          try {
            // IV format: titleIV|contentIV (pipe-separated) or single IV for both
            const ivParts = item.iv.split('|');
            const titleIv = ivParts[0];
            const contentIv = ivParts.length > 1 ? ivParts[1] : ivParts[0];
            const title = await decrypt(key, item.titleEnc, titleIv);
            const content = await decrypt(key, item.contentEnc, contentIv);
            decrypted.push({
              id: item.id,
              title,
              content,
              category: item.category,
              createdBy: item.createdBy,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            });
          } catch {
            decrypted.push({
              id: item.id,
              title: '⚠️ 解密失敗',
              content: '無法解密此項目',
              category: item.category,
              createdBy: item.createdBy,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            });
          }
        }
        setItems(decrypted);
      } catch (e) {
        setError(e instanceof Error ? e.message : '載入失敗');
      } finally {
        setLoading(false);
      }
    };

    loadItems();
  }, [router, getVaultToken, getSalt]);

  // Auto-lock timer: refresh expiry
  useEffect(() => {
    const interval = setInterval(() => {
      const expires = sessionStorage.getItem('vault-expires');
      if (!expires || Date.now() > Number(expires)) {
        handleLock();
      }
    }, 30_000);
    return () => clearInterval(interval);
  });

  const handleLock = () => {
    sessionStorage.removeItem('vault-token');
    sessionStorage.removeItem('vault-salt');
    sessionStorage.removeItem('vault-expires');
    sessionStorage.removeItem('vault-owner-id');
    clearVaultKey();
    cryptoKeyRef.current = null;
    router.replace('/vault');
  };

  // 載入共享成員列表
  const loadMembers = async () => {
    setLoadingMembers(true);
    try {
      const [membersRes, familyRes] = await Promise.all([
        fetch('/api/vault/members'),
        fetch('/api/family/members'),
      ]);
      if (membersRes.ok) {
        const data = await membersRes.json();
        setVaultMembers(data.members ?? []);
      }
      if (familyRes.ok) {
        const data = await familyRes.json();
        setFamilyMembers(data.members ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleToggleMemberPanel = () => {
    if (!showMemberPanel) {
      loadMembers();
    }
    setShowMemberPanel(!showMemberPanel);
  };

  const handleAddMember = async (memberId: string) => {
    setAddingMember(true);
    try {
      const res = await fetch('/api/vault/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '新增失敗');
        return;
      }
      await loadMembers();
    } catch {
      setError('新增成員失敗');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      const res = await fetch('/api/vault/members', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '移除失敗');
        return;
      }
      setVaultMembers((prev) => prev.filter((m) => m.userId !== memberId));
    } catch {
      setError('移除成員失敗');
    }
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    const token = getVaultToken();
    const key = cryptoKeyRef.current;
    if (!token || !key) { router.replace('/vault'); return; }

    setSaving(true);
    try {
      const { ciphertext: titleEnc, iv } = await encrypt(key, newTitle.trim());
      const contentResult = await encrypt(key, newContent.trim() || ' ');
      // Store as: titleIV|contentIV (separated by |)
      const combinedIv = iv + '|' + contentResult.iv;

      const res = await fetch('/api/vault/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vault-token': token,
        },
        body: JSON.stringify({
          titleEnc,
          contentEnc: contentResult.ciphertext,
          category: newCategory,
          iv: combinedIv,
        }),
      });

      if (res.status === 401) { router.replace('/vault'); return; }
      if (!res.ok) throw new Error('新增失敗');

      const resData = await res.json();

      // Reload items
      setItems(prev => [{
        id: resData.item.id,
        title: newTitle.trim(),
        content: newContent.trim() || ' ',
        category: newCategory,
        createdBy: resData.item.createdBy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, ...prev]);

      setNewTitle('');
      setNewContent('');
      setNewCategory('NOTE');
      setShowAddForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '新增失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const token = getVaultToken();
    if (!token) { router.replace('/vault'); return; }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/vault/items/${id}`, {
        method: 'DELETE',
        headers: { 'x-vault-token': token },
      });
      if (res.status === 401) { router.replace('/vault'); return; }
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '沒有刪除權限');
        return;
      }
      if (!res.ok) throw new Error('刪除失敗');
      setItems(prev => prev.filter(item => item.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '刪除失敗');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(id);
      setTimeout(() => setCopyFeedback(null), 1500);
    } catch {
      // Fallback
    }
  };

  const toggleShowContent = (id: string) => {
    setShowContent(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredItems = items.filter(item => {
    if (activeTab !== 'ALL' && item.category !== activeTab) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return item.title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q);
    }
    return true;
  });

  const formatDate = (d: string) => {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'PASSWORD': return <KeyRound size={14} />;
      case 'NOTE': return <FileText size={14} />;
      default: return <Package size={14} />;
    }
  };

  // 可加入共享的家人（排除已是成員者）
  const availableFamily = familyMembers.filter(
    (fm) => !vaultMembers.some((vm) => vm.userId === fm.id),
  );

  if (loading) {
    return <div className={styles.container}><div className={styles.loader}>載入中…</div></div>;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/profile')} type="button">
          <ChevronLeft size={20} />
        </button>
        <h1 className={styles.title}>
          {isSharedVault ? <Users size={18} /> : <Lock size={18} />}
          <span>{isSharedVault ? '共享特別區' : '特別區'}</span>
        </h1>
        <div className={styles.headerActions}>
          {/* 成員管理按鈕 — 僅自己的保險庫且非共享檢視時顯示 */}
          {!isSharedVault && !vaultOwnerId && (
            <button
              className={styles.memberBtn}
              onClick={handleToggleMemberPanel}
              type="button"
              title="共享管理"
            >
              <Users size={18} />
            </button>
          )}
          <button className={styles.lockBtn} onClick={handleLock} type="button" title="上鎖">
            <Lock size={18} />
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          {error}
          <button type="button" onClick={() => setError('')} className={styles.errorClose}>✕</button>
        </div>
      )}

      {/* 成員管理面板 */}
      {showMemberPanel && (
        <div className={styles.memberPanel}>
          <div className={styles.memberPanelHeader}>
            <Shield size={16} />
            <span>共享成員管理</span>
          </div>
          <p className={styles.memberPanelHint}>
            共享成員使用你的密碼登入，可查看與新增項目，但不能刪除他人建立的項目。
          </p>

          {/* 已共享成員 */}
          {vaultMembers.length > 0 && (
            <div className={styles.memberSection}>
              <h3 className={styles.memberSectionTitle}>已共享</h3>
              {vaultMembers.map((member) => (
                <div key={member.id} className={styles.memberRow}>
                  <Avatar name={member.displayName} avatarUrl={member.avatarUrl} size="sm" />
                  <span className={styles.memberName}>{member.displayName}</span>
                  <button
                    type="button"
                    className={styles.memberRemoveBtn}
                    onClick={() => handleRemoveMember(member.userId)}
                    title="移除"
                  >
                    <UserMinus size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 可加入的家人 */}
          {loadingMembers ? (
            <p className={styles.memberPanelHint}>載入中…</p>
          ) : availableFamily.length > 0 ? (
            <div className={styles.memberSection}>
              <h3 className={styles.memberSectionTitle}>可加入</h3>
              {availableFamily.map((fm) => (
                <div key={fm.id} className={styles.memberRow}>
                  <Avatar name={fm.displayName} avatarUrl={fm.avatarUrl} size="sm" />
                  <span className={styles.memberName}>{fm.displayName}</span>
                  <button
                    type="button"
                    className={styles.memberAddBtn}
                    onClick={() => handleAddMember(fm.id)}
                    disabled={addingMember}
                    title="加入"
                  >
                    <UserPlus size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : vaultMembers.length === 0 ? (
            <p className={styles.memberPanelHint}>目前沒有其他家庭成員可加入</p>
          ) : null}
        </div>
      )}

      {/* Search */}
      <div className={styles.searchWrapper}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="text"
          className={styles.searchInput}
          placeholder="搜尋…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Category tabs */}
      <div className={styles.tabs}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            type="button"
            className={`${styles.tab} ${activeTab === cat.key ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(cat.key)}
          >
            <cat.icon size={14} />
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Add button */}
      {!showAddForm && (
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => setShowAddForm(true)}
        >
          <Plus size={18} />
          <span>新增項目</span>
        </button>
      )}

      {/* Add form */}
      {showAddForm && (
        <div className={styles.addForm}>
          <div className={styles.formField}>
            <input
              type="text"
              className={styles.formInput}
              placeholder="標題"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className={styles.formField}>
            <textarea
              className={styles.formTextarea}
              placeholder="內容（帳密、備忘等）"
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              rows={3}
            />
          </div>
          <div className={styles.formField}>
            <select
              className={styles.formSelect}
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
            >
              <option value="NOTE">📝 筆記</option>
              <option value="PASSWORD">🔑 帳密</option>
              <option value="OTHER">📦 其他</option>
            </select>
          </div>
          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.formCancelBtn}
              onClick={() => { setShowAddForm(false); setNewTitle(''); setNewContent(''); }}
            >
              取消
            </button>
            <button
              type="button"
              className={styles.formSaveBtn}
              onClick={handleAdd}
              disabled={saving || !newTitle.trim()}
            >
              {saving ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      <div className={styles.itemList}>
        {filteredItems.length === 0 && (
          <div className={styles.empty}>
            {searchQuery ? '找不到符合的項目' : '尚無任何項目'}
          </div>
        )}

        {filteredItems.map(item => (
          <div
            key={item.id}
            className={`${styles.itemCard} ${expandedId === item.id ? styles.itemCardExpanded : ''}`}
          >
            <div
              className={styles.itemHeader}
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
              <span className={styles.itemCategoryIcon}>{getCategoryIcon(item.category)}</span>
              <span className={styles.itemTitle}>{item.title}</span>
              <span className={styles.itemDate}>{formatDate(item.updatedAt)}</span>
            </div>

            {expandedId === item.id && (
              <div className={styles.itemBody}>
                <div className={styles.itemContentRow}>
                  <pre className={styles.itemContent}>
                    {item.category === 'PASSWORD' && !showContent.has(item.id)
                      ? '••••••••'
                      : item.content}
                  </pre>
                  <div className={styles.itemActions}>
                    {item.category === 'PASSWORD' && (
                      <button
                        type="button"
                        className={styles.itemActionBtn}
                        onClick={() => toggleShowContent(item.id)}
                        title={showContent.has(item.id) ? '隱藏' : '顯示'}
                      >
                        {showContent.has(item.id) ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.itemActionBtn}
                      onClick={() => handleCopy(item.content, item.id)}
                      title="複製"
                    >
                      <Copy size={16} />
                      {copyFeedback === item.id && <span className={styles.copyToast}>已複製</span>}
                    </button>
                    <button
                      type="button"
                      className={`${styles.itemActionBtn} ${styles.itemDeleteBtn}`}
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      title="刪除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
