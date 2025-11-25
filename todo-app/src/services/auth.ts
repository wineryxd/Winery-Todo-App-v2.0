export const TOKEN_STORAGE_KEY = 'wineryboard.token'

export type Profile = {
  id: string
  name: string
  email: string
  role: 'user' | 'admin'
  createdAt: number
}

export type TodoModel = {
  id: string
  label: string
  done: boolean
  createdAt: number
}

type AuthResponse = {
  token: string
  profile: Profile
}

type RegisterPayload = {
  name: string
  email: string
  password: string
}

type LoginPayload = Omit<RegisterPayload, 'name'>

type AdminCreatePayload = RegisterPayload & { role?: 'user' | 'admin' }

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  'http://localhost:4000'

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const message = body?.message || 'server-error'
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

export async function register(payload: RegisterPayload) {
  return request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function login(payload: LoginPayload) {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchSession(token: string) {
  return request<{ profile: Profile }>('/api/auth/session', {}, token)
}

export async function fetchTodos(token: string) {
  return request<{ todos: TodoModel[] }>('/api/todos', {}, token)
}

export async function createTodoRemote(label: string, token: string) {
  return request<{ todo: TodoModel }>(
    '/api/todos',
    {
      method: 'POST',
      body: JSON.stringify({ label }),
    },
    token,
  )
}

export async function toggleTodoRemote(
  id: string,
  done: boolean,
  token: string,
) {
  return request<{ todo: TodoModel }>(
    `/api/todos/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ done }),
    },
    token,
  )
}

export async function deleteTodoRemote(id: string, token: string) {
  const response = await fetch(`${API_URL}/api/todos/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const message = body?.message || 'server-error'
    throw new Error(message)
  }
}

export type AdminOverview = {
  users: Array<Profile & { todos: TodoModel[] }>
  admins: Array<Profile & { todos: TodoModel[] }>
}

export async function fetchAdminOverview(token: string) {
  return request<AdminOverview>('/api/admin/overview', {}, token)
}

export async function createUserAsAdmin(
  payload: AdminCreatePayload,
  token: string,
) {
  return request<{ profile: Profile }>(
    '/api/admin/users',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export const Winery = true

