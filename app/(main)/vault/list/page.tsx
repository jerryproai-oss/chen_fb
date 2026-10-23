'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock, Plus, KeyRound, FileText, Package,
  Trash2, ChevronLeft, Search, Copy, Eye, EyeOff,
  Users, UserPlus, UserMinus, Shield, Settings,
  Download, Printer, Landmark, CreditCard, TrendingUp, ExternalLink,
  Pencil,
} from 'lucide-react';
import { deriveKey, decrypt, encrypt, generateSalt } from '@/lib/vault/crypto';
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

  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

  const formatFullDate = (d: string) => {
    const date = new Date(d);
    return `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const nowStr = () => {
    const d = new Date();
    return `${d.getFullYear()}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}_${d.getHours().toString().padStart(2, '0')}${d.getMinutes().toString().padStart(2, '0')}`;
  };

  /** 匯出為 JSON 檔案下載 */
  const handleExportFile = () => {
    if (items.length === 0) { setError('沒有可匯出的項目'); return; }

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedFrom: '拾日特別區',
      itemCount: items.length,
      items: items.map(item => {
        const structured = isStructuredCategory(item.category) ? parseStructured(item.content) : null;
        return {
          title: item.title,
          category: getCategoryLabel(item.category),
          ...(structured ? { fields: structured } : { content: item.content }),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
      }),
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `拾日特別區備份_${nowStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowBackupMenu(false);
  };

  /** 列印紙本備份 */
  const handlePrint = () => {
    if (items.length === 0) { setError('沒有可列印的項目'); return; }
    setShowBackupMenu(false);

    // 按分類分組
    const grouped: Record<string, DecryptedItem[]> = {};
    for (const item of items) {
      const label = getCategoryLabel(item.category);
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(item);
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) { setError('無法開啟列印視窗，請允許彈出視窗'); return; }

    const now = formatFullDate(new Date().toISOString());

    printWindow.document.write(`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<title>拾日特別區備份 — ${now}</title>
<style>
  @page { margin: 12mm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Microsoft JhengHei', 'PingFang TC', 'Noto Sans TC', sans-serif; color: #333; font-size: 9pt; line-height: 1.4; }
  .header { text-align: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #5a7a5a; }
  .header h1 { font-size: 14pt; color: #5a7a5a; margin-bottom: 2px; }
  .header .meta { font-size: 8pt; color: #888; }
  .warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 3px; padding: 4px 8px; margin-bottom: 10px; font-size: 8pt; color: #856404; text-align: center; }
  .category { margin-bottom: 12px; }
  .category h2 { font-size: 10pt; color: #5a7a5a; border-bottom: 1px solid #ddd; padding-bottom: 2px; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 9pt; }
  table th { background: #f3f1ec; text-align: left; padding: 3px 6px; border: 1px solid #ddd; font-weight: 600; white-space: nowrap; }
  table td { padding: 3px 6px; border: 1px solid #ddd; word-break: break-all; font-family: 'Consolas', 'Monaco', monospace; font-size: 8.5pt; }
  table td.notes { font-family: inherit; white-space: pre-wrap; }
  table td.date { font-size: 7.5pt; color: #999; white-space: nowrap; text-align: right; }
  .plain-item { margin-bottom: 6px; padding: 4px 6px; border: 1px solid #e0ddd8; border-radius: 3px; page-break-inside: avoid; }
  .plain-title { font-weight: 700; font-size: 9pt; margin-bottom: 2px; }
  .plain-content { white-space: pre-wrap; word-break: break-all; font-size: 8.5pt; }
  .plain-date { font-size: 7.5pt; color: #aaa; text-align: right; }
  .footer { text-align: center; margin-top: 12px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 7pt; color: #aaa; }
  @media print {
    .warning { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="header">
  <h1>🔐 拾日特別區備份</h1>
  <div class="meta">匯出：${now}　｜　共 ${items.length} 項</div>
</div>
<div class="warning">⚠️ 本文件含敏感資訊，請妥善保管或銷毀。</div>
${Object.entries(grouped).map(([label, groupItems]) => {
  // 結構化分類用表格
  const firstItem = groupItems[0];
  const fieldDefs = CATEGORY_FIELDS[firstItem.category];
  const isStruct = isStructuredCategory(firstItem.category);

  if (isStruct && fieldDefs) {
    // 表頭欄位
    const cols = fieldDefs.filter(f => f.inputType !== 'textarea');
    const hasNotes = fieldDefs.some(f => f.inputType === 'textarea');
    return `
<div class="category">
  <h2>${label}（${groupItems.length}）</h2>
  <table>
    <tr>
      <th>名稱</th>
      ${cols.map(f => `<th>${f.label}</th>`).join('')}
      ${hasNotes ? '<th>備註</th>' : ''}
      <th>更新</th>
    </tr>
    ${groupItems.map(item => {
      const s = parseStructured(item.content);
      // 自訂欄位
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cf = s ? ((s as any).customFields as CustomField[] | undefined) : undefined;
      const cfText = cf?.length ? cf.map(c => `${escapeHtml(c.label)}: ${escapeHtml(c.value)}`).join('; ') : '';
      const notesField = fieldDefs.find(f => f.inputType === 'textarea');
      const notesVal = s && notesField ? (s[notesField.key] || '') : '';
      const combinedNotes = [notesVal, cfText].filter(Boolean).join(' | ');
      return `<tr>
      <td><b>${escapeHtml(item.title)}</b></td>
      ${cols.map(f => `<td>${s ? escapeHtml(s[f.key] || '') : ''}</td>`).join('')}
      ${hasNotes ? `<td class="notes">${escapeHtml(combinedNotes)}</td>` : ''}
      <td class="date">${formatFullDate(item.updatedAt).slice(5)}</td>
    </tr>`;
    }).join('')}
  </table>
</div>`;
  }

  // 非結構化分類（筆記/其他）用簡單列表
  return `
<div class="category">
  <h2>${label}（${groupItems.length}）</h2>
  ${groupItems.map(item => `<div class="plain-item">
    <div class="plain-title">${escapeHtml(item.title)}</div>
    <div class="plain-content">${escapeHtml(item.content)}</div>
    <div class="plain-date">${formatFullDate(item.updatedAt)}</div>
  </div>`).join('')}
</div>`;
}).join('')}
<div class="footer">拾日（Shiri）家庭手札 — 特別區紙本備份</div>
</body>
</html>`);

    printWindow.document.close();
    // 等圖片/字型載入後列印
    setTimeout(() => { printWindow.print(); }, 300);
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
                      <span>匯出檔案 (.json)</span>
                    </button>
                    <button type="button" className={styles.backupDropdownItem} onClick={handlePrint}>
                      <Printer size={16} />
                      <span>列印紙本</span>
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

        {filteredItems.map(item => (
          <div
            key={item.id}
            className={`${styles.itemCard} ${expandedId === item.id ? styles.itemCardExpanded : ''}`}
          >
            <div
              className={styles.itemHeader}
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
              <span className={styles.itemCategoryIcon}>
                {getCategoryIcon(item.category)}
              </span>
              <span className={styles.itemTitle}>
                {item.category === 'CUSTOM' && (() => {
                  const s = parseStructured(item.content);
                  return s?.categoryLabel ? `[${s.categoryLabel}] ` : '';
                })()}
                {item.title}
              </span>
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
        ))}
      </div>
    </div>
  );
}
