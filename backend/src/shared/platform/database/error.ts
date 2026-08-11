import type pg from "pg";
import { InfrastructureError } from "@/shared/core/errors";

const CONNECTION_SQLSTATE_CLASS = /^08\d{3}$/;

const CONNECTION_ERROR_CODES = new Set([
  "57P01",
  "57P02",
  "57P03",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
]);

const CONNECTION_ERROR_MESSAGES = [
  "timeout exceeded when trying to connect",
  "Connection terminated unexpectedly",
  "Client has encountered a connection error and is not queryable",
];

export function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === "string" && CONNECTION_ERROR_CODES.has(code)) return true;
  if (
    typeof code === "string" &&
    CONNECTION_SQLSTATE_CLASS.test(code)
  ) {
    return true;
  }

  return CONNECTION_ERROR_MESSAGES.some((message) =>
    error.message.includes(message),
  );
}

export function translateDatabaseError(error: unknown): unknown {
  if (!isConnectionError(error)) return error;

  const translated = new InfrastructureError("database");
  translated.cause = error;
  return translated;
}

type QueryCallback = (err: Error | null, result: unknown) => void;

export function wrapClientQuery(client: pg.PoolClient): pg.PoolClient {
  const originalQuery = client.query.bind(client) as (
    queryTextOrConfig: string | pg.QueryConfig,
    values?: unknown[] | QueryCallback,
    callback?: QueryCallback,
  ) => Promise<pg.QueryResult> | void;

  const wrappedQuery: typeof client.query = ((
    queryTextOrConfig: string | pg.QueryConfig,
    values?: unknown[] | QueryCallback,
    callback?: QueryCallback,
  ) => {
    if (typeof values === "function") {
      callback = values;
      values = undefined;
    }

    if (callback) {
      return originalQuery(
        queryTextOrConfig,
        values,
        (err, result) => {
          callback(translateDatabaseError(err) as Error | null, result);
        },
      ) as unknown as Promise<pg.QueryResult>;
    }

    return (originalQuery(
      queryTextOrConfig,
      values,
    ) as unknown as Promise<pg.QueryResult>).catch((error: unknown) => {
      throw translateDatabaseError(error);
    });
  }) as typeof client.query;

  client.query = wrappedQuery;
  return client;
}
