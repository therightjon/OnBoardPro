// Search API helpers
import { apiRequest } from "./queryClient";

export async function searchDepartments(q: string) {
  const url = `/api/search/departments?q=${encodeURIComponent(q)}`;
  const res = await apiRequest("GET", url);
  const json = await res.json();
  return (json.items ?? []) as { id: string; name: string; score?: number }[];
}

export async function searchDivisions(q: string, departmentId?: string) {
  const params = new URLSearchParams({ q });
  if (departmentId) params.append('departmentId', departmentId);
  
  const url = `/api/search/divisions?${params}`;
  const res = await apiRequest("GET", url);
  const json = await res.json();
  return (json.items ?? []) as { id: string; name: string; score?: number }[];
}

export async function searchManagers(q: string, departmentId?: string, divisionId?: string) {
  const params = new URLSearchParams({ q, role: 'manager' });
  if (divisionId) params.append('divisionId', divisionId);
  else if (departmentId) params.append('departmentId', departmentId);
  const url = `/api/search/users?${params.toString()}`;
  const res = await apiRequest("GET", url);
  const json = await res.json();
  return (json.items ?? []) as { id: string; name: string; score?: number }[];
}
