import { api } from "./client";

export const tournamentsApi = {
  list: () => api.get("/tournaments"),
  create: (data) => api.post("/tournaments", data),
  get: (id) => api.get(`/tournaments/${id}`),
  feasibility: (id) => api.get(`/tournaments/${id}/feasibility`),
  update: (id, data) => api.put(`/tournaments/${id}`, data),
  remove: (id) => api.delete(`/tournaments/${id}`),
  lockParticipants: (id) => api.post(`/tournaments/${id}/lock-participants`),
  unlockParticipants: (id) => api.post(`/tournaments/${id}/unlock-participants`),
  teams: (id) => api.get(`/tournaments/${id}/teams`),
  addTeam: (id, payload) => api.post(`/tournaments/${id}/teams`, payload),
  removeTeam: (id, teamId) => api.delete(`/tournaments/${id}/teams/${teamId}`),
  requestParticipation: (id, payload) => api.post(`/tournaments/${id}/participation-requests`, payload),
  myParticipationRequests: (id) => api.get(`/tournaments/${id}/participation-requests/mine`),
  participationRequests: (id) => api.get(`/tournaments/${id}/participation-requests`),
  approveRequest: (requestId) => api.post(`/participation-requests/${requestId}/approve`),
  rejectRequest: (requestId, payload) => api.post(`/participation-requests/${requestId}/reject`, payload || {}),
  matches: (id) => api.get(`/tournaments/${id}/matches`),
  createMatch: (id, data) => api.post(`/tournaments/${id}/matches`, data),
  generateSchedule: (id) => api.post(`/tournaments/${id}/generate-schedule`),
  clearSchedule: (id) => api.delete(`/tournaments/${id}/schedule`),
};

