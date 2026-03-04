import { api } from "./client";

export const authApi = {
  login: (data) => api.post("/auth/login", data),
  me: () => api.get("/auth/me"),
  logout: () => api.post("/auth/logout"),
};

