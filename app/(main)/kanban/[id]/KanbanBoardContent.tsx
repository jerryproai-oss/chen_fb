'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  Settings,
  Plus,
  GripVertical,
  MoreHorizontal,
  Calendar,
  Flag,
  AlertCircle,
  CheckSquare,
  Square,
  Trash2,
  Pencil,
  X,
  ListChecks,
  User,
  Tag,
  FileText,
  Move,
  Globe,
  Lock,
  Archive,
} from 'lucide-react';
import HelpGuide from '@/components/ui/HelpGuide';
import { kanbanBoardHelp } from '@/lib/constants/help-content';
import styles from './page.module.css';

// ── Types ───────────────────────────────────────────────────

interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
  sortOrder: number;
}

interface KanbanCard {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | null;
  label: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  assignee: { id: string; displayName: string; avatarUrl: string | null } | null;
  createdBy: { id: string; displayName: string; avatarUrl: string | null };
  sortOrder: number;
  checklists: ChecklistItem[];
}

interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  sortOrder: number;
  cards: KanbanCard[];
}

interface Board {
  id: string;
  title: string;
  emoji: string;
  description: string | null;
  visibility: 'FAMILY' | 'PRIVATE';
  archived: boolean;
  creatorId: string;
  creator: { id: string; displayName: string; avatarUrl: string | null };
  columns: KanbanColumn[];
}

interface FamilyMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

const LABEL_COLORS = ['#ef5350', '#42a5f5', '#66bb6a', '#ffa726', '#ab47bc', '#26c6da', '#ec407a', '#8d6e63'];
const PRIORITY_MAP = {
  LOW: { label: '低', color: '#4caf50', bg: '#e8f5e9', Icon: Flag },
  MEDIUM: { label: '中', color: '#ff9800', bg: '#fff3e0', Icon: Flag },
  HIGH: { label: '高', color: '#f44336', bg: '#ffebee', Icon: Flag },
  URGENT: { label: '緊急', color: '#b71c1c', bg: '#ffcdd2', Icon: AlertCircle },
};
const EMOJIS = ['📋', '🏠', '✈️', '🛒', '📚', '🎯', '💡', '🎨', '🧹', '🎉', '📝', '⭐'];

// ── Sortable Card ───────────────────────────────────────────

function SortableCard({ card, onClick }: { card: KanbanCard; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', card },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const totalChecklist = card.checklists.length;
  const doneChecklist = card.checklists.filter((c) => c.checked).length;

  const dueStatus = getDueStatus(card.dueDate);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.card} ${isDragging ? styles.cardDragging : ''}`}
      onClick={onClick}
      {...attributes}
    >
      <div className={styles.cardGrip} {...listeners}>
        <GripVertical size={14} />
      </div>
      {card.label && <div className={styles.cardLabel} style={{ background: card.label }} />}
      <div className={styles.cardTitle}>{card.title}</div>
      <div className={styles.cardMeta}>
        {card.priority && (
          <span
            className={`${styles.cardPriority} ${styles[`priority${card.priority.charAt(0) + card.priority.slice(1).toLowerCase()}`]}`}
          >
            {PRIORITY_MAP[card.priority] && (() => {
              const P = PRIORITY_MAP[card.priority!];
              return <><P.Icon size={12} /> {P.label}</>;
            })()}
          </span>
        )}
        {card.dueDate && (
          <span className={`${styles.cardDueDate} ${dueStatus === 'overdue' ? styles.cardDueDateOverdue : ''} ${dueStatus === 'soon' ? styles.cardDueDateSoon : ''}`}>
            <Calendar size={12} />
            {formatDate(card.dueDate)}
          </span>
        )}
        {totalChecklist > 0 && (
          <span className={styles.cardChecklist}>
            <CheckSquare size={12} />
            {doneChecklist}/{totalChecklist}
            <span className={styles.checklistBar}>
              <span className={styles.checklistBarFill} style={{ width: `${(doneChecklist / totalChecklist) * 100}%` }} />
            </span>
          </span>
        )}
        {card.assignee && (
          card.assignee.avatarUrl ? (
            <img src={card.assignee.avatarUrl} alt={card.assignee.displayName} className={styles.cardAssigneeImg} title={card.assignee.displayName} />
          ) : (
            <span className={styles.cardAssignee} title={card.assignee.displayName}>
              {card.assignee.displayName.charAt(0)}
            </span>
          )
        )}
      </div>
    </div>
  );
}

// ── Sortable Column ─────────────────────────────────────────

function SortableColumn({
  column,
  onAddCard,
  onEditColumn,
  onDeleteColumn,
  onCardClick,
}: {
  column: KanbanColumn;
  onAddCard: (columnId: string, title: string) => void;
  onEditColumn: (column: KanbanColumn) => void;
  onDeleteColumn: (columnId: string) => void;
  onCardClick: (card: KanbanCard) => void;
}) {
  const [showAddCard, setShowAddCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `column-${column.id}`,
    data: { type: 'column', column },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    '--column-color': column.color,
  } as React.CSSProperties;

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  function handleAddCard() {
    if (!newCardTitle.trim()) return;
    onAddCard(column.id, newCardTitle.trim());
    setNewCardTitle('');
    setShowAddCard(false);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.column} ${isDragging ? styles.columnDragging : ''}`}
      {...attributes}
    >
      <div className={styles.columnHeader}>
        <div className={styles.columnTitle} {...listeners} style={{ cursor: 'grab' }}>
          <GripVertical size={14} />
          {column.title}
          <span className={styles.columnCount}>{column.cards.length}</span>
        </div>
        <div className={styles.columnActions} style={{ position: 'relative' }}>
          <button className={styles.columnActionBtn} onClick={() => setShowMenu(!showMenu)}>
            <MoreHorizontal size={16} />
          </button>
          {showMenu && (
            <div className={styles.columnMenu} ref={menuRef}>
              <button className={styles.columnMenuItem} onClick={() => { setShowMenu(false); onEditColumn(column); }}>
                <Pencil size={14} /> 編輯欄位
              </button>
              <button className={`${styles.columnMenuItem} ${styles.columnMenuItemDanger}`} onClick={() => { setShowMenu(false); onDeleteColumn(column.id); }}>
                <Trash2 size={14} /> 刪除欄位
              </button>
            </div>
          )}
        </div>
      </div>

      <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className={styles.columnBody}>
          {column.cards.length === 0 && !showAddCard && (
            <div className={styles.emptyColumn}>拖曳卡片到這裡</div>
          )}
          {column.cards.map((card) => (
            <SortableCard key={card.id} card={card} onClick={() => onCardClick(card)} />
          ))}
        </div>
      </SortableContext>

      <div className={styles.addCardArea}>
        {showAddCard ? (
          <div className={styles.addCardForm}>
            <input
              className={styles.addCardInput}
              placeholder="輸入卡片標題..."
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCard(); if (e.key === 'Escape') setShowAddCard(false); }}
              autoFocus
            />
            <div className={styles.addCardActions}>
              <button className={styles.addCardSubmit} onClick={handleAddCard}>新增</button>
              <button className={styles.addCardCancel} onClick={() => setShowAddCard(false)}><X size={16} /></button>
            </div>
          </div>
        ) : (
          <button className={styles.addCardBtn} onClick={() => setShowAddCard(true)}>
            <Plus size={14} /> 新增卡片
          </button>
        )}
      </div>
    </div>
  );
}

// ── Helper functions ────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function getDueStatus(dueDate: string | null): 'overdue' | 'soon' | 'normal' | null {
  if (!dueDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = due.getTime() - now.getTime();
  if (diff < 0) return 'overdue';
  if (diff <= 3 * 24 * 60 * 60 * 1000) return 'soon';
  return 'normal';
}

function toDateInputValue(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toISOString().split('T')[0];
}

// ── Main Page ───────────────────────────────────────────────

export default function KanbanBoardContent() {
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [boardId, setBoardId] = useState('');

  // 卡片詳情 modal
  const [detailCard, setDetailCard] = useState<KanbanCard | null>(null);
  const [detailTitle, setDetailTitle] = useState('');
  const [detailDesc, setDetailDesc] = useState('');
  const [detailPriority, setDetailPriority] = useState('');
  const [detailLabel, setDetailLabel] = useState('');
  const [detailDueDate, setDetailDueDate] = useState('');
  const [detailAssignee, setDetailAssignee] = useState('');
  const [detailColumnId, setDetailColumnId] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');

  // 設定 modal
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTitle, setSettingsTitle] = useState('');
  const [settingsEmoji, setSettingsEmoji] = useState('');
  const [settingsDesc, setSettingsDesc] = useState('');
  const [settingsVisibility, setSettingsVisibility] = useState<'FAMILY' | 'PRIVATE'>('FAMILY');

  // 新增欄位
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');

  // 家庭成員
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);

  // DnD
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'card' | 'column' | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // 從 URL 取得 board id
  useEffect(() => {
    const pathParts = window.location.pathname.split('/');
    const id = pathParts[pathParts.length - 1];
    setBoardId(id);
  }, []);

  const fetchBoard = useCallback(async () => {
    if (!boardId) return;
    try {
      const res = await fetch(`/api/kanban/${boardId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBoard(data.board);
    } catch {
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  useEffect(() => {
    fetch('/api/family/members')
      .then((r) => r.json())
      .then((d) => setFamilyMembers(d.members || []))
      .catch(() => {});
  }, []);

  // ── 看板操作 ──────────────────────────

  async function handleAddCard(columnId: string, title: string) {
    try {
      const res = await fetch(`/api/kanban/${boardId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, title }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((col) =>
            col.id === columnId ? { ...col, cards: [...col.cards, data.card] } : col
          ),
        };
      });
    } catch {
      alert('新增卡片失敗');
    }
  }

  async function handleAddColumn() {
    if (!newColumnTitle.trim()) return;
    try {
      const res = await fetch(`/api/kanban/${boardId}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newColumnTitle.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBoard((prev) => prev ? { ...prev, columns: [...prev.columns, { ...data.column, cards: data.column.cards || [] }] } : prev);
      setNewColumnTitle('');
      setShowAddColumn(false);
    } catch {
      alert('新增欄位失敗');
    }
  }

  async function handleEditColumn(column: KanbanColumn) {
    const newTitle = prompt('欄位名稱', column.title);
    if (!newTitle || newTitle.trim() === column.title) return;
    try {
      await fetch(`/api/kanban/columns/${column.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((c) => c.id === column.id ? { ...c, title: newTitle.trim() } : c),
        };
      });
    } catch {
      alert('修改欄位失敗');
    }
  }

  async function handleDeleteColumn(columnId: string) {
    if (!confirm('確定要刪除此欄位？所有卡片也會一併刪除。')) return;
    try {
      await fetch(`/api/kanban/columns/${columnId}`, { method: 'DELETE' });
      setBoard((prev) => prev ? { ...prev, columns: prev.columns.filter((c) => c.id !== columnId) } : prev);
    } catch {
      alert('刪除欄位失敗');
    }
  }

  // ── 卡片詳情 ──────────────────────────

  function openCardDetail(card: KanbanCard) {
    setDetailCard(card);
    setDetailTitle(card.title);
    setDetailDesc(card.description || '');
    setDetailPriority(card.priority || '');
    setDetailLabel(card.label || '');
    setDetailDueDate(toDateInputValue(card.dueDate));
    setDetailAssignee(card.assigneeId || '');
    setDetailColumnId(card.columnId);
    setNewChecklistText('');
  }

  async function saveCardDetail() {
    if (!detailCard) return;
    try {
      const res = await fetch(`/api/kanban/cards/${detailCard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: detailTitle.trim(),
          description: detailDesc.trim() || null,
          priority: detailPriority || null,
          label: detailLabel || null,
          dueDate: detailDueDate || null,
          assigneeId: detailAssignee || null,
          columnId: detailColumnId,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      // 更新 board state
      setBoard((prev) => {
        if (!prev) return prev;
        const updatedCard = data.card;
        return {
          ...prev,
          columns: prev.columns.map((col) => {
            // 如果卡片被移動到其他欄位
            if (col.id === detailCard.columnId && detailCard.columnId !== detailColumnId) {
              return { ...col, cards: col.cards.filter((c) => c.id !== detailCard.id) };
            }
            if (col.id === detailColumnId) {
              const existingIdx = col.cards.findIndex((c) => c.id === updatedCard.id);
              if (existingIdx >= 0) {
                const newCards = [...col.cards];
                newCards[existingIdx] = updatedCard;
                return { ...col, cards: newCards };
              }
              return { ...col, cards: [...col.cards, updatedCard] };
            }
            return {
              ...col,
              cards: col.cards.map((c) => c.id === updatedCard.id ? updatedCard : c),
            };
          }),
        };
      });
      setDetailCard(null);
    } catch {
      alert('儲存失敗');
    }
  }

  async function deleteCard() {
    if (!detailCard) return;
    if (!confirm('確定要刪除此卡片？')) return;
    try {
      await fetch(`/api/kanban/cards/${detailCard.id}`, { method: 'DELETE' });
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((col) => ({
            ...col,
            cards: col.cards.filter((c) => c.id !== detailCard.id),
          })),
        };
      });
      setDetailCard(null);
    } catch {
      alert('刪除失敗');
    }
  }

  // ── Checklist 操作 ────────────────────

  async function addChecklist() {
    if (!detailCard || !newChecklistText.trim()) return;
    try {
      const res = await fetch(`/api/kanban/cards/${detailCard.id}/checklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newChecklistText.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newItem = data.checklist;
      setDetailCard((prev) => prev ? { ...prev, checklists: [...prev.checklists, newItem] } : prev);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((col) => ({
            ...col,
            cards: col.cards.map((c) => c.id === detailCard.id ? { ...c, checklists: [...c.checklists, newItem] } : c),
          })),
        };
      });
      setNewChecklistText('');
    } catch {
      alert('新增子任務失敗');
    }
  }

  async function toggleChecklist(item: ChecklistItem) {
    if (!detailCard) return;
    try {
      await fetch(`/api/kanban/cards/${detailCard.id}/checklists`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, checked: !item.checked }),
      });
      const updatedChecklists = detailCard.checklists.map((c) =>
        c.id === item.id ? { ...c, checked: !c.checked } : c,
      );
      setDetailCard((prev) => prev ? { ...prev, checklists: updatedChecklists } : prev);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((col) => ({
            ...col,
            cards: col.cards.map((c) => c.id === detailCard.id ? { ...c, checklists: updatedChecklists } : c),
          })),
        };
      });
    } catch {
      alert('操作失敗');
    }
  }

  async function deleteChecklist(itemId: string) {
    if (!detailCard) return;
    try {
      await fetch(`/api/kanban/cards/${detailCard.id}/checklists?id=${itemId}`, { method: 'DELETE' });
      const updatedChecklists = detailCard.checklists.filter((c) => c.id !== itemId);
      setDetailCard((prev) => prev ? { ...prev, checklists: updatedChecklists } : prev);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: prev.columns.map((col) => ({
            ...col,
            cards: col.cards.map((c) => c.id === detailCard.id ? { ...c, checklists: updatedChecklists } : c),
          })),
        };
      });
    } catch {
      alert('刪除失敗');
    }
  }

  // ── 看板設定 ──────────────────────────

  function openSettings() {
    if (!board) return;
    setSettingsTitle(board.title);
    setSettingsEmoji(board.emoji);
    setSettingsDesc(board.description || '');
    setSettingsVisibility(board.visibility);
    setShowSettings(true);
  }

  async function saveSettings() {
    if (!board) return;
    try {
      const res = await fetch(`/api/kanban/${board.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: settingsTitle.trim(),
          emoji: settingsEmoji,
          description: settingsDesc.trim() || null,
          visibility: settingsVisibility,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '儲存失敗');
      }
      setBoard((prev) => prev ? {
        ...prev,
        title: settingsTitle.trim(),
        emoji: settingsEmoji,
        description: settingsDesc.trim() || null,
        visibility: settingsVisibility,
      } : prev);
      setShowSettings(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '儲存失敗');
    }
  }

  async function archiveBoard() {
    if (!board) return;
    try {
      await fetch(`/api/kanban/${board.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: !board.archived }),
      });
      setShowSettings(false);
      router.push('/kanban');
    } catch {
      alert('操作失敗');
    }
  }

  async function deleteBoard() {
    if (!board) return;
    if (!confirm('確定要刪除此看板？所有資料都會永久刪除。')) return;
    try {
      await fetch(`/api/kanban/${board.id}`, { method: 'DELETE' });
      router.push('/kanban');
    } catch {
      alert('刪除失敗');
    }
  }

  // ── DnD 處理 ──────────────────────────

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const type = active.data?.current?.type;
    setActiveId(active.id as string);
    setActiveType(type);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || !board) return;

    const activeData = active.data?.current;
    const overData = over.data?.current;

    // 只處理卡片跨欄位移動
    if (activeData?.type !== 'card') return;

    const activeCard = activeData.card as KanbanCard;
    let overColumnId: string | null = null;

    if (overData?.type === 'card') {
      const overCard = overData.card as KanbanCard;
      overColumnId = overCard.columnId;
    } else if (overData?.type === 'column') {
      overColumnId = overData.column.id;
    } else {
      // over 可能是 column 的 sortable id
      const overId = over.id as string;
      if (overId.startsWith('column-')) {
        overColumnId = overId.replace('column-', '');
      }
    }

    if (!overColumnId || activeCard.columnId === overColumnId) return;

    // 移動卡片到新欄位
    setBoard((prev) => {
      if (!prev) return prev;
      const sourceCol = prev.columns.find((c) => c.id === activeCard.columnId);
      const destCol = prev.columns.find((c) => c.id === overColumnId);
      if (!sourceCol || !destCol) return prev;

      const movedCard = sourceCol.cards.find((c) => c.id === activeCard.id);
      if (!movedCard) return prev;

      return {
        ...prev,
        columns: prev.columns.map((col) => {
          if (col.id === activeCard.columnId) {
            return { ...col, cards: col.cards.filter((c) => c.id !== activeCard.id) };
          }
          if (col.id === overColumnId) {
            const updatedCard = { ...movedCard, columnId: overColumnId! };
            // 找到 over 卡片的位置
            if (overData?.type === 'card') {
              const overIdx = col.cards.findIndex((c) => c.id === (overData.card as KanbanCard).id);
              const newCards = [...col.cards];
              newCards.splice(overIdx, 0, updatedCard);
              return { ...col, cards: newCards };
            }
            return { ...col, cards: [...col.cards, updatedCard] };
          }
          return col;
        }),
      };
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveType(null);

    if (!over || !board) return;

    if (activeType === 'column') {
      // 欄位排序
      const oldId = (active.id as string).replace('column-', '');
      const newId = (over.id as string).replace('column-', '');
      if (oldId === newId) return;

      const oldIndex = board.columns.findIndex((c) => c.id === oldId);
      const newIndex = board.columns.findIndex((c) => c.id === newId);
      if (oldIndex < 0 || newIndex < 0) return;

      const newColumns = arrayMove(board.columns, oldIndex, newIndex);
      setBoard((prev) => prev ? { ...prev, columns: newColumns } : prev);

      // 儲存到後端
      fetch('/api/kanban/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: newColumns.map((c, idx) => ({ id: c.id, sortOrder: idx })),
        }),
      }).catch(() => {});
    } else if (activeType === 'card') {
      // 卡片排序（同欄位或跨欄位已在 dragOver 處理）
      const activeCardId = active.id as string;
      const overData = over.data?.current;

      if (overData?.type === 'card' && overData.card) {
        const overCard = overData.card as KanbanCard;
        const col = board.columns.find((c) => c.cards.some((card) => card.id === activeCardId));
        if (!col) return;

        const oldIndex = col.cards.findIndex((c) => c.id === activeCardId);
        const newIndex = col.cards.findIndex((c) => c.id === overCard.id);
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

        const newCards = arrayMove(col.cards, oldIndex, newIndex);
        setBoard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            columns: prev.columns.map((c) => c.id === col.id ? { ...c, cards: newCards } : c),
          };
        });
      }

      // 儲存卡片排序到後端
      const allCards: { id: string; columnId: string; sortOrder: number }[] = [];
      (board.columns).forEach((col) => {
        // 使用最新 state
        const currentCol = board.columns.find((c) => c.id === col.id);
        if (!currentCol) return;
        currentCol.cards.forEach((card, idx) => {
          allCards.push({ id: card.id, columnId: currentCol.id, sortOrder: idx });
        });
      });

      fetch('/api/kanban/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cards: allCards }),
      }).catch(() => {});
    }
  }

  // ── Render ────────────────────────────

  if (loading) {
    return <div className={styles.loading}>載入中...</div>;
  }

  if (!board) {
    return (
      <div className={styles.loading}>
        看板不存在或無權限查看。
        <Link href="/kanban" style={{ marginLeft: 8, color: 'var(--color-primary)' }}>返回列表</Link>
      </div>
    );
  }

  const checklistTotal = detailCard ? detailCard.checklists.length : 0;
  const checklistDone = detailCard ? detailCard.checklists.filter((c) => c.checked).length : 0;

  return (
    <div className={styles.page}>
      {/* 頂部工具列 */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Link href="/kanban" className={styles.backLink}>
            <ArrowLeft size={18} />
          </Link>
          <div className={styles.boardTitleRow}>
            <span className={styles.boardEmoji}>{board.emoji}</span>
            <h1 className={styles.boardTitle}>{board.title}</h1>
            <HelpGuide content={kanbanBoardHelp} />
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <button className={styles.toolbarBtn} onClick={openSettings} title="看板設定">
            <Settings size={20} />
          </button>
        </div>
      </div>

      {/* 看板區域 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.boardContainer}>
          <SortableContext
            items={board.columns.map((c) => `column-${c.id}`)}
            strategy={horizontalListSortingStrategy}
          >
            {board.columns.map((column) => (
              <SortableColumn
                key={column.id}
                column={column}
                onAddCard={handleAddCard}
                onEditColumn={handleEditColumn}
                onDeleteColumn={handleDeleteColumn}
                onCardClick={openCardDetail}
              />
            ))}
          </SortableContext>

          {/* 新增欄位 */}
          <div className={styles.addColumn}>
            {showAddColumn ? (
              <div className={styles.addColumnForm}>
                <input
                  className={styles.addColumnInput}
                  placeholder="欄位名稱..."
                  value={newColumnTitle}
                  onChange={(e) => setNewColumnTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') setShowAddColumn(false); }}
                  autoFocus
                />
                <div className={styles.addColumnActions}>
                  <button className={styles.addCardSubmit} onClick={handleAddColumn}>新增</button>
                  <button className={styles.addCardCancel} onClick={() => setShowAddColumn(false)}><X size={16} /></button>
                </div>
              </div>
            ) : (
              <button className={styles.addColumnBtn} onClick={() => setShowAddColumn(true)}>
                <Plus size={16} /> 新增欄位
              </button>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeId && activeType === 'card' && (() => {
            for (const col of board.columns) {
              const card = col.cards.find((c) => c.id === activeId);
              if (card) {
                return (
                  <div className={`${styles.card} ${styles.cardDragOverlay}`}>
                    {card.label && <div className={styles.cardLabel} style={{ background: card.label }} />}
                    <div className={styles.cardTitle}>{card.title}</div>
                  </div>
                );
              }
            }
            return null;
          })()}
        </DragOverlay>
      </DndContext>

      {/* 卡片詳情 Modal */}
      {detailCard && (
        <div className={styles.detailModal}>
          <div className={styles.detailBackdrop} onClick={saveCardDetail} />
          <div className={styles.detailContent}>
            <button className={styles.detailClose} onClick={saveCardDetail}>
              <X size={20} />
            </button>

            <div className={styles.detailTitleRow}>
              <input
                className={styles.detailTitleInput}
                value={detailTitle}
                onChange={(e) => setDetailTitle(e.target.value)}
                placeholder="卡片標題"
              />
            </div>

            {/* 描述 */}
            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>
                <FileText size={16} /> 描述
              </div>
              <textarea
                className={styles.detailTextarea}
                value={detailDesc}
                onChange={(e) => setDetailDesc(e.target.value)}
                placeholder="新增描述..."
              />
            </div>

            {/* 屬性 */}
            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>
                <Settings size={16} /> 屬性
              </div>
              <div className={styles.propGrid}>
                <div className={styles.propItem}>
                  <label className={styles.propLabel}><Flag size={12} /> 優先順序</label>
                  <select
                    className={styles.propSelect}
                    value={detailPriority}
                    onChange={(e) => setDetailPriority(e.target.value)}
                  >
                    <option value="">無</option>
                    <option value="LOW">🟢 低</option>
                    <option value="MEDIUM">🟡 中</option>
                    <option value="HIGH">🔴 高</option>
                    <option value="URGENT">🚨 緊急</option>
                  </select>
                </div>

                <div className={styles.propItem}>
                  <label className={styles.propLabel}><Calendar size={12} /> 到期日</label>
                  <input
                    type="date"
                    className={styles.propDateInput}
                    value={detailDueDate}
                    onChange={(e) => setDetailDueDate(e.target.value)}
                  />
                </div>

                <div className={styles.propItem}>
                  <label className={styles.propLabel}><User size={12} /> 指派成員</label>
                  <select
                    className={styles.propSelect}
                    value={detailAssignee}
                    onChange={(e) => setDetailAssignee(e.target.value)}
                  >
                    <option value="">未指派</option>
                    {familyMembers.map((m) => (
                      <option key={m.id} value={m.id}>{m.displayName}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.propItem}>
                  <label className={styles.propLabel}><Move size={12} /> 所在欄位</label>
                  <select
                    className={styles.propSelect}
                    value={detailColumnId}
                    onChange={(e) => setDetailColumnId(e.target.value)}
                  >
                    {board.columns.map((col) => (
                      <option key={col.id} value={col.id}>{col.title}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 標籤 */}
            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>
                <Tag size={16} /> 標籤顏色
              </div>
              <div className={styles.labelColors}>
                {LABEL_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`${styles.labelColorBtn} ${detailLabel === color ? styles.labelColorBtnActive : ''}`}
                    style={{ background: color }}
                    onClick={() => setDetailLabel(detailLabel === color ? '' : color)}
                  />
                ))}
                <button className={styles.labelColorClear} onClick={() => setDetailLabel('')}>
                  <X size={12} />
                </button>
              </div>
            </div>

            {/* Checklist */}
            <div className={styles.detailSection}>
              <div className={styles.detailSectionTitle}>
                <ListChecks size={16} /> 子任務
              </div>
              {checklistTotal > 0 && (
                <div className={styles.checklistProgress}>
                  <div className={styles.checklistProgressBar}>
                    <div
                      className={styles.checklistProgressFill}
                      style={{ width: `${(checklistDone / checklistTotal) * 100}%` }}
                    />
                  </div>
                  <span className={styles.checklistProgressText}>
                    {checklistDone}/{checklistTotal}
                  </span>
                </div>
              )}
              {detailCard.checklists.map((item) => (
                <div key={item.id} className={styles.checklistItem}>
                  <button
                    className={`${styles.checklistCheckbox} ${item.checked ? styles.checklistChecked : ''}`}
                    onClick={() => toggleChecklist(item)}
                  >
                    {item.checked ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                  <span className={`${styles.checklistText} ${item.checked ? styles.checklistTextDone : ''}`}>
                    {item.text}
                  </span>
                  <button className={styles.checklistDeleteBtn} onClick={() => deleteChecklist(item.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className={styles.checklistAddRow}>
                <input
                  className={styles.checklistAddInput}
                  placeholder="新增子任務..."
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addChecklist(); }}
                />
                <button className={styles.checklistAddBtn} onClick={addChecklist}>
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* 底部操作 */}
            <div className={styles.detailFooter}>
              <button className={styles.addCardSubmit} onClick={saveCardDetail}>
                儲存變更
              </button>
              <button className={styles.deleteCardBtn} onClick={deleteCard}>
                <Trash2 size={14} /> 刪除卡片
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 看板設定 Modal */}
      {showSettings && (
        <div className={styles.detailModal}>
          <div className={styles.detailBackdrop} onClick={() => setShowSettings(false)} />
          <div className={styles.settingsContent}>
            <button className={styles.detailClose} onClick={() => setShowSettings(false)}>
              <X size={20} />
            </button>
            <div className={styles.settingsTitle}>
              <Settings size={20} /> 看板設定
            </div>

            <div className={styles.settingsFormGroup}>
              <label className={styles.settingsLabel}>圖示</label>
              <div className={styles.emojiPicker}>
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    className={`${styles.emojiBtn} ${settingsEmoji === e ? styles.emojiBtnActive : ''}`}
                    onClick={() => setSettingsEmoji(e)}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.settingsFormGroup}>
              <label className={styles.settingsLabel}>看板名稱</label>
              <input
                className={styles.settingsInput}
                value={settingsTitle}
                onChange={(e) => setSettingsTitle(e.target.value)}
                maxLength={50}
              />
            </div>

            <div className={styles.settingsFormGroup}>
              <label className={styles.settingsLabel}>描述</label>
              <input
                className={styles.settingsInput}
                value={settingsDesc}
                onChange={(e) => setSettingsDesc(e.target.value)}
                placeholder="看板說明..."
              />
            </div>

            <div className={styles.settingsFormGroup}>
              <label className={styles.settingsLabel}>可見度</label>
              <div className={styles.visibilityToggle}>
                <button
                  className={`${styles.visibilityBtn} ${settingsVisibility === 'FAMILY' ? styles.visibilityBtnActive : ''}`}
                  onClick={() => setSettingsVisibility('FAMILY')}
                >
                  <Globe size={16} /> 家庭共用
                </button>
                <button
                  className={`${styles.visibilityBtn} ${settingsVisibility === 'PRIVATE' ? styles.visibilityBtnActive : ''}`}
                  onClick={() => setSettingsVisibility('PRIVATE')}
                >
                  <Lock size={16} /> 個人私用
                </button>
              </div>
            </div>

            <div className={styles.settingsBtnRow}>
              <button className={styles.settingsSaveBtn} onClick={saveSettings}>
                儲存設定
              </button>
              <button className={styles.settingsDangerBtn} onClick={archiveBoard}>
                <Archive size={14} /> {board.archived ? '取消封存' : '封存'}
              </button>
              <button className={styles.settingsDangerBtn} onClick={deleteBoard}>
                <Trash2 size={14} /> 刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
