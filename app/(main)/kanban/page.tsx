'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LayoutGrid,
  Plus,
  Search,
  MoreHorizontal,
  Columns3,
  CreditCard,
  Globe,
  Lock,
  Pencil,
  Archive,
  Trash2,
  X,
  ArrowLeft,
} from 'lucide-react';
import HelpGuide from '@/components/ui/HelpGuide';
import { kanbanHelp } from '@/lib/constants/help-content';
import styles from './page.module.css';

interface BoardItem {
  id: string;
  title: string;
  emoji: string;
  description: string | null;
  visibility: 'FAMILY' | 'PRIVATE';
  archived: boolean;
  creatorId: string;
  creator: { id: string; displayName: string; avatarUrl: string | null };
  columnsCount: number;
  cardsCount: number;
  createdAt: string;
  updatedAt: string;
}

type FilterType = 'all' | 'family' | 'private' | 'archived';

const TEMPLATES = [
  { key: 'chores', emoji: '🏠', title: '家務管理', desc: '待辦・進行中・完成' },
  { key: 'travel', emoji: '✈️', title: '旅行規劃', desc: '構想・規劃・預訂・出發' },
  { key: 'shopping', emoji: '🛒', title: '採購清單', desc: '待買・已買' },
  { key: 'study', emoji: '📚', title: '學習追蹤', desc: '待學習・進行中・完成・複習' },
  { key: 'health', emoji: '💪', title: '健康管理', desc: '目標・執行中・已達成' },
  { key: 'meal', emoji: '🍽️', title: '每週菜單', desc: '週一至週日・備料・完成' },
  { key: 'budget', emoji: '💰', title: '家庭預算', desc: '規劃・待繳・已繳' },
  { key: 'event', emoji: '🎉', title: '活動企劃', desc: '發想・準備・執行・回顧' },
  { key: 'reading', emoji: '📖', title: '閱讀計畫', desc: '想讀・閱讀中・讀完・推薦' },
  { key: 'moving', emoji: '📦', title: '搬家清單', desc: '打包・搬運・整理・完成' },
  { key: 'pet', emoji: '🐾', title: '寵物照顧', desc: '餵食・清潔・就醫・用品' },
  { key: 'garden', emoji: '🌱', title: '園藝種植', desc: '播種・照顧・收成' },
];

const EMOJIS = [
  '📋', '🏠', '✈️', '🛒', '📚', '🎯', '💡', '🎨',
  '🧹', '🎉', '📝', '⭐', '💪', '🍽️', '💰', '📦',
  '🐾', '🌱', '📖', '🎄', '🎓', '🏋️', '🎵', '🎮',
  '🏖️', '🧳', '🔧', '🏆', '❤️', '🌈', '🍳', '🧸',
];

export default function KanbanListPage() {
  const router = useRouter();
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [menuBoardId, setMenuBoardId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 建立看板表單狀態
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formEmoji, setFormEmoji] = useState('📋');
  const [formDesc, setFormDesc] = useState('');
  const [formVisibility, setFormVisibility] = useState<'FAMILY' | 'PRIVATE'>('FAMILY');
  const [creating, setCreating] = useState(false);

  async function fetchBoards() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('filter', filter);
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/kanban?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBoards(data.boards || []);
    } catch {
      setBoards([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // 關閉選單
  useEffect(() => {
    if (!menuBoardId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuBoardId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuBoardId]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchBoards();
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch('/api/kanban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          selectedTemplate
            ? { template: selectedTemplate, visibility: formVisibility }
            : {
                title: formTitle.trim(),
                emoji: formEmoji,
                description: formDesc.trim() || undefined,
                visibility: formVisibility,
              },
        ),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '建立失敗');
      }
      const data = await res.json();
      setShowCreate(false);
      router.push(`/kanban/${data.board.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : '建立看板失敗');
    } finally {
      setCreating(false);
    }
  }

  async function handleArchive(boardId: string, archived: boolean) {
    try {
      await fetch(`/api/kanban/${boardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      setMenuBoardId(null);
      fetchBoards();
    } catch {
      alert('操作失敗');
    }
  }

  async function handleDelete(boardId: string) {
    if (!confirm('確定要刪除此看板？所有欄位和卡片都會一併刪除。')) return;
    try {
      const res = await fetch(`/api/kanban/${boardId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '刪除失敗');
      }
      setMenuBoardId(null);
      fetchBoards();
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除看板失敗');
    }
  }

  function resetForm() {
    setSelectedTemplate(null);
    setFormTitle('');
    setFormEmoji('📋');
    setFormDesc('');
    setFormVisibility('FAMILY');
  }

  const canSubmit = selectedTemplate || formTitle.trim().length > 0;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/profile" className={styles.backLink}>
            <ArrowLeft size={18} />
          </Link>
          <h1 className={styles.title}>
            <LayoutGrid size={22} />
            看板
            <HelpGuide content={kanbanHelp} />
          </h1>
        </div>
      </div>

      {/* 搜尋與篩選 */}
      <div className={styles.controls}>
        <form className={styles.searchRow} onSubmit={handleSearch}>
          <input
            className={styles.searchInput}
            placeholder="搜尋看板..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className={styles.createBtn} onClick={() => { resetForm(); setShowCreate(true); }}>
            <Plus size={16} />
            新增
          </button>
        </form>
        <div className={styles.filterRow}>
          {([
            ['all', '全部'],
            ['family', '家庭'],
            ['private', '個人'],
            ['archived', '已封存'],
          ] as [FilterType, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`${styles.filterChip} ${filter === key ? styles.filterChipActive : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 看板列表 */}
      {loading ? (
        <div className={styles.loading}>載入中...</div>
      ) : boards.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyEmoji}>📋</div>
          <div className={styles.emptyTitle}>還沒有看板</div>
          <div className={styles.emptyDesc}>
            建立第一個看板，開始用拖拉的方式管理家庭任務吧！
          </div>
          <button className={styles.createBtn} onClick={() => { resetForm(); setShowCreate(true); }}>
            <Plus size={16} />
            建立看板
          </button>
        </div>
      ) : (
        <div className={styles.boardGrid}>
          {boards.map((board) => (
            <div key={board.id} className={styles.boardCard}>
              <Link href={`/kanban/${board.id}`} style={{ display: 'contents' }}>
                <div className={styles.boardEmoji}>{board.emoji}</div>
                <div className={styles.boardInfo}>
                  <div className={styles.boardTitle}>
                    {board.title}
                    <span className={`${styles.visibilityBadge} ${board.visibility === 'FAMILY' ? styles.badgeFamily : styles.badgePrivate}`}>
                      {board.visibility === 'FAMILY' ? <Globe size={11} /> : <Lock size={11} />}
                      {board.visibility === 'FAMILY' ? '家庭' : '個人'}
                    </span>
                    {board.archived && <span className={styles.archivedBadge}>已封存</span>}
                  </div>
                  {board.description && <div className={styles.boardDesc}>{board.description}</div>}
                  <div className={styles.boardMeta}>
                    <span className={styles.metaItem}>
                      <Columns3 size={13} />
                      {board.columnsCount} 欄
                    </span>
                    <span className={styles.metaItem}>
                      <CreditCard size={13} />
                      {board.cardsCount} 張卡片
                    </span>
                  </div>
                </div>
              </Link>
              <button
                className={styles.boardMenuBtn}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuBoardId(menuBoardId === board.id ? null : board.id); }}
              >
                <MoreHorizontal size={18} />
              </button>
              {menuBoardId === board.id && (
                <div className={styles.boardMenu} ref={menuRef}>
                  <button className={styles.boardMenuItem} onClick={() => { setMenuBoardId(null); router.push(`/kanban/${board.id}`); }}>
                    <Pencil size={15} /> 編輯
                  </button>
                  <button className={styles.boardMenuItem} onClick={() => handleArchive(board.id, !board.archived)}>
                    <Archive size={15} /> {board.archived ? '取消封存' : '封存'}
                  </button>
                  <button className={`${styles.boardMenuItem} ${styles.boardMenuItemDanger}`} onClick={() => handleDelete(board.id)}>
                    <Trash2 size={15} /> 刪除
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 新增看板 Modal */}
      {showCreate && (
        <div className={styles.modal}>
          <div className={styles.modalBackdrop} onClick={() => setShowCreate(false)} />
          <div className={styles.modalContent}>
            <button className={styles.modalClose} onClick={() => setShowCreate(false)}>
              <X size={20} />
            </button>
            <div className={styles.modalTitle}>
              <Plus size={20} />
              建立新看板
            </div>

            {/* 範本選擇 */}
            <div className={styles.formLabel}>從範本開始</div>
            <div className={styles.templateGrid}>
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  className={`${styles.templateCard} ${selectedTemplate === t.key ? styles.templateCardActive : ''}`}
                  onClick={() => {
                    setSelectedTemplate(selectedTemplate === t.key ? null : t.key);
                    if (selectedTemplate !== t.key) setFormTitle('');
                  }}
                >
                  <div className={styles.templateEmoji}>{t.emoji}</div>
                  <div className={styles.templateTitle}>{t.title}</div>
                  <div className={styles.templateDesc}>{t.desc}</div>
                </button>
              ))}
            </div>

            <div className={styles.divider}>或自訂看板</div>

            {/* 自訂表單 */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>圖示</label>
              <div className={styles.emojiPicker}>
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    className={`${styles.emojiBtn} ${formEmoji === e && !selectedTemplate ? styles.emojiBtnActive : ''}`}
                    onClick={() => { setFormEmoji(e); setSelectedTemplate(null); }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>看板名稱</label>
              <input
                className={styles.formInput}
                placeholder="例如：週末計畫"
                value={formTitle}
                onChange={(e) => { setFormTitle(e.target.value); setSelectedTemplate(null); }}
                maxLength={50}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>描述（選填）</label>
              <input
                className={styles.formInput}
                placeholder="看板說明..."
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>可見度</label>
              <div className={styles.visibilityToggle}>
                <button
                  className={`${styles.visibilityBtn} ${formVisibility === 'FAMILY' ? styles.visibilityBtnActive : ''}`}
                  onClick={() => setFormVisibility('FAMILY')}
                >
                  <Globe size={16} /> 家庭共用
                </button>
                <button
                  className={`${styles.visibilityBtn} ${formVisibility === 'PRIVATE' ? styles.visibilityBtnActive : ''}`}
                  onClick={() => setFormVisibility('PRIVATE')}
                >
                  <Lock size={16} /> 個人私用
                </button>
              </div>
            </div>

            <button
              className={styles.submitBtn}
              onClick={handleCreate}
              disabled={!canSubmit || creating}
            >
              {creating ? '建立中...' : '建立看板'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
