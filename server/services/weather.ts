import type { WeatherSnapshot } from "../../src/shared/types";

interface OpenMeteoPayload {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    precipitation_probability_max?: number[];
    weather_code?: number[];
  };
}

export async function fetchWeather(latitude: number, longitude: number): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    daily: "weather_code,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "4"
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Open-Meteo 请求失败: ${response.status}`);
  }
  return mapOpenMeteoForecast((await response.json()) as OpenMeteoPayload);
}

export function mapOpenMeteoForecast(payload: OpenMeteoPayload): WeatherSnapshot {
  const current = payload.current || {};
  const daily = payload.daily || {};
  const code = roundNumber(current.weather_code ?? daily.weather_code?.[0] ?? 0);
  return {
    date: daily.time?.[0] || String(current.time || new Date().toISOString()).slice(0, 10),
    temperature: roundNumber(current.temperature_2m),
    apparentTemperature: roundNumber(current.apparent_temperature ?? current.temperature_2m),
    precipitationProbability: roundNumber(daily.precipitation_probability_max?.[0] ?? current.precipitation ?? 0),
    windSpeed: roundNumber(current.wind_speed_10m),
    weatherCode: code,
    summary: weatherCodeToSummary(code)
  };
}

export function weatherCodeToSummary(code: number): string {
  if (code === 0) return "晴";
  if ([1, 2, 3].includes(code)) return "多云";
  if ([45, 48].includes(code)) return "雾";
  if ([51, 53, 55, 56, 57, 61].includes(code)) return "小雨";
  if ([63, 65, 66, 67, 80, 81, 82].includes(code)) return "雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "雪";
  if ([95, 96, 99].includes(code)) return "雷雨";
  return "天气";
}

function roundNumber(value: number | undefined): number {
  return Math.round(Number.isFinite(value) ? Number(value) : 0);
}
