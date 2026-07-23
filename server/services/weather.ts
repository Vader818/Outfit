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
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    apparent_temperature_max?: number[];
    apparent_temperature_min?: number[];
    precipitation_probability_max?: number[];
    weather_code?: number[];
    wind_speed_10m_max?: number[];
  };
}

interface FetchWeatherOptions {
  timeoutMs?: number;
}

const DEFAULT_WEATHER_TIMEOUT_MS = 4000;
const DEFAULT_FORECAST_DAYS = 7;
const MIN_FORECAST_DAYS = 1;
const MAX_FORECAST_DAYS = 7;
const DAILY_FORECAST_FIELDS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "apparent_temperature_max",
  "apparent_temperature_min",
  "precipitation_probability_max",
  "weather_code",
  "wind_speed_10m_max"
] as const;

export async function fetchWeather(latitude: number, longitude: number, options: FetchWeatherOptions = {}): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
    daily: "weather_code,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "4"
  });
  return mapOpenMeteoForecast(await requestOpenMeteo(params, options));
}

export async function fetchWeatherForecast(
  latitude: number,
  longitude: number,
  days = DEFAULT_FORECAST_DAYS,
  options: FetchWeatherOptions = {}
): Promise<WeatherSnapshot[]> {
  assertForecastDays(days);
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: DAILY_FORECAST_FIELDS.join(","),
    timezone: "auto",
    forecast_days: String(days)
  });
  return mapOpenMeteoForecastDays(await requestOpenMeteo(params, options), days);
}

async function requestOpenMeteo(
  params: URLSearchParams,
  options: FetchWeatherOptions
): Promise<OpenMeteoPayload> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_WEATHER_TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: controller.signal
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Open-Meteo 请求失败: ${response.status}`);
    }
    return (await response.json()) as OpenMeteoPayload;
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      throw new Error("Open-Meteo 请求超时");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function buildEstimatedWeather(latitude: number, longitude: number, date = new Date()): WeatherSnapshot {
  const month = date.getMonth() + 1;
  const absoluteLatitude = Math.min(70, Math.abs(latitude));
  const season = estimateSeason(month, latitude);
  const continentalAdjustment = Math.abs(longitude) > 25 ? 1 : 0;
  const profile = estimateSeasonalProfile(season, absoluteLatitude, continentalAdjustment);
  return {
    date: formatLocalDate(date),
    temperature: profile.temperature,
    apparentTemperature: profile.apparentTemperature,
    precipitationProbability: profile.precipitationProbability,
    windSpeed: profile.windSpeed,
    weatherCode: 3,
    summary: "估算天气"
  };
}

export function buildEstimatedWeatherForecast(
  latitude: number,
  longitude: number,
  days = DEFAULT_FORECAST_DAYS,
  startDate = new Date()
): WeatherSnapshot[] {
  assertForecastDays(days);
  return Array.from({ length: days }, (_value, index) => {
    const date = new Date(startDate.getTime());
    date.setDate(date.getDate() + index);
    return buildEstimatedWeather(latitude, longitude, date);
  });
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

export function mapOpenMeteoForecastDays(
  payload: OpenMeteoPayload,
  days = DEFAULT_FORECAST_DAYS
): WeatherSnapshot[] {
  assertForecastDays(days);
  const daily = payload.daily || {};
  const fallbackDate = forecastFallbackDate(payload);
  return Array.from({ length: days }, (_value, index) => {
    const code = roundNumber(daily.weather_code?.[index]);
    return {
      date: daily.time?.[index] || addCalendarDays(fallbackDate, index),
      temperature: roundedMean(
        daily.temperature_2m_max?.[index],
        daily.temperature_2m_min?.[index]
      ),
      apparentTemperature: roundedMean(
        daily.apparent_temperature_max?.[index],
        daily.apparent_temperature_min?.[index]
      ),
      precipitationProbability: roundNumber(daily.precipitation_probability_max?.[index]),
      windSpeed: roundNumber(daily.wind_speed_10m_max?.[index]),
      weatherCode: code,
      summary: weatherCodeToSummary(code)
    };
  });
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

function roundedMean(maximum: number | undefined, minimum: number | undefined): number {
  const safeMaximum = Number.isFinite(maximum) ? Number(maximum) : 0;
  const safeMinimum = Number.isFinite(minimum) ? Number(minimum) : 0;
  return Math.round((safeMaximum + safeMinimum) / 2);
}

function assertForecastDays(days: number): void {
  if (!Number.isInteger(days) || days < MIN_FORECAST_DAYS || days > MAX_FORECAST_DAYS) {
    throw new RangeError("days 必须是 1 到 7 的整数");
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function estimateSeason(month: number, latitude: number): "spring" | "summer" | "autumn" | "winter" {
  const northernMonth = latitude >= 0 ? month : ((month + 5) % 12) + 1;
  if ([12, 1, 2].includes(northernMonth)) return "winter";
  if ([3, 4, 5].includes(northernMonth)) return "spring";
  if ([6, 7, 8].includes(northernMonth)) return "summer";
  return "autumn";
}

function estimateSeasonalProfile(
  season: "spring" | "summer" | "autumn" | "winter",
  absoluteLatitude: number,
  continentalAdjustment: number
): Omit<WeatherSnapshot, "date" | "weatherCode" | "summary"> {
  const latitudeCooling = Math.round(Math.max(0, absoluteLatitude - 25) / 5);
  if (season === "summer") {
    const temperature = 30 - Math.min(4, latitudeCooling) + continentalAdjustment;
    return {
      temperature,
      apparentTemperature: temperature + 2,
      precipitationProbability: 35,
      windSpeed: 10
    };
  }
  if (season === "winter") {
    const temperature = 12 - latitudeCooling * 2 - continentalAdjustment;
    return {
      temperature,
      apparentTemperature: temperature - 2,
      precipitationProbability: 20,
      windSpeed: 13
    };
  }
  const temperature = season === "spring" ? 20 - Math.min(3, latitudeCooling) : 18 - Math.min(3, latitudeCooling);
  return {
    temperature,
    apparentTemperature: temperature,
    precipitationProbability: season === "spring" ? 30 : 25,
    windSpeed: 11
  };
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function forecastFallbackDate(payload: OpenMeteoPayload): string {
  const dailyDate = payload.daily?.time?.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (dailyDate) return dailyDate;
  const currentDate = payload.current?.time?.slice(0, 10);
  if (currentDate && /^\d{4}-\d{2}-\d{2}$/.test(currentDate)) return currentDate;
  return formatLocalDate(new Date());
}

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}
