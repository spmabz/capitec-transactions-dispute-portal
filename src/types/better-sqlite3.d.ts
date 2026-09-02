declare module "better-sqlite3" {
  type Row = Record<string, unknown>;

  type RunResult = {
    changes: number;
    lastInsertRowid: number | bigint;
  };

  class Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): Row | undefined;
    all(...params: unknown[]): Row[];
  }

  export default class Database {
    constructor(filename: string, options?: Record<string, unknown>);
    prepare(sql: string): Statement;
    pragma(source: string): unknown;
    exec(sql: string): this;
    transaction<T extends (...args: any[]) => any>(fn: T): T;
    close(): void;
  }
}
