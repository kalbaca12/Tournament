import { api } from "./client";

export const matchesApi = {
  get: (id) => api.get(`/matches/${id}`),
  update: (id, data) => api.put(`/matches/${id}`, data),
  remove: (id) => api.delete(`/matches/${id}`),
  setResult: (id, data) => api.post(`/matches/${id}/result`, data),
  stats: (id) => api.get(`/matches/${id}/stats`),
  submitStatsBulk: (id, data) => api.post(`/matches/${id}/stats`, data),
};

