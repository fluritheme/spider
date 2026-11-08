export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Database {
  prepare(query: string): Statement;
  batch(statements: Statement[]): Promise<unknown>;
}
export interface Environment {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ANALYTICS_DB: Database;
  API_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
  LOGIN_LIMIT: { limit(options: { key: string }): Promise<{ success: boolean }> };
  DASHBOARD_PASSWORD_HASH?: string;
  MAINTENANCE_KEY_HASH?: string;
}
