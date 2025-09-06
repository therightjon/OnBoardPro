// Search API helpers
export async function searchDepartments(q: string) {
  const url = `/api/search/departments?q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { 
    headers: { 'Accept': 'application/json' },
    credentials: 'include'
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`searchDepartments ${r.status}: ${text.slice(0, 200)}`);
  }
  let json: any;
  try { 
    json = await r.json(); 
  } catch (e) {
    const text = await r.text();
    throw new Error(`searchDepartments invalid JSON: ${text.slice(0, 200)}`);
  }
  return (json.items ?? []) as { id: string; name: string; score?: number }[];
}

export async function searchDivisions(q: string, departmentId?: string) {
  const params = new URLSearchParams({ q });
  if (departmentId) params.append('departmentId', departmentId);
  
  const url = `/api/search/divisions?${params}`;
  const r = await fetch(url, { 
    headers: { 'Accept': 'application/json' },
    credentials: 'include'
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`searchDivisions ${r.status}: ${text.slice(0, 200)}`);
  }
  let json: any;
  try { 
    json = await r.json(); 
  } catch (e) {
    const text = await r.text();
    throw new Error(`searchDivisions invalid JSON: ${text.slice(0, 200)}`);
  }
  return (json.items ?? []) as { id: string; name: string; score?: number }[];
}

export async function searchManagers(q: string) {
  const url = `/api/search/users?q=${encodeURIComponent(q)}&role=manager`;
  const r = await fetch(url, { 
    headers: { 'Accept': 'application/json' },
    credentials: 'include'
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`searchManagers ${r.status}: ${text.slice(0, 200)}`);
  }
  let json: any;
  try { 
    json = await r.json(); 
  } catch (e) {
    const text = await r.text();
    throw new Error(`searchManagers invalid JSON: ${text.slice(0, 200)}`);
  }
  return (json.items ?? []) as { id: string; name: string; score?: number }[];
}