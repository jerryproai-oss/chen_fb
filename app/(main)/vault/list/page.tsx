'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock, Plus, KeyRound, FileText, Package,
  Trash2, ChevronLeft, Search, Copy, Eye, EyeOff,
  Users, UserPlus, UserMinus, Shield, Settings,
  Download, Landmark, CreditCard, TrendingUp, ExternalLink,
  Pencil, Upload, CheckSquare, Square, X, Pin, FolderInput,
} from 'lucide-react';
import { deriveKey, decrypt, encrypt, generateSalt } from '@/lib/vault/crypto';
import { getVaultKey, clearVaultKey, setOnLockCallback, initIdleMonitor } from '@/lib/vault/keystore';
import Avatar from '@/components/ui/Avatar';
import styles from './page.module.css';

type VaultItem = {
  id: string;
  titleEnc: string;
  contentEnc: string;
  category: string;
  iv: string;
  createdBy?: string | null;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DecryptedItem = {
  id: string;
  title: string;
  content: string;
  category: string;
  createdBy?: string | null;
  pinnedAt: string | null;
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
  { key: 'BANK', label: '銀行', icon: Landmark },
  { key: 'CREDIT_CARD', label: '信用卡', icon: CreditCard },
  { key: 'FINANCE', label: '投資', icon: TrendingUp },
  { key: 'NOTE', label: '筆記', icon: FileText },
  { key: 'OTHER', label: '其他', icon: Package },
  { key: 'CUSTOM', label: '自訂', icon: Plus },
] as const;

// ── 結構化欄位定義 ─────────────────────────────────────────

type FieldDef = {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
  sensitive?: boolean;   // 遮蔽顯示（密碼/卡號/CVV 等）
  inputType?: 'text' | 'password' | 'url' | 'textarea';
};

/** 各分類的結構化欄位；NOTE / OTHER 不在此定義，使用純文字 */
const CATEGORY_FIELDS: Record<string, FieldDef[]> = {
  PASSWORD: [
    { key: 'username', label: '帳號', placeholder: '使用者名稱或 Email', required: true },
    { key: 'password', label: '密碼', placeholder: '密碼', required: true, sensitive: true },
    { key: 'url', label: '網站', placeholder: 'https://...', inputType: 'url' },
    { key: 'notes', label: '備註', placeholder: '其他備註', inputType: 'textarea' },
  ],
  BANK: [
    { key: 'bankName', label: '銀行', placeholder: '銀行名稱', required: true },
    { key: 'accountNumber', label: '帳號', placeholder: '銀行帳號', required: true, sensitive: true },
    { key: 'accountName', label: '戶名', placeholder: '帳戶持有人' },
    { key: 'branch', label: '分行', placeholder: '分行名稱' },
    { key: 'notes', label: '備註', placeholder: '其他備註', inputType: 'textarea' },
  ],
  CREDIT_CARD: [
    { key: 'bankName', label: '發卡銀行', placeholder: '發卡銀行', required: true },
    { key: 'cardNumber', label: '卡號', placeholder: '信用卡號碼', required: true, sensitive: true },
    { key: 'cardHolder', label: '持卡人', placeholder: '卡片上的姓名' },
    { key: 'expiryDate', label: '有效期限', placeholder: 'MM/YY' },
    { key: 'cvv', label: '安全碼', placeholder: 'CVV', sensitive: true },
    { key: 'creditLimit', label: '信用額度', placeholder: '額度金額' },
    { key: 'notes', label: '備註', placeholder: '其他備註', inputType: 'textarea' },
  ],
  FINANCE: [
    { key: 'institution', label: '機構', placeholder: '券商/銀行/平台名稱', required: true },
    { key: 'accountNumber', label: '帳號', placeholder: '投資帳號', required: true, sensitive: true },
    { key: 'accountName', label: '戶名', placeholder: '帳戶持有人' },
    { key: 'accountType', label: '帳戶類型', placeholder: '股票/期貨/基金/ETF/加密貨幣' },
    { key: 'notes', label: '備註', placeholder: '其他備註', inputType: 'textarea' },
  ],
};

/** 判斷是否為結構化分類 */
const isStructuredCategory = (cat: string) => cat in CATEGORY_FIELDS;

/** 取得表單標題 placeholder */
const getTitlePlaceholder = (cat: string) => {
  switch (cat) {
    case 'PASSWORD': return '服務名稱（如 Gmail）';
    case 'BANK': return '帳戶名稱（如 台銀薪轉）';
    case 'CREDIT_CARD': return '卡片名稱（如 中信 Visa 白金）';
    case 'FINANCE': return '帳戶名稱（如 元大證券）';
    case 'CUSTOM': return '項目名稱';
    default: return '標題';
  }
};

/** 嘗試解析結構化內容 */
const parseStructured = (content: string): Record<string, string> | null => {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch { /* plain text */ }
  return null;
};

/** 自訂欄位型別 */
type CustomField = { label: string; value: string; sensitive: boolean };

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
  const [formFields, setFormFields] = useState<Record<string, string>>({});
  const [formShowFields, setFormShowFields] = useState<Set<string>>(new Set());
  const [formCustomFields, setFormCustomFields] = useState<CustomField[]>([]);
  const [customCategoryLabel, setCustomCategoryLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showContent, setShowContent] = useState<Set<string>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const cryptoKeyRef = useRef<CryptoKey | null>(null);

  // 共享保險庫相關
  const [isSharedVault, setIsSharedVault] = useState(false);
  const [vaultOwnerId, setVaultOwnerId] = useState<string | null>(null);
  const [showMemberPanel, setShowMemberPanel] = useState(false);
  const [vaultMembers, setVaultMembers] = useState<VaultMemberInfo[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [addingMember, setAddingMember] = useState(false);

  // 更改密碼相關
  const [showChangePinPanel, setShowChangePinPanel] = useState(false);
  const [oldPinInput, setOldPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [showPinFields, setShowPinFields] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const [changePinProgress, setChangePinProgress] = useState('');
  const [showBackupMenu, setShowBackupMenu] = useState(false);

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
              pinnedAt: item.pinnedAt ?? null,
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
              pinnedAt: item.pinnedAt ?? null,
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

  // ── M5: 閒置自動上鎖 ──
  useEffect(() => {
    setOnLockCallback(() => {
      router.replace('/vault');
    });
    const cleanup = initIdleMonitor();
    return () => {
      cleanup();
      setOnLockCallback(null);
    };
  }, [router]);

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

  // PIN 驗證規則
  const validatePinInput = (p: string): string | null => {
    if (p.length < 6) return '至少需要 6 個字元';
    if (p.length > 20) return '最多 20 個字元';
    if (!/[a-z]/.test(p)) return '需包含至少一個小寫英文字母';
    if (!/[A-Z]/.test(p)) return '需包含至少一個大寫英文字母';
    if (!/[0-9]/.test(p)) return '需包含至少一個數字';
    return null;
  };

  // 更改密碼
  const handleChangePin = async () => {
    // 前端驗證
    if (!oldPinInput) { setError('請輸入目前密碼'); return; }
    const newPinErr = validatePinInput(newPinInput);
    if (newPinErr) { setError(newPinErr); return; }
    if (newPinInput !== confirmNewPin) { setError('新密碼兩次輸入不一致'); return; }
    if (oldPinInput === newPinInput) { setError('新密碼不能與目前密碼相同'); return; }

    const token = getVaultToken();
    const key = cryptoKeyRef.current;
    if (!token || !key) { router.replace('/vault'); return; }

    setChangingPin(true);
    setError('');

    try {
      // 1. 取得所有加密項目
      setChangePinProgress('取得項目資料…');
      const itemsRes = await fetch('/api/vault/items', {
        headers: { 'x-vault-token': token },
      });
      if (!itemsRes.ok) throw new Error('無法取得項目資料');
      const itemsData = await itemsRes.json();
      const encryptedItems = itemsData.items as VaultItem[];

      // 2. 用舊 key 解密所有項目
      setChangePinProgress(`解密 ${encryptedItems.length} 個項目…`);
      const decryptedPairs: Array<{ id: string; title: string; content: string }> = [];
      for (const item of encryptedItems) {
        const ivParts = item.iv.split('|');
        const titleIv = ivParts[0];
        const contentIv = ivParts.length > 1 ? ivParts[1] : ivParts[0];
        const title = await decrypt(key, item.titleEnc, titleIv);
        const content = await decrypt(key, item.contentEnc, contentIv);
        decryptedPairs.push({ id: item.id, title, content });
      }

      // 3. 用新 PIN derive 新 key
      setChangePinProgress('產生新金鑰…');
      const newSalt = generateSalt();
      const newKey = await deriveKey(newPinInput, newSalt);

      // 4. 用新 key 重新加密所有項目
      setChangePinProgress(`重新加密 ${decryptedPairs.length} 個項目…`);
      const reEncryptedItems: Array<{ id: string; titleEnc: string; contentEnc: string; iv: string }> = [];
      for (const pair of decryptedPairs) {
        const { ciphertext: titleEnc, iv: titleIv } = await encrypt(newKey, pair.title);
        const { ciphertext: contentEnc, iv: contentIv } = await encrypt(newKey, pair.content);
        reEncryptedItems.push({
          id: pair.id,
          titleEnc,
          contentEnc,
          iv: titleIv + '|' + contentIv,
        });
      }

      // 5. 提交到 API
      setChangePinProgress('更新密碼…');
      const res = await fetch('/api/vault/pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPin: oldPinInput,
          newPin: newPinInput,
          newSalt,
          reEncryptedItems,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '更改密碼失敗');
      }

      // 6. 更新本地狀態
      cryptoKeyRef.current = newKey;
      sessionStorage.setItem('vault-salt', newSalt);

      // 7. 重新取得 items 並用新 key 解密，以刷新列表
      setChangePinProgress('重新載入項目…');
      const refreshRes = await fetch('/api/vault/items', {
        headers: { 'x-vault-token': token },
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        const decrypted: DecryptedItem[] = [];
        for (const item of refreshData.items as VaultItem[]) {
          try {
            const ivParts = item.iv.split('|');
            const titleIv = ivParts[0];
            const contentIv = ivParts.length > 1 ? ivParts[1] : ivParts[0];
            const title = await decrypt(newKey, item.titleEnc, titleIv);
            const content = await decrypt(newKey, item.contentEnc, contentIv);
            decrypted.push({
              id: item.id,
              title,
              content,
              category: item.category,
              createdBy: item.createdBy,
              pinnedAt: item.pinnedAt ?? null,
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
              pinnedAt: item.pinnedAt ?? null,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
            });
          }
        }
        setItems(decrypted);
      }

      // 清空表單
      setOldPinInput('');
      setNewPinInput('');
      setConfirmNewPin('');
      setShowChangePinPanel(false);
      setChangePinProgress('');
      alert('密碼已更改成功！');
    } catch (e) {
      setError(e instanceof Error ? e.message : '更改密碼失敗');
    } finally {
      setChangingPin(false);
      setChangePinProgress('');
    }
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    const token = getVaultToken();
    const key = cryptoKeyRef.current;
    if (!token || !key) { router.replace('/vault'); return; }

    // 根據分類建構 content
    let contentToEncrypt: string;
    if (newCategory === 'CUSTOM') {
      // 自訂分類：所有欄位都是自訂
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: Record<string, any> = {};
      if (customCategoryLabel.trim()) {
        data.categoryLabel = customCategoryLabel.trim();
      }
      const validCustom = formCustomFields.filter(cf => cf.label.trim() && cf.value.trim());
      if (validCustom.length > 0) {
        data.customFields = validCustom.map(cf => ({
          label: cf.label.trim(),
          value: cf.value.trim(),
          sensitive: cf.sensitive,
        }));
      }
      contentToEncrypt = JSON.stringify(data);
    } else if (isStructuredCategory(newCategory)) {
      const fields = CATEGORY_FIELDS[newCategory];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: Record<string, any> = {};
      for (const f of fields) {
        if (formFields[f.key]?.trim()) {
          data[f.key] = formFields[f.key].trim();
        }
      }
      // 自訂欄位
      const validCustom = formCustomFields.filter(cf => cf.label.trim() && cf.value.trim());
      if (validCustom.length > 0) {
        data.customFields = validCustom.map(cf => ({
          label: cf.label.trim(),
          value: cf.value.trim(),
          sensitive: cf.sensitive,
        }));
      }
      contentToEncrypt = JSON.stringify(data);
    } else {
      contentToEncrypt = newContent.trim() || ' ';
    }

    setSaving(true);
    try {
      const { ciphertext: titleEnc, iv } = await encrypt(key, newTitle.trim());
      const contentResult = await encrypt(key, contentToEncrypt);
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
        content: contentToEncrypt,
        category: newCategory,
        createdBy: resData.item.createdBy,
        pinnedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, ...prev]);

      setNewTitle('');
      setNewContent('');
      setNewCategory('NOTE');
      setFormFields({});
      setFormShowFields(new Set());
      setFormCustomFields([]);
      setCustomCategoryLabel('');
      setShowAddForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '新增失敗');
    } finally {
      setSaving(false);
    }
  };

  /** 開始編輯：把解密的資料填入表單 */
  const handleStartEdit = (item: DecryptedItem) => {
    setEditingId(item.id);
    setNewTitle(item.title);
    setNewCategory(item.category);
    setShowAddForm(true);
    setExpandedId(null);

    if (item.category === 'CUSTOM') {
      const s = parseStructured(item.content);
      setCustomCategoryLabel(s?.categoryLabel || '');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cf = s ? ((s as any).customFields as CustomField[] | undefined) : undefined;
      setFormCustomFields(cf || []);
      setFormFields({});
    } else if (isStructuredCategory(item.category)) {
      const s = parseStructured(item.content);
      if (s) {
        const fields: Record<string, string> = {};
        const fieldDefs = CATEGORY_FIELDS[item.category];
        for (const f of fieldDefs) {
          if (s[f.key]) fields[f.key] = s[f.key];
        }
        setFormFields(fields);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cf = (s as any).customFields as CustomField[] | undefined;
        setFormCustomFields(cf || []);
      }
      setCustomCategoryLabel('');
    } else {
      setNewContent(item.content);
      setFormFields({});
      setFormCustomFields([]);
      setCustomCategoryLabel('');
    }
    setFormShowFields(new Set());
  };

  /** 儲存編輯（PATCH） */
  const handleSaveEdit = async () => {
    if (!editingId || !newTitle.trim()) return;
    const token = getVaultToken();
    const key = cryptoKeyRef.current;
    if (!token || !key) { router.replace('/vault'); return; }

    // 建構 content
    let contentToEncrypt: string;
    if (newCategory === 'CUSTOM') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: Record<string, any> = {};
      if (customCategoryLabel.trim()) data.categoryLabel = customCategoryLabel.trim();
      const validCustom = formCustomFields.filter(cf => cf.label.trim() && cf.value.trim());
      if (validCustom.length > 0) {
        data.customFields = validCustom.map(cf => ({ label: cf.label.trim(), value: cf.value.trim(), sensitive: cf.sensitive }));
      }
      contentToEncrypt = JSON.stringify(data);
    } else if (isStructuredCategory(newCategory)) {
      const fields = CATEGORY_FIELDS[newCategory];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: Record<string, any> = {};
      for (const f of fields) {
        if (formFields[f.key]?.trim()) data[f.key] = formFields[f.key].trim();
      }
      const validCustom = formCustomFields.filter(cf => cf.label.trim() && cf.value.trim());
      if (validCustom.length > 0) {
        data.customFields = validCustom.map(cf => ({ label: cf.label.trim(), value: cf.value.trim(), sensitive: cf.sensitive }));
      }
      contentToEncrypt = JSON.stringify(data);
    } else {
      contentToEncrypt = newContent.trim() || ' ';
    }

    setSaving(true);
    try {
      const { ciphertext: titleEnc, iv } = await encrypt(key, newTitle.trim());
      const contentResult = await encrypt(key, contentToEncrypt);
      const combinedIv = iv + '|' + contentResult.iv;

      const res = await fetch(`/api/vault/items/${editingId}`, {
        method: 'PATCH',
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
      if (!res.ok) throw new Error('更新失敗');

      // 更新本地項目
      setItems(prev => prev.map(it =>
        it.id === editingId
          ? { ...it, title: newTitle.trim(), content: contentToEncrypt, category: newCategory, updatedAt: new Date().toISOString() }
          : it
      ));

      // 清空表單
      setEditingId(null);
      setNewTitle('');
      setNewContent('');
      setNewCategory('NOTE');
      setFormFields({});
      setFormShowFields(new Set());
      setFormCustomFields([]);
      setCustomCategoryLabel('');
      setShowAddForm(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新失敗');
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

  /** 移動項目到其他分類 */
  const handleMoveCategory = async (item: DecryptedItem) => {
    const token = getVaultToken();
    const key = cryptoKeyRef.current;
    if (!token || !key) { router.replace('/vault'); return; }

    // 收集目前所有自訂分類名稱供選擇
    const existingLabels = new Set<string>();
    for (const it of items) {
      if (it.category === 'CUSTOM') {
        const s = parseStructured(it.content);
        if (s?.categoryLabel) existingLabels.add(s.categoryLabel);
      }
    }

    // 建立選項列表
    const labelList = [...existingLabels].sort();
    let promptMsg = '請輸入要移動到的分類名稱';
    if (labelList.length > 0) {
      promptMsg += `\n\n目前的分類：\n${labelList.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n\n輸入編號或新的分類名稱：`;
    }

    const input = window.prompt(promptMsg);
    if (!input || !input.trim()) return;

    let targetLabel = input.trim();
    // 如果輸入的是數字，對應到現有分類
    const num = parseInt(targetLabel, 10);
    if (!isNaN(num) && num >= 1 && num <= labelList.length) {
      targetLabel = labelList[num - 1];
    }

    // 取得原有的 structured content
    const s = parseStructured(item.content);
    const currentLabel = s?.categoryLabel || '';
    if (targetLabel === currentLabel) {
      setError('該項目已在此分類中');
      return;
    }

    try {
      // 更新 content 中的 categoryLabel
      let newContentObj: Record<string, unknown>;
      if (s) {
        newContentObj = { ...s, categoryLabel: targetLabel };
      } else {
        // 非結構化內容 → 包裝為結構化
        newContentObj = { categoryLabel: targetLabel, note: item.content };
      }

      const contentStr = JSON.stringify(newContentObj);
      const encTitle = await encrypt(key, item.title);
      const encContent = await encrypt(key, contentStr);

      const res = await fetch(`/api/vault/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-vault-token': token },
        body: JSON.stringify({
          titleEnc: encTitle.ciphertext,
          contentEnc: encContent.ciphertext,
          iv: encContent.iv,
          category: 'CUSTOM',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '移動失敗');
        return;
      }

      // 更新本地列表
      setItems(prev => prev.map(it => {
        if (it.id !== item.id) return it;
        return { ...it, title: item.title, content: contentStr, category: 'CUSTOM' };
      }));
      setExpandedId(null);
    } catch {
      setError('移動分類失敗');
    }
  };

  const handleTogglePin = async (item: DecryptedItem) => {
    const token = getVaultToken();
    if (!token) { router.replace('/vault'); return; }

    const newPinned = !item.pinnedAt;
    try {
      const res = await fetch(`/api/vault/items/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-vault-token': token,
        },
        body: JSON.stringify({ pinned: newPinned }),
      });

      if (res.status === 401) { router.replace('/vault'); return; }
      if (!res.ok) throw new Error('操作失敗');

      const data = await res.json();
      setItems(prev => {
        const updated = prev.map(it =>
          it.id === item.id
            ? { ...it, pinnedAt: newPinned ? (data.item.pinnedAt || new Date().toISOString()) : null }
            : it
        );
        // 重新排序：置頂在前，其餘按 updatedAt 降序
        return updated.sort((a, b) => {
          if (a.pinnedAt && !b.pinnedAt) return -1;
          if (!a.pinnedAt && b.pinnedAt) return 1;
          if (a.pinnedAt && b.pinnedAt) {
            return new Date(b.pinnedAt).getTime() - new Date(a.pinnedAt).getTime();
          }
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失敗');
    }
  };

  /** 切換批次選取 */
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /** 全選/取消選取一組項目 */
  const toggleSelectGroup = (ids: string[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
      return next;
    });
  };

  /** 批次刪除 */
  const handleBatchDelete = async () => {
    const token = getVaultToken();
    if (!token) { router.replace('/vault'); return; }
    if (selectedIds.size === 0) return;

    const confirmed = confirm(`確定要刪除選取的 ${selectedIds.size} 個項目嗎？此操作無法復原。`);
    if (!confirmed) return;

    setBatchDeleting(true);
    let success = 0;
    let failed = 0;

    for (const id of selectedIds) {
      try {
        const res = await fetch(`/api/vault/items/${id}`, {
          method: 'DELETE',
          headers: { 'x-vault-token': token },
        });
        if (res.ok) {
          success++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    // 更新列表
    setItems(prev => prev.filter(item => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
    setBatchMode(false);
    setBatchDeleting(false);

    if (failed > 0) {
      alert(`刪除完成：成功 ${success} 筆，失敗 ${failed} 筆`);
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

  // ── 備份功能 ───────────────────────────────────────────

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'PASSWORD': return '帳密';
      case 'BANK': return '銀行';
      case 'CREDIT_CARD': return '信用卡';
      case 'FINANCE': return '投資';
      case 'NOTE': return '筆記';
      case 'CUSTOM': return '自訂';
      default: return '其他';
    }
  };

  const nowStr = () => {
    const d = new Date();
    return `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}_${d.getHours().toString().padStart(2, '0')}${d.getMinutes().toString().padStart(2, '0')}`;
  };

  /** 匯出為 Word (.docx) 檔案下載 */
  const handleExportFile = async () => {
    if (items.length === 0) { setError('沒有可匯出的項目'); return; }
    setShowBackupMenu(false);

    try {
      // ── 先按分類分組，供使用者選擇 ──
      const allGrouped: Record<string, { catKey: string; items: DecryptedItem[] }> = {};
      for (const item of items) {
        let label: string;
        const catKey = item.category;
        if (item.category === 'CUSTOM') {
          const s = parseStructured(item.content);
          label = s?.categoryLabel || '自訂';
        } else {
          label = getCategoryLabel(item.category);
        }
        if (!allGrouped[label]) allGrouped[label] = { catKey, items: [] };
        allGrouped[label].items.push(item);
      }

      // ── 讓使用者選擇要匯出的分類 ──
      const labels = Object.keys(allGrouped);
      const labelOptions = labels.map((l, i) =>
        `${i + 1}. ${l}（${allGrouped[l].items.length} 項）`
      ).join('\n');
      const input = window.prompt(
        `請選擇要匯出的分類（輸入編號，多個用逗號分隔，留空匯出全部）：\n\n` +
        `${labelOptions}\n\n` +
        `例如：1,3,5 或直接按確定匯出全部`
      );
      if (input === null) return; // 取消

      let selectedLabels: string[];
      if (input.trim() === '') {
        selectedLabels = labels; // 匯出全部
      } else {
        const nums = input.split(/[,，\s]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        selectedLabels = nums
          .filter(n => n >= 1 && n <= labels.length)
          .map(n => labels[n - 1]);
        if (selectedLabels.length === 0) {
          setError('未選擇有效的分類');
          return;
        }
      }

      // ── 篩選要匯出的分類 ──
      const grouped: Record<string, { catKey: string; items: DecryptedItem[] }> = {};
      for (const label of selectedLabels) {
        if (allGrouped[label]) grouped[label] = allGrouped[label];
      }
      const exportItemCount = Object.values(grouped).reduce((sum, g) => sum + g.items.length, 0);

      const { Document, Packer, Paragraph, Table, TableRow, TableCell,
              WidthType, TextRun, HeadingLevel, BorderStyle,
              AlignmentType, ShadingType } = await import('docx');

      const now = new Date();
      const nowFmt = `${now.getFullYear()}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

      // ── helper: 建立表格 cell ──
      const cellBorders = {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
        right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
      };

      const headerCell = (text: string) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, font: 'Microsoft JhengHei' })] })],
        shading: { type: ShadingType.SOLID, color: 'F3F1EC', fill: 'F3F1EC' },
        borders: cellBorders,
        width: { size: 0, type: WidthType.AUTO },
      });

      const dataCell = (text: string, mono = false) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: text || '', size: 17, font: mono ? 'Consolas' : 'Microsoft JhengHei' })] })],
        borders: cellBorders,
        width: { size: 0, type: WidthType.AUTO },
      });

      // ── 組裝文件內容 ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docChildren: any[] = [];

      // 標題
      docChildren.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '🔐 拾日特別區備份', size: 32, bold: true, font: 'Microsoft JhengHei', color: '5A7A5A' })],
      }));
      docChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: `匯出：${nowFmt}　｜　共 ${exportItemCount} 項${selectedLabels.length < labels.length ? `（已選 ${selectedLabels.length}/${labels.length} 分類）` : ''}`, size: 18, color: '888888', font: 'Microsoft JhengHei' })],
      }));
      docChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [new TextRun({ text: '⚠️ 本文件含敏感資訊，請妥善保管或銷毀。', size: 18, color: '856404', bold: true, font: 'Microsoft JhengHei' })],
      }));

      // ── 逐分類輸出 ──
      for (const [label, group] of Object.entries(grouped)) {
        const { catKey, items: groupItems } = group;
        const fieldDefs = CATEGORY_FIELDS[catKey];
        const isStruct = isStructuredCategory(catKey);

        // 分類標題
        docChildren.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 100 },
          children: [new TextRun({ text: `${label}（${groupItems.length}）`, size: 24, bold: true, font: 'Microsoft JhengHei', color: '5A7A5A' })],
        }));

        // ── 結構化分類（帳密、銀行、信用卡、投資）用表格 ──
        if (isStruct && fieldDefs) {
          const cols = fieldDefs.filter(f => f.inputType !== 'textarea');
          const hasNotes = fieldDefs.some(f => f.inputType === 'textarea');

          // 表頭
          const headerCells = [headerCell('名稱'), ...cols.map(f => headerCell(f.label))];
          if (hasNotes) headerCells.push(headerCell('備註'));

          const rows = [new TableRow({ children: headerCells })];

          for (const item of groupItems) {
            const s = parseStructured(item.content);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cf = s ? ((s as any).customFields as CustomField[] | undefined) : undefined;
            const cfText = cf?.length ? cf.map(c => `${c.label}: ${c.value}`).join('; ') : '';
            const notesField = fieldDefs.find(f => f.inputType === 'textarea');
            const notesVal = s && notesField ? (s[notesField.key] || '') : '';
            const combinedNotes = [notesVal, cfText].filter(Boolean).join(' | ');

            const dataCells = [
              dataCell(item.title),
              ...cols.map(f => dataCell(s ? (s[f.key] || '') : '', f.sensitive)),
            ];
            if (hasNotes) dataCells.push(dataCell(combinedNotes));
            rows.push(new TableRow({ children: dataCells }));
          }

          docChildren.push(new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }));
          continue;
        }

        // ── CUSTOM 分類：蒐集所有欄位，用表格 ──
        if (catKey === 'CUSTOM') {
          const allFieldLabels: string[] = [];
          const parsedItems: Array<{ item: DecryptedItem; fields: Record<string, string> }> = [];

          for (const item of groupItems) {
            const s = parseStructured(item.content);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cf = s ? ((s as any).customFields as CustomField[] | undefined) : undefined;
            const fields: Record<string, string> = {};
            if (cf) {
              for (const c of cf) {
                fields[c.label] = c.value;
                if (!allFieldLabels.includes(c.label)) allFieldLabels.push(c.label);
              }
            } else if (s) {
              for (const [k, v] of Object.entries(s)) {
                if (k === 'categoryLabel' || k === 'customFields') continue;
                fields[k] = String(v);
                if (!allFieldLabels.includes(k)) allFieldLabels.push(k);
              }
            }
            parsedItems.push({ item, fields });
          }

          if (allFieldLabels.length > 0) {
            const headerCells = [headerCell('名稱'), ...allFieldLabels.map(l => headerCell(l))];
            const rows = [new TableRow({ children: headerCells })];

            for (const { item, fields } of parsedItems) {
              const dataCells = [dataCell(item.title), ...allFieldLabels.map(l => dataCell(fields[l] || ''))];
              rows.push(new TableRow({ children: dataCells }));
            }

            docChildren.push(new Table({
              rows,
              width: { size: 100, type: WidthType.PERCENTAGE },
            }));
            continue;
          }
        }

        // ── 非結構化分類（筆記/其他）──
        for (const item of groupItems) {
          const s = parseStructured(item.content);
          let displayContent: string;
          if (s) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cf = (s as any).customFields as CustomField[] | undefined;
            const lines: string[] = [];
            for (const [k, v] of Object.entries(s)) {
              if (k === 'categoryLabel' || k === 'customFields') continue;
              lines.push(`${k}: ${String(v)}`);
            }
            if (cf) {
              for (const c of cf) {
                lines.push(`${c.label}: ${c.value}`);
              }
            }
            displayContent = lines.length > 0 ? lines.join('\n') : item.content;
          } else {
            displayContent = item.content;
          }
          docChildren.push(new Paragraph({
            spacing: { before: 100 },
            children: [new TextRun({ text: `■ ${item.title}`, bold: true, size: 20, font: 'Microsoft JhengHei' })],
          }));
          // 逐行輸出內容
          for (const line of displayContent.split('\n')) {
            docChildren.push(new Paragraph({
              spacing: { after: 40 },
              children: [new TextRun({ text: line, size: 18, font: 'Microsoft JhengHei' })],
            }));
          }
        }
      }

      // 頁尾
      docChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
        children: [new TextRun({ text: '拾日（Shiri）家庭手札 — 特別區備份', size: 14, color: 'AAAAAA', font: 'Microsoft JhengHei' })],
      }));

      // ── 產生並下載 ──
      const doc = new Document({
        sections: [{ children: docChildren }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `拾日特別區備份_${nowStr()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export Word error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`匯出失敗：${msg}`);
    }
  };

  /** 匯入 JSON 檔案 */
  const handleImportFile = () => {
    setShowBackupMenu(false);
    const token = getVaultToken();
    const key = cryptoKeyRef.current;
    if (!token || !key) { router.replace('/vault'); return; }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // 支援兩種格式：
        // 1. 陣列 [{title, category, content}, ...]
        // 2. 匯出格式 {items: [{title, category, content/fields}, ...]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let importItems: any[] = [];
        if (Array.isArray(data)) {
          importItems = data;
        } else if (data.items && Array.isArray(data.items)) {
          importItems = data.items;
        } else {
          setError('無法辨識的檔案格式');
          return;
        }

        if (importItems.length === 0) {
          setError('檔案中沒有項目');
          return;
        }

        // 詢問是否要指定分類（群組名稱）
        const assignLabel = prompt(
          `即將匯入 ${importItems.length} 個項目。\n\n` +
          `如要將所有項目歸入同一個分類群組，請輸入分類名稱（如：瑞興、俊鴻）。\n` +
          `留空則保留檔案中原有的分類設定。`,
          ''
        );
        // 使用者按取消 → 中止匯入
        if (assignLabel === null) return;
        const overrideLabel = assignLabel.trim();

        let success = 0;
        let failed = 0;

        for (const item of importItems) {
          try {
            const title = String(item.title || '未命名').trim();

            // 判斷分類
            let category = 'NOTE';
            if (overrideLabel) {
              // 使用者指定了分類名稱，強制設為 CUSTOM
              category = 'CUSTOM';
            } else if (item.category) {
              const catMap: Record<string, string> = {
                'PASSWORD': 'PASSWORD', '帳密': 'PASSWORD',
                'BANK': 'BANK', '銀行': 'BANK',
                'CREDIT_CARD': 'CREDIT_CARD', '信用卡': 'CREDIT_CARD',
                'FINANCE': 'FINANCE', '投資': 'FINANCE',
                'CUSTOM': 'CUSTOM', '自訂': 'CUSTOM',
                'NOTE': 'NOTE', '筆記': 'NOTE',
                'OTHER': 'OTHER', '其他': 'OTHER',
              };
              category = catMap[item.category] || 'NOTE';
            }

            // 建構 content
            let contentStr: string;
            if (overrideLabel) {
              // 使用者指定了分類，將內容包裝成 CUSTOM 格式
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let existingContent: any = {};
              if (typeof item.content === 'object' && item.content !== null) {
                existingContent = item.content;
              } else if (item.fields && typeof item.fields === 'object') {
                existingContent = item.fields;
              }
              existingContent.categoryLabel = overrideLabel;
              contentStr = JSON.stringify(existingContent);
            } else if (typeof item.content === 'object' && item.content !== null) {
              contentStr = JSON.stringify(item.content);
            } else if (item.fields && typeof item.fields === 'object') {
              contentStr = JSON.stringify(item.fields);
            } else {
              contentStr = String(item.content || ' ');
            }

            const { ciphertext: titleEnc, iv: titleIv } = await encrypt(key, title);
            const { ciphertext: contentEnc, iv: contentIv } = await encrypt(key, contentStr);

            const res = await fetch('/api/vault/items', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-vault-token': token,
              },
              body: JSON.stringify({
                titleEnc,
                contentEnc,
                category,
                iv: titleIv + '|' + contentIv,
              }),
            });

            if (res.ok) {
              success++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
        }

        alert(`匯入完成！成功 ${success} 筆${failed > 0 ? `，失敗 ${failed} 筆` : ''}`);

        // 重新載入頁面以顯示新項目
        window.location.reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : '匯入失敗');
      }
    };
    input.click();
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
      case 'BANK': return <Landmark size={14} />;
      case 'CREDIT_CARD': return <CreditCard size={14} />;
      case 'FINANCE': return <TrendingUp size={14} />;
      case 'NOTE': return <FileText size={14} />;
      case 'CUSTOM': return <Plus size={14} />;
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
            <>
              <button
                className={styles.memberBtn}
                onClick={() => { setShowChangePinPanel(!showChangePinPanel); setShowMemberPanel(false); setShowBackupMenu(false); }}
                type="button"
                title="更改密碼"
              >
                <Settings size={18} />
              </button>
              <div className={styles.backupMenuWrapper}>
                <button
                  className={styles.memberBtn}
                  onClick={() => { setShowBackupMenu(!showBackupMenu); setShowMemberPanel(false); setShowChangePinPanel(false); }}
                  type="button"
                  title="備份"
                >
                  <Download size={18} />
                </button>
                {showBackupMenu && (
                  <div className={styles.backupDropdown}>
                    <button type="button" className={styles.backupDropdownItem} onClick={handleExportFile}>
                      <Download size={16} />
                      <span>匯出檔案 (.docx)</span>
                    </button>

                    <button type="button" className={styles.backupDropdownItem} onClick={handleImportFile}>
                      <Upload size={16} />
                      <span>匯入檔案 (.json)</span>
                    </button>
                  </div>
                )}
              </div>
              <button
                className={styles.memberBtn}
                onClick={handleToggleMemberPanel}
                type="button"
                title="共享管理"
              >
                <Users size={18} />
              </button>
            </>
          )}
          {!batchMode ? (
            <button
              className={styles.memberBtn}
              onClick={() => { setBatchMode(true); setSelectedIds(new Set()); }}
              type="button"
              title="批次刪除"
            >
              <Trash2 size={18} />
            </button>
          ) : (
            <button
              className={styles.memberBtn}
              onClick={() => { setBatchMode(false); setSelectedIds(new Set()); }}
              type="button"
              title="取消批次"
            >
              <X size={18} />
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

      {/* 更改密碼面板 */}
      {showChangePinPanel && (
        <div className={styles.memberPanel}>
          <div className={styles.memberPanelHeader}>
            <Settings size={16} />
            <span>更改特別區密碼</span>
          </div>
          <div className={styles.changePinForm}>
            <div className={styles.changePinField}>
              <label className={styles.changePinLabel}>目前密碼</label>
              <input
                type={showPinFields ? 'text' : 'password'}
                className={styles.changePinInput}
                value={oldPinInput}
                onChange={(e) => setOldPinInput(e.target.value)}
                placeholder="輸入目前密碼"
                autoComplete="off"
                maxLength={20}
                disabled={changingPin}
              />
            </div>
            <div className={styles.changePinField}>
              <label className={styles.changePinLabel}>新密碼</label>
              <input
                type={showPinFields ? 'text' : 'password'}
                className={styles.changePinInput}
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value)}
                placeholder="大小寫英文+數字，至少6位"
                autoComplete="off"
                maxLength={20}
                disabled={changingPin}
              />
            </div>
            <div className={styles.changePinField}>
              <label className={styles.changePinLabel}>確認新密碼</label>
              <input
                type={showPinFields ? 'text' : 'password'}
                className={styles.changePinInput}
                value={confirmNewPin}
                onChange={(e) => setConfirmNewPin(e.target.value)}
                placeholder="再次輸入新密碼"
                autoComplete="off"
                maxLength={20}
                disabled={changingPin}
              />
            </div>
            <label className={styles.changePinShowToggle}>
              <input
                type="checkbox"
                checked={showPinFields}
                onChange={(e) => setShowPinFields(e.target.checked)}
              />
              <span>顯示密碼</span>
            </label>
            {changePinProgress && (
              <p className={styles.changePinProgress}>{changePinProgress}</p>
            )}
            {error && (
              <p className={styles.changePinError}>{error}</p>
            )}
            <div className={styles.changePinActions}>
              <button
                type="button"
                className={styles.formCancelBtn}
                onClick={() => {
                  setShowChangePinPanel(false);
                  setOldPinInput('');
                  setNewPinInput('');
                  setConfirmNewPin('');
                  setChangePinProgress('');
                }}
                disabled={changingPin}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.formSaveBtn}
                onClick={handleChangePin}
                disabled={changingPin || !oldPinInput || !newPinInput || !confirmNewPin}
              >
                {changingPin ? '處理中…' : '確認更改'}
              </button>
            </div>
          </div>
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
          onClick={() => {
            setShowAddForm(true);
            // 自動帶入目前篩選的分類
            if (activeTab !== 'ALL') {
              setNewCategory(activeTab);
              setFormFields({});
            }
          }}
        >
          <Plus size={18} />
          <span>新增項目</span>
        </button>
      )}

      {/* Add/Edit form */}
      {showAddForm && (
        <div className={styles.addForm}>
          {editingId && (
            <div className={styles.formHeader}>
              <Pencil size={14} />
              <span>編輯項目</span>
            </div>
          )}
          {/* 分類選擇晶片 */}
          <div className={styles.categoryChips}>
            {CATEGORIES.filter(c => c.key !== 'ALL').map(cat => (
              <button
                key={cat.key}
                type="button"
                className={`${styles.categoryChip} ${newCategory === cat.key ? styles.categoryChipActive : ''}`}
                onClick={() => { setNewCategory(cat.key); setFormFields({}); setFormShowFields(new Set()); setFormCustomFields([]); setCustomCategoryLabel(''); }}
              >
                <cat.icon size={12} />
                <span>{cat.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.formField}>
            <input
              type="text"
              className={styles.formInput}
              placeholder={getTitlePlaceholder(newCategory)}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* 結構化分類：動態欄位 */}
          {newCategory === 'CUSTOM' ? (
            <>
            {/* 自訂分類名稱 */}
            <div className={styles.formField}>
              <label className={styles.formFieldLabel}>分類名稱 *</label>
              <input
                type="text"
                className={styles.formInput}
                placeholder="如：保險、房產、車輛…"
                value={customCategoryLabel}
                onChange={e => setCustomCategoryLabel(e.target.value)}
                maxLength={30}
              />
            </div>
            {/* 全部都是自訂欄位 */}
            {formCustomFields.map((cf, idx) => (
              <div key={idx} className={styles.customFieldRow}>
                <input
                  type="text"
                  className={styles.customFieldLabel}
                  placeholder="欄位名稱"
                  value={cf.label}
                  onChange={e => {
                    const arr = [...formCustomFields];
                    arr[idx] = { ...arr[idx], label: e.target.value };
                    setFormCustomFields(arr);
                  }}
                />
                <div className={styles.sensitiveInputWrapper}>
                  <input
                    type={cf.sensitive && !formShowFields.has(`cf-${idx}`) ? 'password' : 'text'}
                    className={styles.formInput}
                    placeholder="值"
                    value={cf.value}
                    onChange={e => {
                      const arr = [...formCustomFields];
                      arr[idx] = { ...arr[idx], value: e.target.value };
                      setFormCustomFields(arr);
                    }}
                    autoComplete="off"
                  />
                  {cf.sensitive && (
                    <button
                      type="button"
                      className={styles.sensitiveToggleBtn}
                      onClick={() => setFormShowFields(prev => {
                        const next = new Set(prev);
                        const k = `cf-${idx}`;
                        if (next.has(k)) next.delete(k); else next.add(k);
                        return next;
                      })}
                      title={formShowFields.has(`cf-${idx}`) ? '隱藏' : '顯示'}
                    >
                      {formShowFields.has(`cf-${idx}`) ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
                </div>
                <div className={styles.customFieldActions}>
                  <label className={styles.customFieldSensitiveToggle} title="標記為敏感資料">
                    <input
                      type="checkbox"
                      checked={cf.sensitive}
                      onChange={e => {
                        const arr = [...formCustomFields];
                        arr[idx] = { ...arr[idx], sensitive: e.target.checked };
                        setFormCustomFields(arr);
                      }}
                    />
                    <Eye size={14} />
                  </label>
                  <button
                    type="button"
                    className={styles.customFieldDeleteBtn}
                    onClick={() => setFormCustomFields(prev => prev.filter((_, i) => i !== idx))}
                    title="刪除欄位"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className={styles.addCustomFieldBtn}
              onClick={() => setFormCustomFields(prev => [...prev, { label: '', value: '', sensitive: false }])}
            >
              <Plus size={14} />
              <span>新增欄位</span>
            </button>
            </>
          ) : isStructuredCategory(newCategory) ? (
            <>
            {CATEGORY_FIELDS[newCategory].map(field => (
              <div key={field.key} className={styles.formField}>
                <label className={styles.formFieldLabel}>{field.label}{field.required ? ' *' : ''}</label>
                {field.inputType === 'textarea' ? (
                  <textarea
                    className={styles.formTextarea}
                    placeholder={field.placeholder}
                    value={formFields[field.key] || ''}
                    onChange={e => setFormFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                    rows={2}
                  />
                ) : field.sensitive ? (
                  <div className={styles.sensitiveInputWrapper}>
                    <input
                      type={formShowFields.has(field.key) ? 'text' : 'password'}
                      className={styles.formInput}
                      placeholder={field.placeholder}
                      value={formFields[field.key] || ''}
                      onChange={e => setFormFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className={styles.sensitiveToggleBtn}
                      onClick={() => setFormShowFields(prev => {
                        const next = new Set(prev);
                        if (next.has(field.key)) next.delete(field.key); else next.add(field.key);
                        return next;
                      })}
                      title={formShowFields.has(field.key) ? '隱藏' : '顯示'}
                    >
                      {formShowFields.has(field.key) ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder={field.placeholder}
                    value={formFields[field.key] || ''}
                    onChange={e => setFormFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                    autoComplete="off"
                  />
                )}
              </div>
            ))}

            {/* 自訂欄位 */}
            {formCustomFields.map((cf, idx) => (
              <div key={idx} className={styles.customFieldRow}>
                <input
                  type="text"
                  className={styles.customFieldLabel}
                  placeholder="欄位名稱"
                  value={cf.label}
                  onChange={e => {
                    const arr = [...formCustomFields];
                    arr[idx] = { ...arr[idx], label: e.target.value };
                    setFormCustomFields(arr);
                  }}
                />
                <div className={styles.sensitiveInputWrapper}>
                  <input
                    type={cf.sensitive && !formShowFields.has(`cf-${idx}`) ? 'password' : 'text'}
                    className={styles.formInput}
                    placeholder="值"
                    value={cf.value}
                    onChange={e => {
                      const arr = [...formCustomFields];
                      arr[idx] = { ...arr[idx], value: e.target.value };
                      setFormCustomFields(arr);
                    }}
                    autoComplete="off"
                  />
                  {cf.sensitive && (
                    <button
                      type="button"
                      className={styles.sensitiveToggleBtn}
                      onClick={() => setFormShowFields(prev => {
                        const next = new Set(prev);
                        const k = `cf-${idx}`;
                        if (next.has(k)) next.delete(k); else next.add(k);
                        return next;
                      })}
                      title={formShowFields.has(`cf-${idx}`) ? '隱藏' : '顯示'}
                    >
                      {formShowFields.has(`cf-${idx}`) ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  )}
                </div>
                <div className={styles.customFieldActions}>
                  <label className={styles.customFieldSensitiveToggle} title="標記為敏感資料">
                    <input
                      type="checkbox"
                      checked={cf.sensitive}
                      onChange={e => {
                        const arr = [...formCustomFields];
                        arr[idx] = { ...arr[idx], sensitive: e.target.checked };
                        setFormCustomFields(arr);
                      }}
                    />
                    <Eye size={14} />
                  </label>
                  <button
                    type="button"
                    className={styles.customFieldDeleteBtn}
                    onClick={() => setFormCustomFields(prev => prev.filter((_, i) => i !== idx))}
                    title="刪除欄位"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className={styles.addCustomFieldBtn}
              onClick={() => setFormCustomFields(prev => [...prev, { label: '', value: '', sensitive: false }])}
            >
              <Plus size={14} />
              <span>新增自訂欄位</span>
            </button>
            </>
          ) : (
            <div className={styles.formField}>
              <textarea
                className={styles.formTextarea}
                placeholder="內容"
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                rows={3}
              />
            </div>
          )}

          <div className={styles.formActions}>
            <button
              type="button"
              className={styles.formCancelBtn}
              onClick={() => { setShowAddForm(false); setEditingId(null); setNewTitle(''); setNewContent(''); setFormFields({}); setFormShowFields(new Set()); setFormCustomFields([]); setCustomCategoryLabel(''); }}
            >
              取消
            </button>
            <button
              type="button"
              className={styles.formSaveBtn}
              onClick={editingId ? handleSaveEdit : handleAdd}
              disabled={saving || !newTitle.trim()}
            >
              {saving ? '儲存中…' : editingId ? '更新' : '儲存'}
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

        {(() => {
          // 將 CUSTOM 項目按 categoryLabel 分組，其他項目直接顯示
          const regularItems: DecryptedItem[] = [];
          const customGroups: Record<string, DecryptedItem[]> = {};

          for (const item of filteredItems) {
            if (item.category === 'CUSTOM') {
              const s = parseStructured(item.content);
              const label = s?.categoryLabel;
              if (label) {
                if (!customGroups[label]) customGroups[label] = [];
                customGroups[label].push(item);
              } else {
                // 沒有分類名稱的 CUSTOM 項目，直接與一般項目一起顯示
                regularItems.push(item);
              }
            } else {
              regularItems.push(item);
            }
          }

          const toggleGroup = (label: string) => {
            setExpandedGroups(prev => {
              const next = new Set(prev);
              if (next.has(label)) next.delete(label); else next.add(label);
              return next;
            });
          };

          const renderItemCard = (item: DecryptedItem) => (
          <div
            key={item.id}
            className={`${styles.itemCard} ${item.pinnedAt ? styles.itemCardPinned : ''} ${expandedId === item.id ? styles.itemCardExpanded : ''} ${batchMode && selectedIds.has(item.id) ? styles.itemCardSelected : ''}`}
          >
            <div
              className={styles.itemHeader}
              onClick={() => {
                if (batchMode) {
                  toggleSelect(item.id);
                } else {
                  setExpandedId(expandedId === item.id ? null : item.id);
                }
              }}
            >
              {batchMode && (
                <span className={styles.batchCheckbox}>
                  {selectedIds.has(item.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                </span>
              )}
              <span className={styles.itemCategoryIcon}>
                {getCategoryIcon(item.category)}
              </span>
              <span className={styles.itemTitle}>
                {item.title}
              </span>
              {item.pinnedAt && (
                <span className={styles.pinnedBadge} title="已置頂">
                  <Pin size={12} />
                </span>
              )}
              <span className={styles.itemDate}>{formatDate(item.updatedAt)}</span>
            </div>

            {expandedId === item.id && (
              <div className={styles.itemBody}>
                {(() => {
                  // 嘗試解析結構化內容（含 CUSTOM 分類）
                  const structured = (isStructuredCategory(item.category) || item.category === 'CUSTOM')
                    ? parseStructured(item.content) : null;
                  const fieldDefs = CATEGORY_FIELDS[item.category]; // CUSTOM 沒有 fieldDefs
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const customFields = structured ? ((structured as any).customFields as CustomField[] | undefined) : undefined;

                  if (structured && (fieldDefs || item.category === 'CUSTOM')) {
                    // ── 結構化顯示 ──
                    return (
                      <div className={styles.structuredFields}>
                        {/* CUSTOM 分類標籤 */}
                        {item.category === 'CUSTOM' && structured.categoryLabel && (
                          <div className={styles.fieldRow}>
                            <span className={styles.fieldLabel}>分類</span>
                            <div className={styles.fieldValueRow}>
                              <span className={styles.fieldValue}>{structured.categoryLabel}</span>
                            </div>
                          </div>
                        )}
                        {/* 預設欄位 */}
                        {fieldDefs?.map(f => {
                          const val = structured[f.key];
                          if (!val) return null;
                          const isHidden = f.sensitive && !showContent.has(`${item.id}-${f.key}`);
                          const feedbackKey = `${item.id}-${f.key}`;
                          return (
                            <div key={f.key} className={styles.fieldRow}>
                              <span className={styles.fieldLabel}>{f.label}</span>
                              <div className={styles.fieldValueRow}>
                                {f.inputType === 'url' ? (
                                  <a
                                    href={val.startsWith('http') ? val : `https://${val}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.fieldLink}
                                  >
                                    <ExternalLink size={12} />
                                    <span>{val}</span>
                                  </a>
                                ) : f.inputType === 'textarea' ? (
                                  <pre className={styles.fieldValue}>{val}</pre>
                                ) : (
                                  <span className={`${styles.fieldValue} ${f.sensitive ? styles.fieldMono : ''}`}>
                                    {isHidden ? '••••••••' : val}
                                  </span>
                                )}
                                <div className={styles.fieldActions}>
                                  {f.sensitive && (
                                    <button
                                      type="button"
                                      className={styles.fieldActionBtn}
                                      onClick={() => {
                                        setShowContent(prev => {
                                          const next = new Set(prev);
                                          const k = `${item.id}-${f.key}`;
                                          if (next.has(k)) next.delete(k); else next.add(k);
                                          return next;
                                        });
                                      }}
                                      title={isHidden ? '顯示' : '隱藏'}
                                    >
                                      {isHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className={styles.fieldActionBtn}
                                    onClick={() => handleCopy(val, feedbackKey)}
                                    title="複製"
                                  >
                                    <Copy size={14} />
                                    {copyFeedback === feedbackKey && <span className={styles.copyToast}>已複製</span>}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {/* 自訂欄位 */}
                        {customFields?.map((cf, idx) => {
                          const isHidden = cf.sensitive && !showContent.has(`${item.id}-cf-${idx}`);
                          const feedbackKey = `${item.id}-cf-${idx}`;
                          return (
                            <div key={`cf-${idx}`} className={styles.fieldRow}>
                              <span className={styles.fieldLabel}>{cf.label}</span>
                              <div className={styles.fieldValueRow}>
                                <span className={`${styles.fieldValue} ${cf.sensitive ? styles.fieldMono : ''}`}>
                                  {isHidden ? '••••••••' : cf.value}
                                </span>
                                <div className={styles.fieldActions}>
                                  {cf.sensitive && (
                                    <button
                                      type="button"
                                      className={styles.fieldActionBtn}
                                      onClick={() => {
                                        setShowContent(prev => {
                                          const next = new Set(prev);
                                          const k = `${item.id}-cf-${idx}`;
                                          if (next.has(k)) next.delete(k); else next.add(k);
                                          return next;
                                        });
                                      }}
                                      title={isHidden ? '顯示' : '隱藏'}
                                    >
                                      {isHidden ? <Eye size={14} /> : <EyeOff size={14} />}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className={styles.fieldActionBtn}
                                    onClick={() => handleCopy(cf.value, feedbackKey)}
                                    title="複製"
                                  >
                                    <Copy size={14} />
                                    {copyFeedback === feedbackKey && <span className={styles.copyToast}>已複製</span>}
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div className={styles.itemDeleteRow}>
                          <button
                            type="button"
                            className={`${styles.itemActionBtn} ${item.pinnedAt ? styles.itemPinnedBtn : ''}`}
                            onClick={() => handleTogglePin(item)}
                            title={item.pinnedAt ? '取消置頂' : '置頂'}
                          >
                            <Pin size={16} />
                          </button>
                          <button
                            type="button"
                            className={styles.itemActionBtn}
                            onClick={() => handleMoveCategory(item)}
                            title="移動分類"
                          >
                            <FolderInput size={16} />
                          </button>
                          <button
                            type="button"
                            className={styles.itemActionBtn}
                            onClick={() => handleStartEdit(item)}
                            title="編輯"
                          >
                            <Pencil size={16} />
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
                    );
                  }

                  // ── 純文字顯示（筆記/其他/舊資料） ──
                  return (
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
                          className={`${styles.itemActionBtn} ${item.pinnedAt ? styles.itemPinnedBtn : ''}`}
                          onClick={() => handleTogglePin(item)}
                          title={item.pinnedAt ? '取消置頂' : '置頂'}
                        >
                          <Pin size={16} />
                        </button>
                        <button
                          type="button"
                          className={styles.itemActionBtn}
                          onClick={() => handleMoveCategory(item)}
                          title="移動分類"
                        >
                          <FolderInput size={16} />
                        </button>
                        <button
                          type="button"
                          className={styles.itemActionBtn}
                          onClick={() => handleStartEdit(item)}
                          title="編輯"
                        >
                          <Pencil size={16} />
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
                  );
                })()}
              </div>
            )}
          </div>
        );

          return (
            <>
              {/* 自訂分類群組（可收合） */}
              {Object.entries(customGroups).map(([label, groupItems]) => {
                const groupIds = groupItems.map(i => i.id);
                const allGroupSelected = batchMode && groupIds.length > 0 && groupIds.every(id => selectedIds.has(id));
                return (
                <div key={`group-${label}`} className={styles.groupContainer}>
                  <div
                    className={styles.groupHeader}
                    onClick={() => {
                      if (batchMode) {
                        toggleSelectGroup(groupIds);
                      } else {
                        toggleGroup(label);
                      }
                    }}
                  >
                    {batchMode ? (
                      <span className={styles.batchCheckbox}>
                        {allGroupSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </span>
                    ) : (
                      <ChevronLeft
                        size={16}
                        className={`${styles.groupChevron} ${expandedGroups.has(label) ? styles.groupChevronOpen : ''}`}
                      />
                    )}
                    <span className={styles.groupLabel}>{label}</span>
                    <span className={styles.groupCount}>{batchMode ? `${groupIds.filter(id => selectedIds.has(id)).length}/${groupItems.length}` : groupItems.length}</span>
                  </div>
                  {expandedGroups.has(label) && (
                    <div className={styles.groupItems}>
                      {groupItems.map(item => renderItemCard(item))}
                    </div>
                  )}
                </div>
                );
              })}
              {/* 一般項目 */}
              {regularItems.map(item => renderItemCard(item))}
            </>
          );
        })()}
      </div>

      {/* 批次刪除操作列 */}
      {batchMode && (
        <div className={styles.batchBar}>
          <span className={styles.batchBarText}>
            已選取 {selectedIds.size} 個項目
          </span>
          <div className={styles.batchBarActions}>
            <button
              type="button"
              className={styles.batchBarCancel}
              onClick={() => { setBatchMode(false); setSelectedIds(new Set()); }}
            >
              取消
            </button>
            <button
              type="button"
              className={styles.batchBarDelete}
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0 || batchDeleting}
            >
              <Trash2 size={16} />
              {batchDeleting ? '刪除中...' : `刪除 (${selectedIds.size})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
