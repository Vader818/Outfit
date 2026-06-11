import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWeather, mapOpenMeteoForecast } from "../server/services/weather";

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
});
