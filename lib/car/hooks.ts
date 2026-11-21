'use client';

import { useState, useEffect, useCallback } from 'react';
import type { VehicleInfo } from './types';

/**
 * 取得當天日期字串 (YYYY-MM-DD)，避免時區偏移
 */
export function getLocalDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Alias for backward compatibility */
export const getLocalDate = getLocalDateString;

/**
 * 共用 hook：取得當前使用中的車輛
 * - 從 /api/car/vehicles 取得車輛清單
 * - 優先回傳 isActive 的車輛，否則第一台，否則 null
 */
export function useVehicle() {
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchVehicle = useCallback(async () => {
    try {
      const res = await fetch('/api/car/vehicles');
      if (!res.ok) {
        setError('無法取得車輛資料');
        return null;
      }
      const data = await res.json();
      const vehicles: VehicleInfo[] = data.vehicles || [];
      const active = vehicles.find((v) => v.isActive) || vehicles[0] || null;
      setVehicle(active);
      return active;
    } catch {
      setError('網路錯誤，無法取得車輛資料');
      return null;
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchVehicle().finally(() => setLoading(false));
  }, [fetchVehicle]);

  return { vehicle, loading, error, refetch: fetchVehicle };
}
