'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Search, Plus, UserPlus, Phone, Mail, MapPin, Building2,
  Briefcase, Calendar, StickyNote, X, Edit3, Trash2,
  Share2, Users, User, Camera, AlertTriangle, CakeSlice,
  PhoneCall, MessageCircle, Navigation,
} from 'lucide-react';
import HelpGuide from '@/components/ui/HelpGuide';
import { helpContents } from '@/lib/constants/help-content';
import styles from './page.module.css';

// ── 群組定義 ─────────────────────────────────────────
const GROUPS = [
  { key: 'all', label: '全部' },
  { key: 'family', label: '家人' },
  { key: 'friend', label: '朋友' },
  { key: 'work', label: '工作' },
  { key: 'school', label: '同學' },
  { key: 'neighbor', label: '鄰居' },
  { key: 'service', label: '服務/商家' },
  { key: 'medical', label: '醫療' },
  { key: 'other', label: '其他' },
] as const;

const GROUP_MAP: Record<string, string> = Object.fromEntries(
  GROUPS.filter(g => g.key !== 'all').map(g => [g.key, g.label])
);

// ── 頭像顏色 ─────────────────────────────────────────
const AVATAR_COLORS = [
  '#5a7a5a', '#8b6f47', '#6b8dad', '#a0756b',
  '#7b6b8d', '#5d8a7d', '#9b7a5c', '#6d7f6d',
];
function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── 型別 ─────────────────────────────────────────────
interface Contact {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
  address: string | null;
  birthday: string | null;
  note: string | null;
  group: string;
  isShared: boolean;
  createdAt: string;
  updatedAt: string;
  user?: { displayName: string };
}

type ViewMode = 'all' | 'personal' | 'shared';

// ── 主元件 ───────────────────────────────────────────
export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // ── 載入聯絡人 ─────────────────────────────────
  const fetchContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ view: viewMode });
      if (selectedGroup !== 'all') params.set('group', selectedGroup);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/contacts?${params}`);
      if (!res.ok) throw new Error('載入失敗');
      const data = await res.json();
      setContacts(data.contacts ?? []);
    } catch (err) {
      console.error('載入通訊錄失敗:', err);
    } finally {
      setLoading(false);
    }
  }, [viewMode, selectedGroup, search]);

  // ── 取得目前使用者 ID ────────────────────────────
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.id) setCurrentUserId(d.id); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(fetchContacts, 300);
    return () => clearTimeout(timer);
  }, [fetchContacts]);

  // ── 過濾與分組 ─────────────────────────────────
  const grouped = useMemo(() => {
    const sorted = [...contacts].sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-Hant')
    );
    const map = new Map<string, Contact[]>();
    for (const c of sorted) {
      // 取首字母作為分組標題
      const first = c.name[0]?.toUpperCase() ?? '#';
      if (!map.has(first)) map.set(first, []);
      map.get(first)!.push(c);
    }
    return map;
  }, [contacts]);

  const stats = useMemo(() => {
    const personal = contacts.filter(c => c.userId === currentUserId).length;
    const shared = contacts.filter(c => c.isShared).length;
    return { total: contacts.length, personal, shared };
  }, [contacts, currentUserId]);

  // ── 刪除 ───────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這位聯絡人嗎？')) return;
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('刪除失敗');
      setContacts(prev => prev.filter(c => c.id !== id));
      setSelectedContact(null);
    } catch (err) {
      alert('刪除失敗，請稍後再試');
    }
  };

  // ── 切換分享 ───────────────────────────────────
  const handleToggleShare = async (contact: Contact) => {
    try {
      const res = await fetch(`/api/contacts/${contact.id}/share`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isShared: !contact.isShared }),
      });
      if (!res.ok) throw new Error('操作失敗');
      const updated = await res.json();
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, isShared: updated.contact.isShared } : c));
      setSelectedContact(prev => prev?.id === contact.id ? { ...prev, isShared: updated.contact.isShared } : prev);
    } catch (err) {
      alert('操作失敗，請稍後再試');
    }
  };

  // ── 表單儲存 ───────────────────────────────────
  const handleSaveContact = async (data: Partial<Contact>, force = false) => {
    try {
      // 新增前檢查重複
      if (!editingContact && !force) {
        const params = new URLSearchParams({ name: data.name ?? '' });
        if (data.phone) params.set('phone', data.phone);
        const checkRes = await fetch(`/api/contacts/check-duplicate?${params}`);
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.duplicates?.length > 0) {
            return { duplicates: checkData.duplicates };
          }
        }
      }

      const url = editingContact
        ? `/api/contacts/${editingContact.id}`
        : '/api/contacts';
      const method = editingContact ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '儲存失敗');
      }
      const result = await res.json();
      if (editingContact) {
        setContacts(prev => prev.map(c => c.id === result.contact.id ? result.contact : c));
      } else {
        setContacts(prev => [...prev, result.contact]);
      }
      setShowForm(false);
      setEditingContact(null);
      return null;
    } catch (err: any) {
      alert(err.message || '儲存失敗');
      return null;
    }
  };

  // ── OCR 結果 ───────────────────────────────────
  const handleScanResult = (data: Partial<Contact>) => {
    setShowScanner(false);
    setEditingContact(null);
    setShowForm(true);
    // 預填 OCR 結果，讓使用者確認修改
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('prefill-contact', { detail: data }));
    }, 100);
  };

  // ── 渲染 ───────────────────────────────────────
  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>
        📖 通訊錄
        {helpContents.contacts && <HelpGuide content={helpContents.contacts} />}
      </h1>

      {/* 工具列 */}
      <div className={styles.toolbar}>
        <div className={styles.searchRow}>
          <div className={styles.searchWrapper}>
            <Search size={16} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              type="text"
              placeholder="搜尋姓名、電話、公司..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            className={styles.scanBtn}
            onClick={() => setShowScanner(true)}
            title="名片掃描"
          >
            <Camera size={18} />
          </button>
          <button
            className={styles.addBtn}
            onClick={() => { setEditingContact(null); setShowForm(true); }}
            title="新增聯絡人"
          >
            <Plus size={20} />
          </button>
        </div>

        {/* 檢視切換 */}
        <div className={styles.viewTabs}>
          {([
            { key: 'all' as ViewMode, label: '全部', icon: Users },
            { key: 'personal' as ViewMode, label: '我的通訊錄', icon: User },
            { key: 'shared' as ViewMode, label: '共同通訊錄', icon: Share2 },
          ]).map(tab => (
            <button
              key={tab.key}
              className={`${styles.viewTab} ${viewMode === tab.key ? styles.viewTabActive : ''}`}
              onClick={() => setViewMode(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 群組篩選 */}
        <div className={styles.groupFilter}>
          {GROUPS.map(g => (
            <button
              key={g.key}
              className={`${styles.groupChip} ${selectedGroup === g.key ? styles.groupChipActive : ''}`}
              onClick={() => setSelectedGroup(g.key)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* 統計 */}
      <div className={styles.stats}>
        <span className={styles.statItem}>
          共 <span className={styles.statCount}>{stats.total}</span> 位
        </span>
        <span className={styles.statItem}>
          我的 <span className={styles.statCount}>{stats.personal}</span>
        </span>
        <span className={styles.statItem}>
          共享 <span className={styles.statCount}>{stats.shared}</span>
        </span>
      </div>

      {/* 聯絡人列表 */}
      {loading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
        </div>
      ) : contacts.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📖</div>
          <div className={styles.emptyText}>
            {search ? '找不到符合的聯絡人' : '還沒有聯絡人'}
          </div>
          <div className={styles.emptySub}>
            {search ? '試試不同的關鍵字' : '點擊右上角 ＋ 新增第一位聯絡人'}
          </div>
        </div>
      ) : (
        <div className={styles.contactList}>
          {Array.from(grouped.entries()).map(([letter, list]) => (
            <div key={letter}>
              <div className={styles.groupLabel}>{letter}</div>
              {list.map(contact => (
                <div
                  key={contact.id}
                  className={styles.contactCard}
                  onClick={() => setSelectedContact(contact)}
                >
                  <div
                    className={styles.contactAvatar}
                    style={{ background: getAvatarColor(contact.name) }}
                  >
                    {contact.name[0]}
                  </div>
                  <div className={styles.contactInfo}>
                    <div className={styles.contactName}>
                      {contact.name}
                      {contact.isShared && (
                        <span className={styles.sharedBadge}>共享</span>
                      )}
                    </div>
                    <div className={styles.contactSub}>
                      {[contact.phone, contact.company].filter(Boolean).join(' · ') || '未設定電話'}
                    </div>
                  </div>
                  <span className={styles.contactGroupTag}>
                    {GROUP_MAP[contact.group] ?? contact.group}
                  </span>
                  {contact.phone && (
                    <div className={styles.contactActions}>
                      <a
                        href={`tel:${contact.phone}`}
                        className={styles.contactActionBtn}
                        onClick={e => e.stopPropagation()}
                        title="撥打電話"
                      >
                        <Phone size={16} />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 聯絡人詳情 Modal */}
      {selectedContact && (
        <ContactDetail
          contact={selectedContact}
          currentUserId={currentUserId}
          onClose={() => setSelectedContact(null)}
          onEdit={() => { setEditingContact(selectedContact); setSelectedContact(null); setShowForm(true); }}
          onDelete={() => handleDelete(selectedContact.id)}
          onToggleShare={() => handleToggleShare(selectedContact)}
        />
      )}

      {/* 新增/編輯表單 */}
      {showForm && (
        <ContactForm
          contact={editingContact}
          onClose={() => { setShowForm(false); setEditingContact(null); }}
          onSave={handleSaveContact}
        />
      )}

      {/* 名片掃描 */}
      {showScanner && (
        <BusinessCardScanner
          onClose={() => setShowScanner(false)}
          onResult={handleScanResult}
        />
      )}
    </div>
  );
}

// ── 聯絡人詳情元件 ─────────────────────────────────
function ContactDetail({
  contact, currentUserId, onClose, onEdit, onDelete, onToggleShare,
}: {
  contact: Contact;
  currentUserId: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleShare: () => void;
}) {
  const isOwner = contact.userId === currentUserId;

  const fields = [
    { icon: Phone, label: '電話', value: contact.phone, href: contact.phone ? `tel:${contact.phone}` : undefined },
    { icon: Phone, label: '電話（二）', value: contact.phone2, href: contact.phone2 ? `tel:${contact.phone2}` : undefined },
    { icon: Mail, label: 'Email', value: contact.email, href: contact.email ? `mailto:${contact.email}` : undefined },
    { icon: Building2, label: '公司', value: contact.company },
    { icon: Briefcase, label: '職稱', value: contact.jobTitle },
    { icon: MapPin, label: '地址', value: contact.address, href: contact.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}` : undefined },
    { icon: CakeSlice, label: '生日', value: contact.birthday ? new Date(contact.birthday).toLocaleDateString('zh-TW') : null },
    { icon: StickyNote, label: '備註', value: contact.note },
  ].filter(f => f.value);

  return (
    <div className={styles.detailOverlay} onClick={onClose}>
      <div className={styles.detailPanel} onClick={e => e.stopPropagation()}>
        <div className={styles.detailHeader}>
          <span className={styles.detailTitle}>聯絡人資訊</span>
          <button className={styles.detailCloseBtn} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.detailBody}>
          <div
            className={styles.detailAvatar}
            style={{ background: getAvatarColor(contact.name) }}
          >
            {contact.name[0]}
          </div>
          <div className={styles.detailName}>{contact.name}</div>
          {(contact.company || contact.jobTitle) && (
            <div className={styles.detailCompany}>
              {[contact.jobTitle, contact.company].filter(Boolean).join(' · ')}
            </div>
          )}
          {contact.isShared && contact.user && (
            <div className={styles.detailCompany}>
              由 {contact.user.displayName} 分享
            </div>
          )}

          {/* 快捷操作 */}
          <div className={styles.detailQuickActions}>
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className={styles.quickActionBtn}>
                <span className={styles.quickActionIcon}><PhoneCall size={18} /></span>
                撥打
              </a>
            )}
            {contact.phone && (
              <a href={`sms:${contact.phone}`} className={styles.quickActionBtn}>
                <span className={styles.quickActionIcon}><MessageCircle size={18} /></span>
                簡訊
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className={styles.quickActionBtn}>
                <span className={styles.quickActionIcon}><Mail size={18} /></span>
                郵件
              </a>
            )}
            {contact.address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.quickActionBtn}
              >
                <span className={styles.quickActionIcon}><Navigation size={18} /></span>
                導航
              </a>
            )}
          </div>

          {/* 詳細欄位 */}
          <div className={styles.detailFields}>
            {fields.map((f, i) => (
              <div key={i} className={styles.detailField}>
                <f.icon size={16} className={styles.detailFieldIcon} />
                <div className={styles.detailFieldContent}>
                  <div className={styles.detailFieldLabel}>{f.label}</div>
                  {f.href ? (
                    <a
                      href={f.href}
                      className={`${styles.detailFieldValue} ${styles.detailFieldLink}`}
                      target={f.href.startsWith('http') ? '_blank' : undefined}
                      rel={f.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    >
                      {f.value}
                    </a>
                  ) : (
                    <div className={styles.detailFieldValue}>{f.value}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部操作 */}
        {isOwner && (
          <div className={styles.detailFooter}>
            <button className={styles.detailShareBtn} onClick={onToggleShare}>
              <Share2 size={14} />
              {contact.isShared ? '取消共享' : '分享'}
            </button>
            <button className={styles.detailEditBtn} onClick={onEdit}>
              <Edit3 size={14} /> 編輯
            </button>
            <button className={styles.detailDeleteBtn} onClick={onDelete}>
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 表單元件 ──────────────────────────────────────────
function ContactForm({
  contact,
  onClose,
  onSave,
}: {
  contact: Contact | null;
  onClose: () => void;
  onSave: (data: Partial<Contact>, force?: boolean) => Promise<{ duplicates?: Contact[] } | null>;
}) {
  const [name, setName] = useState(contact?.name ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [phone2, setPhone2] = useState(contact?.phone2 ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [company, setCompany] = useState(contact?.company ?? '');
  const [jobTitle, setJobTitle] = useState(contact?.jobTitle ?? '');
  const [address, setAddress] = useState(contact?.address ?? '');
  const [birthday, setBirthday] = useState(
    contact?.birthday ? new Date(contact.birthday).toISOString().slice(0, 10) : ''
  );
  const [note, setNote] = useState(contact?.note ?? '');
  const [group, setGroup] = useState(contact?.group ?? 'other');
  const [isShared, setIsShared] = useState(contact?.isShared ?? false);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<Contact[]>([]);

  // 接收 OCR prefill 事件
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const d = e.detail;
      if (d.name) setName(d.name);
      if (d.phone) setPhone(d.phone);
      if (d.phone2) setPhone2(d.phone2);
      if (d.email) setEmail(d.email);
      if (d.company) setCompany(d.company);
      if (d.jobTitle) setJobTitle(d.jobTitle);
      if (d.address) setAddress(d.address);
    };
    window.addEventListener('prefill-contact', handler as EventListener);
    return () => window.removeEventListener('prefill-contact', handler as EventListener);
  }, []);

  const handleSubmit = async (force = false) => {
    if (!name.trim()) return alert('請輸入姓名');
    setSaving(true);
    setDuplicates([]);

    const data: any = {
      name: name.trim(),
      phone: phone.trim() || null,
      phone2: phone2.trim() || null,
      email: email.trim() || null,
      company: company.trim() || null,
      jobTitle: jobTitle.trim() || null,
      address: address.trim() || null,
      birthday: birthday || null,
      note: note.trim() || null,
      group,
      isShared,
    };

    const result = await onSave(data, force);
    setSaving(false);

    if (result?.duplicates?.length) {
      setDuplicates(result.duplicates);
    }
  };

  return (
    <div className={styles.formOverlay} onClick={onClose}>
      <div className={styles.formPanel} onClick={e => e.stopPropagation()}>
        <div className={styles.formHeader}>
          <span className={styles.formTitle}>
            {contact ? '編輯聯絡人' : '新增聯絡人'}
          </span>
          <button className={styles.detailCloseBtn} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.formBody}>
          {/* 重複警告 */}
          {duplicates.length > 0 && (
            <div className={styles.duplicateWarning}>
              <div className={styles.duplicateTitle}>
                <AlertTriangle size={14} /> 找到可能重複的聯絡人
              </div>
              {duplicates.map(d => (
                <div key={d.id} className={styles.duplicateItem}>
                  {d.name} {d.phone ? `(${d.phone})` : ''} {d.isShared ? '〔共享〕' : ''}
                </div>
              ))}
              <div className={styles.duplicateActions}>
                <button
                  className={styles.duplicateIgnoreBtn}
                  onClick={() => handleSubmit(true)}
                >
                  仍然新增
                </button>
                <button
                  className={styles.duplicateIgnoreBtn}
                  onClick={() => setDuplicates([])}
                >
                  取消
                </button>
              </div>
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              姓名 <span className={styles.formRequired}>*</span>
            </label>
            <input
              className={styles.formInput}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="請輸入姓名"
              autoFocus
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>電話（主要）</label>
              <input
                className={styles.formInput}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0912-345-678"
                type="tel"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>電話（次要）</label>
              <input
                className={styles.formInput}
                value={phone2}
                onChange={e => setPhone2(e.target.value)}
                placeholder="02-1234-5678"
                type="tel"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Email</label>
            <input
              className={styles.formInput}
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@mail.com"
              type="email"
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>公司 / 單位</label>
              <input
                className={styles.formInput}
                value={company}
                onChange={e => setCompany(e.target.value)}
                placeholder="公司名稱"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>職稱</label>
              <input
                className={styles.formInput}
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                placeholder="經理"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>地址</label>
            <input
              className={styles.formInput}
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="台北市..."
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>生日</label>
              <input
                className={styles.formInput}
                value={birthday}
                onChange={e => setBirthday(e.target.value)}
                type="date"
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>群組</label>
              <select
                className={styles.formSelect}
                value={group}
                onChange={e => setGroup(e.target.value)}
              >
                {GROUPS.filter(g => g.key !== 'all').map(g => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>備註</label>
            <textarea
              className={styles.formTextarea}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="備註..."
              rows={2}
            />
          </div>

          <label className={styles.formCheckbox}>
            <input
              type="checkbox"
              checked={isShared}
              onChange={e => setIsShared(e.target.checked)}
            />
            <span className={styles.formCheckboxLabel}>
              分享至共同通訊錄（所有家人可見）
            </span>
          </label>
        </div>

        <div className={styles.formFooter}>
          <button className={styles.formCancelBtn} onClick={onClose}>
            取消
          </button>
          <button
            className={styles.formSaveBtn}
            onClick={() => handleSubmit(false)}
            disabled={saving || !name.trim()}
          >
            {saving ? '儲存中...' : contact ? '更新' : '新增'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 名片掃描元件 ──────────────────────────────────────
function BusinessCardScanner({
  onClose,
  onResult,
}: {
  onClose: () => void;
  onResult: (data: Partial<Contact>) => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rawText, setRawText] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      return alert('請上傳圖片檔案');
    }
    const reader = new FileReader();
    reader.onload = e => setImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleScan = async () => {
    if (!image) return;
    setScanning(true);
    setProgress(0);

    try {
      // 動態載入 Tesseract.js
      const Tesseract = await import('tesseract.js');
      const worker = await Tesseract.createWorker('chi_tra+eng', undefined, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      const result = await worker.recognize(image);
      const text = result.data.text;
      setRawText(text);

      // 解析名片文字
      const parsed = parseBusinessCard(text);
      await worker.terminate();
      setScanning(false);

      // 自動填入表單
      if (text.trim()) {
        onResult(parsed);
      }
    } catch (err) {
      console.error('OCR 失敗:', err);
      alert('辨識失敗，請確認圖片清晰度');
      setScanning(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className={styles.scannerOverlay} onClick={onClose}>
      <div className={styles.scannerPanel} onClick={e => e.stopPropagation()}>
        <div className={styles.scannerHeader}>
          <span className={styles.scannerTitle}>📷 名片掃描辨識</span>
          <button className={styles.detailCloseBtn} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.scannerBody}>
          {!image && !scanning && (
            <div
              className={`${styles.scannerDropzone} ${isDragOver ? styles.scannerDropzoneActive : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
            >
              <Camera size={40} className={styles.scannerDropzoneIcon} />
              <div className={styles.scannerDropzoneText}>
                點擊上傳或拖放名片照片
              </div>
              <div className={styles.scannerDropzoneSub}>
                支援 JPG、PNG 格式
              </div>
            </div>
          )}

          {image && !scanning && !rawText && (
            <>
              <img src={image} alt="名片預覽" className={styles.scannerPreview} />
              <button
                className={styles.scannerUseBtn}
                onClick={handleScan}
                style={{ width: '100%', marginBottom: 8 }}
              >
                開始辨識
              </button>
              <button
                className={styles.scannerCancelBtn}
                onClick={() => { setImage(null); setRawText(''); }}
                style={{ width: '100%' }}
              >
                重新選擇
              </button>
            </>
          )}

          {scanning && (
            <div className={styles.scannerProgress}>
              <Camera size={40} className={styles.scannerDropzoneIcon} />
              <div className={styles.scannerProgressBar}>
                <div
                  className={styles.scannerProgressFill}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className={styles.scannerProgressText}>
                辨識中... {progress}%
              </div>
            </div>
          )}

          {rawText && !scanning && (
            <>
              <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: 8 }}>
                辨識結果（已自動填入表單）：
              </div>
              <div className={styles.scannerResultText}>{rawText}</div>
            </>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── 名片文字解析 ──────────────────────────────────────
function parseBusinessCard(text: string): Partial<Contact> {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result: Partial<Contact> = {};

  // 電話正則
  const phoneRegex = /(?:\+?886[-\s]?|0)[\d\s\-()]{7,}/;
  // Email 正則
  const emailRegex = /[\w.+-]+@[\w.-]+\.\w+/;
  // 地址關鍵字
  const addressKeywords = ['市', '縣', '區', '路', '街', '巷', '弄', '號', '樓'];
  // 職稱關鍵字
  const titleKeywords = ['經理', '主任', '總監', '總經理', '副總', '董事', '長', '師', '員', 'Manager', 'Director', 'CEO', 'CTO', 'VP', 'Engineer'];

  const phones: string[] = [];

  for (const line of lines) {
    // 提取 Email
    const emailMatch = line.match(emailRegex);
    if (emailMatch && !result.email) {
      result.email = emailMatch[0];
      continue;
    }

    // 提取電話
    const phoneMatch = line.match(phoneRegex);
    if (phoneMatch) {
      phones.push(phoneMatch[0].replace(/\s+/g, '').trim());
      continue;
    }

    // 提取地址
    if (addressKeywords.some(k => line.includes(k)) && line.length > 5 && !result.address) {
      result.address = line;
      continue;
    }

    // 提取職稱
    if (titleKeywords.some(k => line.includes(k)) && line.length < 20 && !result.jobTitle) {
      result.jobTitle = line;
      continue;
    }
  }

  // 分配電話
  if (phones.length > 0) result.phone = phones[0];
  if (phones.length > 1) result.phone2 = phones[1];

  // 猜測姓名（通常是第一行或較短的行）
  const nameCandidates = lines.filter(l =>
    l.length <= 6 &&
    l.length >= 2 &&
    !phoneRegex.test(l) &&
    !emailRegex.test(l) &&
    !addressKeywords.some(k => l.includes(k)) &&
    !l.includes('@') &&
    !l.includes('http')
  );
  if (nameCandidates.length > 0) {
    result.name = nameCandidates[0];
  }

  // 猜測公司（較長的非地址非電話行）
  const companyCandidates = lines.filter(l =>
    l.length > 3 &&
    l !== result.name &&
    l !== result.jobTitle &&
    l !== result.address &&
    !phoneRegex.test(l) &&
    !emailRegex.test(l) &&
    !addressKeywords.some(k => l.includes(k)) &&
    (l.includes('公司') || l.includes('有限') || l.includes('股份') || l.includes('事務所') || l.includes('企業') || l.includes('集團') || l.includes('Co') || l.includes('Inc') || l.includes('Ltd'))
  );
  if (companyCandidates.length > 0) {
    result.company = companyCandidates[0];
  }

  return result;
}
