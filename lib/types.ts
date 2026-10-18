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
}

export interface PostDetail extends PostSummary {
  bodyJson: string | null;
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

