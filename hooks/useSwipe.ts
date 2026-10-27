import { useRef, useCallback } from 'react';

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  /** 觸發滑動的最小距離（px），預設 50 */
  threshold?: number;
}

/**
 * 觸控滑動手勢 Hook
 * 用於手機/平板的圖片瀏覽切換
 */
export default function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
}: UseSwipeOptions): SwipeHandlers {
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    tracking.current = true;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!tracking.current) return;
    // 防止頁面捲動（在 lightbox 中）
    const dx = Math.abs(e.touches[0].clientX - startX.current);
    const dy = Math.abs(e.touches[0].clientY - startY.current);
    if (dx > dy && dx > 10) {
      e.preventDefault();
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!tracking.current) return;
    tracking.current = false;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - startX.current;
    const dy = touch.clientY - startY.current;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // 水平滑動優先
    if (absDx > absDy && absDx > threshold) {
      if (dx < 0) {
        onSwipeLeft?.();
      } else {
        onSwipeRight?.();
      }
    } else if (absDy > absDx && absDy > threshold) {
      if (dy < 0) {
        onSwipeUp?.();
      } else {
        onSwipeDown?.();
      }
    }
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
