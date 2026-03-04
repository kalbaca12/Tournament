import { api } from "./client";

export const teamsApi = {
  list: () => api.get("/teams"),
  mine: () => api.get("/teams/my"),
  create: (data) => api.post("/teams", data),
  get: (id) => api.get(`/teams/${id}`),
  matches: (id) => api.get(`/teams/${id}/matches`),
  update: (id, data) => api.put(`/teams/${id}`, data),
  remove: (id) => api.delete(`/teams/${id}`),
};

