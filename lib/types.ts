// ── Frontend 共用型別 ────────────────────────────────────────

export type Role = 'ADMIN' | 'MEMBER';
export type UserStatus = 'ACTIVE' | 'DISABLED';
export type Visibility = 'PRIVATE' | 'FAMILY' | 'SELECTED';
export type PostStatus = 'DRAFT' | 'PUBLISHED';
export type ReactionType =
  | 'LIKE'
  | 'LOVE'
  | 'CARE'
  | 'LAUGH'
  | 'WOW'
  | 'SAD'
  | 'ANGRY'
  | 'RECEIVED'
  | 'NO_PROBLEM';

// ── 媒體 ──────────────────────────────────────────────────────

export interface MediaItem {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  sortOrder: number;
}

// ── 使用者 ────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  birthday?: string | null;
  role: Role;
  status: UserStatus;
}

// ── 貼文 ──────────────────────────────────────────────────────

export interface PostSummary {
  id: string;
  authorId: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  recordDate: string;   // ISO date string
  title: string;
  subtitle: string | null;
  bodyPlainText: string | null;
  visibility: Visibility;
  status: PostStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  commentCount: number;
  reactionCount: number;
  audienceUserIds?: string[];
  reactionSummary?: ReactionSummary[];
  myReaction?: ReactionType | null;
  media?: MediaItem[];
  hasPoll?: boolean;
  pinnedAt?: string | null;
  locationName?: string | null;
  bgColor?: string | null;
  isMilestone?: boolean;
  milestoneType?: string | null;
  isBookmarked?: boolean;
  tags?: string[];
}

export type SearchScope = 'all' | 'journal' | 'family';

export const MILESTONE_TYPES = [
  '畢業',
  '結婚',
  '寶寶誕生',
  '搬新家',
  '新工作',
  '旅行',
  '紀念日',
  '其他',
] as const;

export type MilestoneType = (typeof MILESTONE_TYPES)[number];

export const PRESET_BG_COLORS = [
  { label: '無背景色', value: null },
  { label: '玉米絲', value: '#FFF8DC' },
  { label: '卡其黃', value: '#F0E68C' },
  { label: '霧玫瑰', value: '#FFE4E1' },
  { label: '薰衣草', value: '#E6E6FA' },
  { label: '蜜瓜綠', value: '#F0FFF0' },
  { label: '貝殼白', value: '#FFF5EE' },
  { label: '米麥色', value: '#F5F5DC' },
  { label: '薄荷綠', value: '#E0F0E0' },
] as const;

export interface PostDetail extends PostSummary {
  bodyJson: string | null;
  version?: number;
  audiences?: { userId: string; user: { id: string; displayName: string } }[];
}

// ── 心情回應 ──────────────────────────────────────────────────

export interface ReactionSummary {
  type: ReactionType;
  count: number;
}

// ── 留言 ──────────────────────────────────────────────────────

export interface CommentItem {
  id: string;
  postId: string;
  authorId: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  bodyText: string;
  createdAt: string;
}

// ── Emoji 映射 ───────────────────────────────────────────────

export const REACTION_EMOJI: Record<ReactionType, string> = {
  LIKE: '👍',
  LOVE: '❤️',
  CARE: '🤗',
  LAUGH: '😂',
  WOW: '😮',
  SAD: '😢',
  ANGRY: '😡',
  RECEIVED: '✅',
  NO_PROBLEM: '👌',
};

export const REACTION_LABEL: Record<ReactionType, string> = {
  LIKE: '讚',
  LOVE: '愛心',
  CARE: '抱抱',
  LAUGH: '大笑',
  WOW: '驚訝',
  SAD: '難過',
  ANGRY: '生氣',
  RECEIVED: '收到',
  NO_PROBLEM: '沒問題',
};

export const ALL_REACTION_TYPES: ReactionType[] = [
  'LIKE', 'LOVE', 'CARE', 'LAUGH', 'WOW', 'SAD', 'ANGRY', 'RECEIVED', 'NO_PROBLEM',
];

// ── Visibility 映射 ──────────────────────────────────────────

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  PRIVATE: '僅自己',
  FAMILY: '家人可見',
  SELECTED: '指定家人',
};

// ── Feed 回應 ────────────────────────────────────────────────

export interface FeedResponse {
  posts: PostSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── 歷年今日 ─────────────────────────────────────────────────

export interface OnThisDayPost {
  id: string;
  title: string;
  recordDate: string;
  author: {
    displayName: string;
  };
}

// ── 投票 ──────────────────────────────────────────────────────

export interface PollOptionItem {
  id: string;
  text: string;
  description: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  sortOrder: number;
  voteCount: number;
  percentage: number;
  voters: string[];  // 投票人 displayName
}

export interface PollData {
  id: string;
  question: string;
  multiSelect: boolean;
  endsAt: string | null;
  isExpired: boolean;
  totalVotes: number;
  options: PollOptionItem[];
  myVotes: string[];  // 我投的 optionId
}

export interface PollOptionInput {
  text: string;
  description?: string;
  imageMediaId?: string;
  linkUrl?: string;
}

export interface PollInput {
  question: string;
  multiSelect: boolean;
  endsAt?: string | null;
  options: PollOptionInput[];
}


// ── 媒體池 ────────────────────────────────────────────────────

export interface MediaPoolItem {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  postId: string;
  postTitle: string;
  recordDate: string;
  authorName: string;
}

export interface MediaPoolResponse {
  items: MediaPoolItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ── 行事曆 ────────────────────────────────────────────────────

export interface FamilyEventItem {
  id: string;
  authorId: string;
  author: { displayName: string; avatarUrl: string | null };
  title: string;
  description: string | null;
  eventDate: string;        // "YYYY-MM-DD" 開始日期
  endDate: string | null;   // "YYYY-MM-DD" 結束日期
  eventTime: string | null; // "HH:mm" 開始時間
  endTime: string | null;   // "HH:mm" 結束時間
  isAllDay: boolean;
  color: string | null;
  location: string | null;
  isRecurring: boolean;
  recurringType: string | null;
  recurringEndDate: string | null;
}

// ── 生日 ──────────────────────────────────────────────────────

export interface BirthdayItem {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  birthday: string;
  daysUntil: number;
}

// ── 限時動態 ──────────────────────────────────────────────────

export interface StoryItem {
  id: string;
  text: string | null;
  mediaUrl: string | null;
  bgColor: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface StoryGroup {
  author: { id: string; displayName: string; avatarUrl: string | null };
  items: StoryItem[];
}

// ── 標籤 ──────────────────────────────────────────────────────

export interface TagItem {
  id: string;
  name: string;
  slug: string;
  postCount: number;
}

// ── 通知 ──────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  isRead: boolean;
  actorId: string | null;
  resourceId: string | null;
  createdAt: string;
  actor?: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  } | null;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
}
