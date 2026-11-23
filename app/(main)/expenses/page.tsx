'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Settings,
  Pencil,
  Trash2,
  X,
  Plus,
  Wallet,
} from 'lucide-react';
import HelpGuide from '@/components/ui/HelpGuide';
import { expensesHelp } from '@/lib/constants/help-content';
import styles from './page.module.css';

// ── 型別定義 ──────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  emoji: string;
  type: 'INCOME' | 'EXPENSE';
  sortOrder: number;
}

interface ExpenseRecord {
  id: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  date: string;
  note: string | null;
  visibility: string;
  categoryId: string | null;
  category: { id: string; name: string; emoji: string } | null;
  createdAt: string;
}

interface Stats {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  categoryBreakdown: {
    categoryId: string | null;
    name: string;
    emoji: string;
    amount: number;
    count: number;
  }[];
}

interface Budget {
  id: string;
  month: string;
  amount: number;
}

// ── 常用 Emoji 列表 ──────────────────────────────────────

const EMOJI_OPTIONS = [
  '🍽️', '🚗', '🛒', '🏠', '📱', '🎮', '👕', '💊',
  '📚', '🎁', '🐾', '📦', '💼', '💰', '📈', '🧧',
  '💵', '🎬', '☕', '🍺', '🏥', '✈️', '🎵', '💇',
  '🏋️', '🎂', '🌟', '🔧', '🖥️', '📰', '🚌', '🏪',
];

// ── 工具函數 ──────────────────────────────────────────────

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getMonthLabel(year: number, month: number): string {
  return `${year}年${month}月`;
}

function getDateLabel(dateStr: string): string {
  const today = new Date();
  const date = new Date(dateStr + 'T00:00:00');
  const todayStr = today.toISOString().split('T')[0];

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (dateStr === todayStr) return '今天';
  if (dateStr === yesterdayStr) return '昨天';

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = weekdays[date.getDay()];
  return `${m}/${d} 週${w}`;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString();
}

// ── 主頁面 ────────────────────────────────────────────────

export default function ExpensesPage() {
  // 當前月份
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // 資料
  const [records, setRecords] = useState<ExpenseRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);

  // Quick Add 表單
  const [addType, setAddType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [addAmount, setAddAmount] = useState('');
  const [addCategoryId, setAddCategoryId] = useState<string | null>(null);
  const [addDate, setAddDate] = useState(now.toISOString().split('T')[0]);
  const [addNote, setAddNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Modal states
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryTab, setCategoryTab] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [editingRecord, setEditingRecord] = useState<ExpenseRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<ExpenseRecord | null>(null);

  // 新增分類表單
  const [newCatName, setNewCatName] = useState('');
  const [newCatEmoji, setNewCatEmoji] = useState('📦');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // 編輯分類
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatEmoji, setEditCatEmoji] = useState('');
  const [showEditEmojiPicker, setShowEditEmojiPicker] = useState(false);

  // 編輯紀錄表單
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);

  const monthStr = formatMonth(year, month);

  // ── 資料載入 ──────────────────────────────────────────

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch(`/api/expenses?month=${monthStr}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records);
      }
    } catch (err) {
      console.error('Failed to fetch records:', err);
    }
  }, [monthStr]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/expenses/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories);
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/expenses/stats?month=${monthStr}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, [monthStr]);

  const fetchBudget = useCallback(async () => {
    try {
      const res = await fetch(`/api/expenses/budget?month=${monthStr}`);
      if (res.ok) {
        const data = await res.json();
        setBudget(data.budget);
      }
    } catch (err) {
      console.error('Failed to fetch budget:', err);
    }
  }, [monthStr]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchRecords(), fetchCategories(), fetchStats(), fetchBudget()]);
    setLoading(false);
  }, [fetchRecords, fetchCategories, fetchStats, fetchBudget]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── 月份切換 ──────────────────────────────────────────

  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  // ── 新增紀錄 ──────────────────────────────────────────

  const handleSubmit = async () => {
    const amount = parseInt(addAmount, 10);
    if (!amount || amount <= 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          type: addType,
          categoryId: addCategoryId,
          date: addDate,
          note: addNote,
        }),
      });

      if (res.ok) {
        setAddAmount('');
        setAddNote('');
        setAddCategoryId(null);
        await Promise.all([fetchRecords(), fetchStats()]);
      }
    } catch (err) {
      console.error('Failed to create record:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── 刪除紀錄 ──────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeletingRecord(null);
        await Promise.all([fetchRecords(), fetchStats()]);
      }
    } catch (err) {
      console.error('Failed to delete record:', err);
    }
  };

  // ── 編輯紀錄 ──────────────────────────────────────────

  const openEditRecord = (record: ExpenseRecord) => {
    setEditingRecord(record);
    setEditAmount(String(record.amount));
    setEditDate(record.date.split('T')[0]);
    setEditNote(record.note || '');
    setEditCategoryId(record.categoryId);
  };

  const handleEditSave = async () => {
    if (!editingRecord) return;
    const amount = parseInt(editAmount, 10);
    if (!amount || amount <= 0) return;

    try {
      const res = await fetch(`/api/expenses/${editingRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          date: editDate,
          note: editNote,
          categoryId: editCategoryId,
        }),
      });

      if (res.ok) {
        setEditingRecord(null);
        await Promise.all([fetchRecords(), fetchStats()]);
      }
    } catch (err) {
      console.error('Failed to update record:', err);
    }
  };

  // ── 預算管理 ──────────────────────────────────────────

  const openBudgetModal = () => {
    setBudgetInput(budget ? String(budget.amount) : '');
    setShowBudgetModal(true);
  };

  const handleBudgetSave = async () => {
    const amount = parseInt(budgetInput, 10);
    if (!amount || amount <= 0) return;

    try {
      const res = await fetch('/api/expenses/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: monthStr, amount }),
      });

      if (res.ok) {
        setShowBudgetModal(false);
        await fetchBudget();
      }
    } catch (err) {
      console.error('Failed to save budget:', err);
    }
  };

  // ── 分類管理 ──────────────────────────────────────────

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;

    try {
      const res = await fetch('/api/expenses/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCatName.trim(),
          emoji: newCatEmoji,
          type: categoryTab,
        }),
      });

      if (res.ok) {
        setNewCatName('');
        setNewCatEmoji('📦');
        setShowEmojiPicker(false);
        await fetchCategories();
      }
    } catch (err) {
      console.error('Failed to add category:', err);
    }
  };

  const handleEditCategory = async () => {
    if (!editingCategory || !editCatName.trim()) return;

    try {
      const res = await fetch(`/api/expenses/categories/${editingCategory.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editCatName.trim(),
          emoji: editCatEmoji,
        }),
      });

      if (res.ok) {
        setEditingCategory(null);
        setShowEditEmojiPicker(false);
        await fetchCategories();
      }
    } catch (err) {
      console.error('Failed to update category:', err);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('刪除分類後，相關紀錄的分類將變為「未分類」，確定要刪除嗎？')) return;

    try {
      const res = await fetch(`/api/expenses/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await Promise.all([fetchCategories(), fetchRecords()]);
      }
    } catch (err) {
      console.error('Failed to delete category:', err);
    }
  };

  // ── 分組紀錄 ──────────────────────────────────────────

  const groupedRecords = records.reduce<Record<string, ExpenseRecord[]>>((acc, record) => {
    const dateStr = record.date.split('T')[0];
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(record);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedRecords).sort((a, b) => b.localeCompare(a));

  // 過濾分類
  const filteredCategories = categories.filter((c) => c.type === addType);
  const modalCategories = categories.filter((c) => c.type === categoryTab);
  const editRecordCategories = editingRecord
    ? categories.filter((c) => c.type === editingRecord.type)
    : [];

  // 預算百分比
  const budgetPercent = budget && stats
    ? Math.round((stats.totalExpense / budget.amount) * 100)
    : 0;
  const isOverBudget = budgetPercent > 100;

  // ── 渲染 ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>載入中...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/profile" className={styles.backLink}>
            <ArrowLeft size={18} />
          </Link>
          <h1 className={styles.title}>💰 記帳本 <HelpGuide content={expensesHelp} /></h1>
        </div>
      </div>

      {/* Month Picker */}
      <div className={styles.monthPicker}>
        <button className={styles.monthBtn} onClick={prevMonth}>
          <ChevronLeft size={18} />
        </button>
        <span className={styles.monthLabel}>{getMonthLabel(year, month)}</span>
        <button className={styles.monthBtn} onClick={nextMonth}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryRow}>
        <div className={`${styles.summaryCard} ${styles.cardIncome}`}>
          <div className={styles.summaryLabel}>收入</div>
          <div className={`${styles.summaryAmount} ${styles.incomeColor}`}>
            {formatAmount(stats?.totalIncome ?? 0)}
          </div>
        </div>
        <div className={`${styles.summaryCard} ${styles.cardExpense}`}>
          <div className={styles.summaryLabel}>支出</div>
          <div className={`${styles.summaryAmount} ${styles.expenseColor}`}>
            {formatAmount(stats?.totalExpense ?? 0)}
          </div>
        </div>
        <div className={`${styles.summaryCard} ${(stats?.balance ?? 0) >= 0 ? styles.cardBalance : styles.cardBalanceNegative}`}>
          <div className={styles.summaryLabel}>結餘</div>
          <div className={`${styles.summaryAmount} ${(stats?.balance ?? 0) >= 0 ? styles.balanceColor : styles.balanceNegativeColor}`}>
            {(stats?.balance ?? 0) >= 0 ? '' : '-'}{formatAmount(Math.abs(stats?.balance ?? 0))}
          </div>
        </div>
      </div>

      {/* Budget Bar */}
      <div className={styles.budgetSection}>
        <div className={styles.budgetBar}>
          <div className={styles.budgetHeader}>
            <span className={styles.budgetLabel}>
              <Wallet size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
              每月預算
            </span>
            <div>
              {budget ? (
                <span className={styles.budgetAmount}>
                  NT${formatAmount(stats?.totalExpense ?? 0)} / NT${formatAmount(budget.amount)}
                </span>
              ) : (
                <span className={styles.budgetAmount}>未設定</span>
              )}
              <button className={styles.budgetEditBtn} onClick={openBudgetModal} title="設定預算">
                <Pencil size={14} />
              </button>
            </div>
          </div>
          {budget && (
            <>
              <div className={styles.budgetTrack}>
                <div
                  className={`${styles.budgetFill} ${isOverBudget ? styles.budgetOver : ''}`}
                  style={{ width: `${Math.min(budgetPercent, 100)}%` }}
                />
              </div>
              <div className={`${styles.budgetPercent} ${isOverBudget ? styles.budgetPercentOver : ''}`}>
                {budgetPercent}%
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quick Add */}
      <div className={styles.quickAdd}>
        <div className={styles.typeToggle}>
          <button
            className={`${styles.typeBtn} ${addType === 'EXPENSE' ? `${styles.typeBtnActive} ${styles.typeBtnExpense}` : ''}`}
            onClick={() => { setAddType('EXPENSE'); setAddCategoryId(null); }}
          >
            支出
          </button>
          <button
            className={`${styles.typeBtn} ${addType === 'INCOME' ? `${styles.typeBtnActive} ${styles.typeBtnIncome}` : ''}`}
            onClick={() => { setAddType('INCOME'); setAddCategoryId(null); }}
          >
            收入
          </button>
        </div>

        <div className={styles.amountRow}>
          <span className={styles.currencySymbol}>$</span>
          <input
            className={styles.amountInput}
            type="number"
            inputMode="numeric"
            placeholder="金額"
            value={addAmount}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, '');
              setAddAmount(val);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
          />
        </div>

        {/* Category Grid */}
        <div className={styles.categoryGrid}>
          {filteredCategories.map((cat) => (
            <button
              key={cat.id}
              className={`${styles.categoryBtn} ${addCategoryId === cat.id ? styles.categoryBtnActive : ''}`}
              onClick={() => setAddCategoryId(addCategoryId === cat.id ? null : cat.id)}
            >
              <span className={styles.categoryEmoji}>{cat.emoji}</span>
              <span className={styles.categoryName}>{cat.name}</span>
            </button>
          ))}
        </div>

        <div className={styles.metaRow}>
          <input
            className={styles.dateInput}
            type="date"
            value={addDate}
            onChange={(e) => setAddDate(e.target.value)}
          />
          <input
            className={styles.noteInput}
            type="text"
            placeholder="備註（選填）"
            value={addNote}
            onChange={(e) => setAddNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
          />
        </div>

        <button
          className={`${styles.submitBtn} ${addType === 'INCOME' ? styles.submitBtnIncome : ''}`}
          onClick={handleSubmit}
          disabled={submitting || !addAmount || parseInt(addAmount, 10) <= 0}
        >
          {submitting ? '儲存中...' : `記一筆${addType === 'INCOME' ? '收入' : '支出'}`}
        </button>
      </div>

      {/* Records Section */}
      <div className={styles.recordsSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>交易紀錄</h2>
          <button className={styles.manageCatBtn} onClick={() => setShowCategoryModal(true)}>
            <Settings size={14} />
            管理分類
          </button>
        </div>

        {sortedDates.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📝</div>
            <div className={styles.emptyText}>這個月還沒有任何紀錄</div>
          </div>
        ) : (
          sortedDates.map((dateStr) => (
            <div key={dateStr} className={styles.dateGroup}>
              <div className={styles.dateHeader}>{getDateLabel(dateStr)}</div>
              {groupedRecords[dateStr].map((record) => (
                <div key={record.id} className={styles.recordItem}>
                  <div className={styles.recordEmoji}>
                    {record.category?.emoji || '📦'}
                  </div>
                  <div className={styles.recordInfo}>
                    <div className={styles.recordCategory}>
                      {record.category?.name || '未分類'}
                    </div>
                    {record.note && (
                      <div className={styles.recordNote}>{record.note}</div>
                    )}
                  </div>
                  <div className={`${styles.recordAmount} ${record.type === 'INCOME' ? styles.recordIncome : styles.recordExpense}`}>
                    {record.type === 'INCOME' ? '+' : '-'}{formatAmount(record.amount)}
                  </div>
                  <div className={styles.recordActions}>
                    <button
                      className={styles.recordActionBtn}
                      onClick={() => openEditRecord(record)}
                      title="編輯"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className={`${styles.recordActionBtn} ${styles.recordActionBtnDelete}`}
                      onClick={() => setDeletingRecord(record)}
                      title="刪除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* ── 分類管理 Modal ────────────────────────────── */}
      {showCategoryModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCategoryModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>管理分類</h3>
              <button className={styles.modalCloseBtn} onClick={() => setShowCategoryModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.modalTabs}>
              <button
                className={`${styles.modalTab} ${categoryTab === 'EXPENSE' ? styles.modalTabActive : ''}`}
                onClick={() => setCategoryTab('EXPENSE')}
              >
                支出分類
              </button>
              <button
                className={`${styles.modalTab} ${categoryTab === 'INCOME' ? styles.modalTabActive : ''}`}
                onClick={() => setCategoryTab('INCOME')}
              >
                收入分類
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.catList}>
                {modalCategories.map((cat) => (
                  <div key={cat.id} className={styles.catItem}>
                    {editingCategory?.id === cat.id ? (
                      <>
                        <button
                          className={styles.emojiPickerBtn}
                          onClick={() => setShowEditEmojiPicker(!showEditEmojiPicker)}
                        >
                          {editCatEmoji}
                        </button>
                        <input
                          className={styles.addCatInput}
                          value={editCatName}
                          onChange={(e) => setEditCatName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleEditCategory(); }}
                          autoFocus
                        />
                        <button className={styles.addCatBtn} onClick={handleEditCategory}>
                          ✓
                        </button>
                        <button
                          className={styles.catItemBtn}
                          onClick={() => { setEditingCategory(null); setShowEditEmojiPicker(false); }}
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className={styles.catItemEmoji}>{cat.emoji}</span>
                        <span className={styles.catItemName}>{cat.name}</span>
                        <div className={styles.catItemActions}>
                          <button
                            className={styles.catItemBtn}
                            onClick={() => {
                              setEditingCategory(cat);
                              setEditCatName(cat.name);
                              setEditCatEmoji(cat.emoji);
                              setShowEditEmojiPicker(false);
                            }}
                            title="編輯"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className={`${styles.catItemBtn} ${styles.catItemBtnDelete}`}
                            onClick={() => handleDeleteCategory(cat.id)}
                            title="刪除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Edit emoji picker */}
              {showEditEmojiPicker && editingCategory && (
                <div className={styles.emojiGrid}>
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      className={styles.emojiOption}
                      onClick={() => { setEditCatEmoji(e); setShowEditEmojiPicker(false); }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}

              {/* Add new category */}
              {showEmojiPicker && !editingCategory && (
                <div className={styles.emojiGrid}>
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      className={styles.emojiOption}
                      onClick={() => { setNewCatEmoji(e); setShowEmojiPicker(false); }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.addCatForm}>
                <button
                  className={styles.emojiPickerBtn}
                  onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowEditEmojiPicker(false); }}
                >
                  {newCatEmoji}
                </button>
                <input
                  className={styles.addCatInput}
                  placeholder="新增分類名稱"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
                />
                <button
                  className={styles.addCatBtn}
                  onClick={handleAddCategory}
                  disabled={!newCatName.trim()}
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 編輯紀錄 Modal ────────────────────────────── */}
      {editingRecord && (
        <div className={styles.modalOverlay} onClick={() => setEditingRecord(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>編輯紀錄</h3>
              <button className={styles.modalCloseBtn} onClick={() => setEditingRecord(null)}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.editForm}>
                <div className={styles.editField}>
                  <label className={styles.editLabel}>金額</label>
                  <input
                    className={styles.editInput}
                    type="number"
                    inputMode="numeric"
                    value={editAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      setEditAmount(val);
                    }}
                  />
                </div>
                <div className={styles.editField}>
                  <label className={styles.editLabel}>分類</label>
                  <div className={styles.categoryGrid}>
                    {editRecordCategories.map((cat) => (
                      <button
                        key={cat.id}
                        className={`${styles.categoryBtn} ${editCategoryId === cat.id ? styles.categoryBtnActive : ''}`}
                        onClick={() => setEditCategoryId(editCategoryId === cat.id ? null : cat.id)}
                      >
                        <span className={styles.categoryEmoji}>{cat.emoji}</span>
                        <span className={styles.categoryName}>{cat.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.editField}>
                  <label className={styles.editLabel}>日期</label>
                  <input
                    className={styles.editInput}
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </div>
                <div className={styles.editField}>
                  <label className={styles.editLabel}>備註</label>
                  <input
                    className={styles.editInput}
                    type="text"
                    placeholder="選填"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                  />
                </div>
                <div className={styles.editActions}>
                  <button className={styles.editCancelBtn} onClick={() => setEditingRecord(null)}>
                    取消
                  </button>
                  <button className={styles.editSaveBtn} onClick={handleEditSave}>
                    儲存
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 刪除確認 Modal ────────────────────────────── */}
      {deletingRecord && (
        <div className={styles.modalOverlay} onClick={() => setDeletingRecord(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>確認刪除</h3>
              <button className={styles.modalCloseBtn} onClick={() => setDeletingRecord(null)}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.confirmText}>
                確定要刪除「{deletingRecord.category?.name || '未分類'} {deletingRecord.type === 'INCOME' ? '+' : '-'}NT${formatAmount(deletingRecord.amount)}」嗎？此操作無法復原。
              </p>
              <div className={styles.confirmActions}>
                <button className={styles.confirmCancelBtn} onClick={() => setDeletingRecord(null)}>
                  取消
                </button>
                <button className={styles.confirmDeleteBtn} onClick={() => handleDelete(deletingRecord.id)}>
                  刪除
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 預算設定 Modal ────────────────────────────── */}
      {showBudgetModal && (
        <div className={styles.modalOverlay} onClick={() => setShowBudgetModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>設定 {getMonthLabel(year, month)} 預算</h3>
              <button className={styles.modalCloseBtn} onClick={() => setShowBudgetModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.budgetForm}>
                <input
                  className={styles.budgetInput}
                  type="number"
                  inputMode="numeric"
                  placeholder="每月預算金額 (NT$)"
                  value={budgetInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setBudgetInput(val);
                  }}
                  autoFocus
                />
                <button
                  className={styles.budgetSaveBtn}
                  onClick={handleBudgetSave}
                  disabled={!budgetInput || parseInt(budgetInput, 10) <= 0}
                >
                  儲存預算
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
