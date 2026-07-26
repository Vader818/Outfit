import type { AppDatabase } from "../server/db";
import { createFirstUser } from "../server/auth";
import { ApiError } from "../server/validation";
import { createDatabase } from "./helpers/testDatabase";
import { describe, expect, it } from "vitest";

describe("local account creation", () => {
  it("rejects an account created after the initial empty-account check", () => {
    const database = createDatabase(":memory:");
    let interceptedInitialCount = false;

    const staleReadDatabase = new Proxy(database, {
      get(target, property) {
        if (property === "prepare") {
          return (sql: string) => {
            const statement = target.prepare(sql);
            if (
              !interceptedInitialCount &&
              sql.includes("SELECT COUNT(*) AS count FROM users")
            ) {
              return new Proxy(statement, {
                get(statementTarget, statementProperty) {
                  if (statementProperty === "get") {
                    return (...args: Parameters<typeof statementTarget.get>) => {
                      const staleRow = statementTarget.get(...args);
                      interceptedInitialCount = true;
                      createFirstUser(database, {
                        username: "winner",
                        password: "correct-password"
                      });
                      return staleRow;
                    };
                  }

                  const value = Reflect.get(statementTarget, statementProperty, statementTarget);
                  return typeof value === "function" ? value.bind(statementTarget) : value;
                }
              });
            }
            return statement;
          };
        }

        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    }) as AppDatabase;

    expect(() => createFirstUser(staleReadDatabase, {
      username: "loser",
      password: "correct-password"
    })).toThrowError(expect.objectContaining<Partial<ApiError>>({
      code: "ACCOUNT_EXISTS",
      status: 409
    }));

    expect(database.prepare("SELECT username FROM users ORDER BY id").all()).toEqual([
      { username: "winner" }
    ]);
  });
});
