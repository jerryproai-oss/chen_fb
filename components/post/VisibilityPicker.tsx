'use client';

import { useEffect, useState } from 'react';
import { Lock, Users, UserCheck, Check } from 'lucide-react';
import type { Visibility, UserProfile } from '@/lib/types';
import { VISIBILITY_LABEL } from '@/lib/types';
import Avatar from '@/components/ui/Avatar';
import styles from './VisibilityPicker.module.css';

interface VisibilityPickerProps {
  value: Visibility;
  onChange: (v: Visibility) => void;
  selectedUserIds: string[];
  onSelectedUsersChange: (ids: string[]) => void;
}

const VISIBILITY_OPTIONS: { value: Visibility; icon: typeof Lock }[] = [
  { value: 'PRIVATE', icon: Lock },
  { value: 'FAMILY', icon: Users },
  { value: 'SELECTED', icon: UserCheck },
];

/**
 * 隱私選擇器
 * - PRIVATE / FAMILY / SELECTED
 * - SELECTED 時顯示家人列表供勾選
 */
export default function VisibilityPicker({
  value,
  onChange,
  selectedUserIds,
  onSelectedUsersChange,
}: VisibilityPickerProps) {
  const [familyMembers, setFamilyMembers] = useState<UserProfile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // 當選擇 SELECTED 時，載入家人列表
  useEffect(() => {
    if (value === 'SELECTED' && familyMembers.length === 0) {
      setLoadingMembers(true);
      fetch('/api/family/members')
        .then((res) => res.json())
        .then((data) => {
          setFamilyMembers(data.members ?? []);
        })
        .catch(() => {})
        .finally(() => setLoadingMembers(false));
    }
  }, [value, familyMembers.length]);

  const toggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      onSelectedUsersChange(selectedUserIds.filter((id) => id !== userId));
    } else {
      onSelectedUsersChange([...selectedUserIds, userId]);
    }
  };

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>可見範圍</span>
      <div className={styles.options}>
        {VISIBILITY_OPTIONS.map(({ value: v, icon: Icon }) => (
          <button
            key={v}
            type="button"
            className={`${styles.option} ${value === v ? styles.optionActive : ''}`}
            onClick={() => onChange(v)}
          >
            <Icon size={16} />
            {VISIBILITY_LABEL[v]}
          </button>
        ))}
      </div>

      {value === 'SELECTED' && (
        <div className={styles.memberList}>
          {loadingMembers ? (
            <p className={styles.memberHint}>載入家人列表…</p>
          ) : familyMembers.length === 0 ? (
            <p className={styles.memberHint}>目前沒有其他家庭成員</p>
          ) : (
            <>
              <p className={styles.memberHint}>選擇可以看到這篇手札的家人</p>
              {familyMembers.map((member) => {
                const isChecked = selectedUserIds.includes(member.id);
                return (
                  <div
                    key={member.id}
                    className={styles.memberItem}
                    onClick={() => toggleUser(member.id)}
                    role="checkbox"
                    aria-checked={isChecked}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleUser(member.id);
                      }
                    }}
                  >
                    <div
                      className={`${styles.checkbox} ${isChecked ? styles.checkboxChecked : ''}`}
                    >
                      {isChecked && <Check size={14} />}
                    </div>
                    <Avatar
                      name={member.displayName}
                      avatarUrl={member.avatarUrl}
                      size="sm"
                    />
                    <span className={styles.memberName}>
                      {member.displayName}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
