import { describe, expect, it } from "vitest";
import { mapOpenMeteoForecast } from "../server/services/weather";

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
});
