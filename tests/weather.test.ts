import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEstimatedWeatherForecast,
  fetchWeather,
  fetchWeatherForecast,
  mapOpenMeteoForecast,
  mapOpenMeteoForecastDays
} from "../server/services/weather";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("mapOpenMeteoForecast", () => {
  it("maps Open-Meteo current and daily fields into a wardrobe weather snapshot", () => {
    const snapshot = mapOpenMeteoForecast({
      current: {
        time: "2026-01-03T09:00",
        temperature_2m: 6.4,
        apparent_temperature: 3.8,
        precipitation: 1.2,
        weather_code: 61,
        wind_speed_10m: 22.5
      },
      daily: {
        time: ["2026-01-03"],
        precipitation_probability_max: [78],
        weather_code: [61]
      }
    });

    expect(snapshot).toEqual({
      date: "2026-01-03",
      temperature: 6,
      apparentTemperature: 4,
      precipitationProbability: 78,
      windSpeed: 23,
      weatherCode: 61,
      summary: "小雨"
    });
  });

  it("aborts Open-Meteo requests when the timeout expires", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = expect(fetchWeather(39.9042, 116.4074, { timeoutMs: 10 })).rejects.toThrow("Open-Meteo 请求超时");
    await vi.advanceTimersByTimeAsync(10);

    await request;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the timeout active while the Open-Meteo response body is still streaming", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          bodyController = controller;
          controller.enqueue(new TextEncoder().encode('{"current":'));
          requestSignal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            controller.error(error);
          }, { once: true });
        }
      });
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" }
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const weatherRequest = fetchWeather(39.9042, 116.4074, { timeoutMs: 10 });
    const timeoutAssertion = expect(weatherRequest).rejects.toThrow("Open-Meteo 请求超时");
    await vi.advanceTimersByTimeAsync(10);
    try {
      expect(requestSignal?.aborted).toBe(true);
      await timeoutAssertion;
    } finally {
      if (!requestSignal?.aborted) {
        const error = new Error("test cleanup");
        error.name = "AbortError";
        bodyController?.error(error);
      }
      await weatherRequest.catch(() => undefined);
    }
  });
});

describe("daily weather forecasts", () => {
  it("maps aligned Open-Meteo daily arrays into rounded daily snapshots", () => {
    expect(mapOpenMeteoForecastDays({
      daily: {
        time: ["2026-01-03", "2026-01-04", "2026-01-05"],
        temperature_2m_max: [12.4, 20.2, 30.9],
        temperature_2m_min: [3.6, 9.8, 21.1],
        apparent_temperature_max: [10.2, 18.6, 34.1],
        apparent_temperature_min: [0.2, 8.4, 22.9],
        precipitation_probability_max: [78, 12.4, 55.5],
        weather_code: [61, 1, 95],
        wind_speed_10m_max: [22.5, 7.4, 30.6]
      }
    }, 3)).toEqual([
      {
        date: "2026-01-03",
        temperature: 8,
        apparentTemperature: 5,
        precipitationProbability: 78,
        windSpeed: 23,
        weatherCode: 61,
        summary: "小雨"
      },
      {
        date: "2026-01-04",
        temperature: 15,
        apparentTemperature: 14,
        precipitationProbability: 12,
        windSpeed: 7,
        weatherCode: 1,
        summary: "多云"
      },
      {
        date: "2026-01-05",
        temperature: 26,
        apparentTemperature: 29,
        precipitationProbability: 56,
        windSpeed: 31,
        weatherCode: 95,
        summary: "雷雨"
      }
    ]);
  });

  it("keeps each daily field at its own index and substitutes zero for missing values", () => {
    expect(mapOpenMeteoForecastDays({
      daily: {
        time: ["2026-02-01", "2026-02-02", "2026-02-03"],
        temperature_2m_max: [10],
        temperature_2m_min: [2, 4],
        weather_code: [0]
      }
    }, 3)).toEqual([
      expect.objectContaining({
        date: "2026-02-01",
        temperature: 6,
        apparentTemperature: 0,
        precipitationProbability: 0,
        windSpeed: 0,
        weatherCode: 0,
        summary: "晴"
      }),
      expect.objectContaining({
        date: "2026-02-02",
        temperature: 2,
        apparentTemperature: 0,
        weatherCode: 0,
        summary: "晴"
      }),
      expect.objectContaining({
        date: "2026-02-03",
        temperature: 0,
        apparentTemperature: 0,
        weatherCode: 0,
        summary: "晴"
      })
    ]);
  });

  it("builds consecutive estimated snapshots and defaults to seven days", () => {
    const startDate = new Date(2026, 0, 31, 12, 0, 0);
    const forecast = buildEstimatedWeatherForecast(39.9042, 116.4074, 3, startDate);

    expect(forecast.map((snapshot) => snapshot.date)).toEqual([
      "2026-01-31",
      "2026-02-01",
      "2026-02-02"
    ]);
    expect(forecast.every((snapshot) => snapshot.summary === "估算天气")).toBe(true);
    expect(buildEstimatedWeatherForecast(39.9042, 116.4074, undefined, startDate)).toHaveLength(7);
  });

  it.each([0, 8, 1.5, Number.NaN])("rejects an invalid forecast day count %s", async (days) => {
    expect(() => mapOpenMeteoForecastDays({ daily: { time: [] } }, days)).toThrow(/days.*1.*7/i);
    expect(() => buildEstimatedWeatherForecast(39.9042, 116.4074, days)).toThrow(/days.*1.*7/i);
    await expect(fetchWeatherForecast(39.9042, 116.4074, days)).rejects.toThrow(/days.*1.*7/i);
  });

  it("requests exactly the selected daily fields and forecast day count", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      daily: {
        time: ["2026-01-03", "2026-01-04"],
        temperature_2m_max: [12, 14],
        temperature_2m_min: [4, 6],
        apparent_temperature_max: [10, 12],
        apparent_temperature_min: [2, 4],
        precipitation_probability_max: [78, 20],
        weather_code: [61, 2],
        wind_speed_10m_max: [22, 8]
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const forecast = await fetchWeatherForecast(39.9042, 116.4074, 2);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));

    expect(forecast).toHaveLength(2);
    expect(requestedUrl.searchParams.get("forecast_days")).toBe("2");
    expect(requestedUrl.searchParams.get("timezone")).toBe("auto");
    expect(requestedUrl.searchParams.get("daily")?.split(",")).toEqual([
      "temperature_2m_max",
      "temperature_2m_min",
      "apparent_temperature_max",
      "apparent_temperature_min",
      "precipitation_probability_max",
      "weather_code",
      "wind_speed_10m_max"
    ]);
  });

  it("requests seven forecast days by default", async () => {
    const dates = Array.from({ length: 7 }, (_value, index) => `2026-01-${String(index + 3).padStart(2, "0")}`);
    const fetchMock = vi.fn(async (_url: string | URL | Request) => new Response(JSON.stringify({
      daily: { time: dates }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const forecast = await fetchWeatherForecast(39.9042, 116.4074);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));

    expect(forecast.map((snapshot) => snapshot.date)).toEqual(dates);
    expect(requestedUrl.searchParams.get("forecast_days")).toBe("7");
  });

  it("aborts forecast requests when the timeout expires", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }));
    vi.stubGlobal("fetch", fetchMock);

    const request = expect(fetchWeatherForecast(39.9042, 116.4074, 2, { timeoutMs: 10 }))
      .rejects.toThrow("Open-Meteo 请求超时");
    await vi.advanceTimersByTimeAsync(10);

    await request;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
