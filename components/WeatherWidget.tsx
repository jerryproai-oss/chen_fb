'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  fetchWeather, weatherIcon, weatherDescription,
  reverseGeocode,
  type WeatherData, type DailyWeather,
} from '@/lib/weather';
import styles from './WeatherWidget.module.css';

const CACHE_KEY = 'shiri_weather_cache';
const CACHE_TTL = 30 * 60 * 1000; // 30 分鐘

interface CachedWeather {
  data: WeatherData;
  locationName: string;
  lat: number;
  lon: number;
  timestamp: number;
}

/** 天氣小元件 — 當日天氣 + 7 天預報 */
export default function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const loadWeather = useCallback(async (lat: number, lon: number) => {
    try {
      setLoading(true);
      setError('');

      // 檢查快取
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const c: CachedWeather = JSON.parse(cached);
          const age = Date.now() - c.timestamp;
          const dist = Math.abs(c.lat - lat) + Math.abs(c.lon - lon);
          if (age < CACHE_TTL && dist < 0.01) {
            setWeather(c.data);
            setLocationName(c.locationName);
            setLoading(false);
            return;
          }
        }
      } catch { /* ignore cache errors */ }

      const [data, locName] = await Promise.all([
        fetchWeather(lat, lon),
        reverseGeocode(lat, lon),
      ]);
      setWeather(data);
      setLocationName(locName);

      // 寫入快取
      try {
        const cache: CachedWeather = { data, locationName: locName, lat, lon, timestamp: Date.now() };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch { /* ignore */ }
    } catch (err) {
      setError('無法載入天氣資料');
      console.error('Weather error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('瀏覽器不支援定位');
      setLoading(false);
      return;
    }

    // 先嘗試用快取座標
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const c: CachedWeather = JSON.parse(cached);
        if (Date.now() - c.timestamp < CACHE_TTL) {
          setWeather(c.data);
          setLocationName(c.locationName);
          setLoading(false);
          return;
        }
      }
    } catch { /* ignore */ }

    navigator.geolocation.getCurrentPosition(
      (pos) => loadWeather(pos.coords.latitude, pos.coords.longitude),
      () => {
        // 定位失敗，用新北板橋作為預設
        loadWeather(25.0118, 121.4587);
        setLocationName('新北市板橋區');
      },
      { timeout: 8000, maximumAge: 600000 }
    );
  }, [loadWeather]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>🌤️ 載入天氣中...</div>
      </div>
    );
  }

  if (error || !weather) {
    return null; // 不顯示錯誤，靜默處理
  }

  const { current, daily } = weather;
  const todayForecast = daily[0];
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className={styles.container}>
      {/* 當日天氣 — 主區塊 */}
      <div className={styles.currentWeather} onClick={() => setExpanded(!expanded)}>
        <div className={styles.currentMain}>
          <span className={styles.currentIcon}>{weatherIcon(current.weatherCode)}</span>
          <div className={styles.currentTemp}>
            <span className={styles.tempValue}>{Math.round(current.temperature)}°</span>
            <span className={styles.tempDesc}>{weatherDescription(current.weatherCode)}</span>
          </div>
        </div>
        <div className={styles.currentDetails}>
          {locationName && <span className={styles.detailItem}>📍 {locationName}</span>}
          <span className={styles.detailItem}>體感 {Math.round(current.apparentTemp)}°</span>
          <span className={styles.detailItem}>💧 {current.humidity}%</span>
          {todayForecast && (
            <span className={styles.detailItem}>
              ↑{Math.round(todayForecast.tempMax)}° ↓{Math.round(todayForecast.tempMin)}°
            </span>
          )}
        </div>
        <button
          className={styles.expandBtn}
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          aria-label={expanded ? '收合預報' : '展開預報'}
        >
          {expanded ? '▲' : '▼'} 7日預報
        </button>
      </div>

      {/* 7 天預報 — 摺疊區塊 */}
      {expanded && (
        <div className={styles.forecast}>
          {daily.map((day: DailyWeather, i: number) => {
            const d = new Date(day.date);
            const dayLabel = i === 0 ? '今天' : i === 1 ? '明天' : weekdays[d.getDay()];
            return (
              <div key={day.date} className={styles.forecastDay}>
                <span className={styles.forecastLabel}>{dayLabel}</span>
                <span className={styles.forecastIcon}>{weatherIcon(day.weatherCode)}</span>
                <span className={styles.forecastTemps}>
                  <span className={styles.tempHigh}>{Math.round(day.tempMax)}°</span>
                  <span className={styles.tempLow}>{Math.round(day.tempMin)}°</span>
                </span>
                {day.precipitation > 0 && (
                  <span className={styles.forecastRain}>💧{Math.round(day.precipitation)}mm</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
