// lib/weather.ts — Open-Meteo 天氣 API 工具
// 免費、無需 API Key
// https://open-meteo.com/

/** 每日天氣資料 */
export interface DailyWeather {
  date: string;            // YYYY-MM-DD
  weatherCode: number;     // WMO weather code
  tempMax: number;         // °C
  tempMin: number;         // °C
  precipitation: number;   // mm
  windSpeed: number;       // km/h
  uvIndex: number;
}

/** 目前天氣 */
export interface CurrentWeather {
  temperature: number;
  weatherCode: number;
  windSpeed: number;
  humidity: number;
  apparentTemp: number;    // 體感溫度
}

/** API 回傳的完整天氣資料 */
export interface WeatherData {
  current: CurrentWeather;
  daily: DailyWeather[];
  locationName?: string;
}

/** 取得 7 天天氣預報 + 目前天氣 */
export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat.toString());
  url.searchParams.set('longitude', lon.toString());
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,uv_index_max');
  url.searchParams.set('timezone', 'Asia/Taipei');
  url.searchParams.set('forecast_days', '7');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`天氣 API 錯誤: ${res.status}`);
  const data = await res.json();

  const current: CurrentWeather = {
    temperature: data.current.temperature_2m,
    weatherCode: data.current.weather_code,
    windSpeed: data.current.wind_speed_10m,
    humidity: data.current.relative_humidity_2m,
    apparentTemp: data.current.apparent_temperature,
  };

  const daily: DailyWeather[] = data.daily.time.map((date: string, i: number) => ({
    date,
    weatherCode: data.daily.weather_code[i],
    tempMax: data.daily.temperature_2m_max[i],
    tempMin: data.daily.temperature_2m_min[i],
    precipitation: data.daily.precipitation_sum[i],
    windSpeed: data.daily.wind_speed_10m_max[i],
    uvIndex: data.daily.uv_index_max[i],
  }));

  return { current, daily };
}

/** WMO 天氣碼 → 天氣描述（繁體中文） */
export function weatherDescription(code: number): string {
  const map: Record<number, string> = {
    0: '晴天',
    1: '大致晴朗',
    2: '局部多雲',
    3: '陰天',
    45: '起霧',
    48: '霧凇',
    51: '小毛毛雨',
    53: '毛毛雨',
    55: '密集毛毛雨',
    56: '凍毛毛雨',
    57: '密集凍毛毛雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    66: '小凍雨',
    67: '大凍雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    77: '雪粒',
    80: '小陣雨',
    81: '中陣雨',
    82: '大陣雨',
    85: '小雪陣',
    86: '大雪陣',
    95: '雷雨',
    96: '雷雨伴小冰雹',
    99: '雷雨伴大冰雹',
  };
  return map[code] || '未知';
}

/** WMO 天氣碼 → emoji 圖標 */
export function weatherIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤️';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 57) return '🌧️';
  if (code <= 65) return '🌧️';
  if (code <= 67) return '🌨️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 86) return '🌨️';
  if (code >= 95) return '⛈️';
  return '🌡️';
}

/** 將 GPS 座標反查為地名（使用 Open-Meteo Geocoding） */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=zh-TW&zoom=10`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Shiri-Family-App/1.0' },
    });
    if (!res.ok) return '';
    const data = await res.json();
    // 取區/鄉鎮 + 市/縣
    const addr = data.address || {};
    const district = addr.city_district || addr.suburb || addr.town || addr.village || '';
    const city = addr.city || addr.county || '';
    return district ? `${city}${district}` : city;
  } catch {
    return '';
  }
}
