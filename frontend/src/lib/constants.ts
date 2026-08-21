export const DEFAULT_API_BASE_URL = "http://localhost:3000/api";

export const ROUTES = {
  home: "/",
  todoDetail: (id: number | string) => `/todos/${id}`,
} as const;
