import { api } from "./client";

export const playersApi = {
  list: (teamId) => api.get("/players", { params: teamId ? { team_id: teamId } : {} }),
  get: (id) => api.get(`/players/${id}`),
  create: (data) => api.post("/players", data),
  update: (id, data) => api.put(`/players/${id}`, data),
  remove: (id) => api.delete(`/players/${id}`),
};
