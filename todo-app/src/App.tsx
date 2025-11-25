import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  TOKEN_STORAGE_KEY,
  createTodoRemote,
  createUserAsAdmin,
  deleteTodoRemote,
  fetchAdminOverview,
  fetchSession,
  fetchTodos,
  login,
  register,
  toggleTodoRemote,
  type AdminOverview,
  type Profile,
  type TodoModel,
} from './services/auth'
import type { FormEvent } from 'react'

type Filter = 'all' | 'open' | 'done'

type Session = {
  token: string
  profile: Profile
}

const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'all' },
  { id: 'open', label: 'active' },
  { id: 'done', label: 'done' },
]

const routeFromWindow = () =>
  typeof window !== 'undefined' ? window.location.pathname : '/'

const errorText: Record<string, string> = {
  'email-in-use': 'Email already used',
  'invalid-credentials': 'Check credentials',
  'validation-error': 'Fix the fields',
  'missing-token': 'Session missing',
  forbidden: 'Not allowed',
}

const toError = (value: unknown) => {
  if (value instanceof Error) {
    return errorText[value.message] || value.message
  }
  if (typeof value === 'string') {
    return errorText[value] || value
  }
  return 'Something broke'
}

function App() {
  const [route, setRoute] = useState(routeFromWindow())
  const [session, setSession] = useState<Session | null>(null)
  const [booting, setBooting] = useState(true)
  const [todos, setTodos] = useState<TodoModel[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [draft, setDraft] = useState('')
  const [pulse, setPulse] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [todoBusy, setTodoBusy] = useState(false)
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [adminBusy, setAdminBusy] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [adminForm, setAdminForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
  })

  const notificationSupport =
    typeof window !== 'undefined' && 'Notification' in window

  const [notifyState, setNotifyState] = useState<
    'default' | 'granted' | 'denied'
  >(() => {
    if (!notificationSupport) return 'denied'
    if (Notification.permission === 'granted') return 'granted'
    if (Notification.permission === 'denied') return 'denied'
    return 'default'
  })

  const requestNotifications = useCallback(async () => {
    if (!notificationSupport) return
    const permission = await Notification.requestPermission()
    setNotifyState(permission)
  }, [notificationSupport])

  const pushNotification = useCallback(
    (body: string) => {
      if (!notificationSupport || notifyState !== 'granted') return
      new Notification('Winery Board', { body })
    },
    [notificationSupport, notifyState],
  )

  const navigate = useCallback((target: string) => {
    if (typeof window === 'undefined') return
    if (window.location.pathname === target) return
    window.history.pushState({}, '', target)
    setRoute(target)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => setRoute(window.location.pathname)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  useEffect(() => {
    if (!pulse) return
    const timer = window.setTimeout(() => setPulse(''), 2400)
    return () => window.clearTimeout(timer)
  }, [pulse])

  const persistToken = useCallback((token: string | null) => {
    if (typeof window === 'undefined') return
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  }, [])

  const hydrate = useCallback(
    async (token: string) => {
      try {
        const [{ profile }, todoPayload] = await Promise.all([
          fetchSession(token),
          fetchTodos(token),
        ])
        setSession({ token, profile })
        setTodos(todoPayload.todos)
        persistToken(token)
      } catch (error) {
        persistToken(null)
        setSession(null)
        setTodos([])
        setPulse(toError(error))
      } finally {
        setBooting(false)
      }
    },
    [persistToken],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY)
    if (stored) {
      hydrate(stored).catch(() => setBooting(false))
    } else {
      setBooting(false)
    }
  }, [hydrate])

  const isAdminView = route.endsWith('/admin')

  useEffect(() => {
    if (!isAdminView) return
    if (!session || session.profile.role !== 'admin') return
    setAdminBusy(true)
    fetchAdminOverview(session.token)
      .then((payload) => setOverview(payload))
      .catch((error) => setAdminError(toError(error)))
      .finally(() => setAdminBusy(false))
  }, [isAdminView, session])

  const filteredTodos = useMemo(() => {
    if (filter === 'open') return todos.filter((todo) => !todo.done)
    if (filter === 'done') return todos.filter((todo) => todo.done)
    return todos
  }, [filter, todos])

  const remaining = useMemo(
    () => todos.filter((todo) => !todo.done).length,
    [todos],
  )

  const locked = !session

  const addTodo = async () => {
    if (locked || todoBusy || !session) return
    const trimmed = draft.trim()
    if (!trimmed) return
    setTodoBusy(true)
    try {
      const { todo } = await createTodoRemote(trimmed, session.token)
      setTodos((prev) => [todo, ...prev])
      setDraft('')
      setPulse('Saved')
      pushNotification(`Added: ${todo.label}`)
    } catch (error) {
      setPulse(toError(error))
    } finally {
      setTodoBusy(false)
    }
  }

  const toggleTodo = async (id: string) => {
    if (locked || !session) return
    const target = todos.find((todo) => todo.id === id)
    if (!target) return
    try {
      const { todo } = await toggleTodoRemote(id, !target.done, session.token)
      setTodos((prev) => prev.map((item) => (item.id === id ? todo : item)))
      if (todo.done) {
        pushNotification(`Done: ${todo.label}`)
      }
    } catch (error) {
      setPulse(toError(error))
    }
  }

  const removeTodo = async (id: string) => {
    if (locked || !session) return
    try {
      await deleteTodoRemote(id, session.token)
      setTodos((prev) => prev.filter((todo) => todo.id !== id))
      setPulse('Removed')
    } catch (error) {
      setPulse(toError(error))
    }
  }

  const handleAuthSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (authBusy) return
    setAuthBusy(true)
    setAuthError('')
    try {
      const trimmedEmail = authForm.email.trim()
      const trimmedName = authForm.name.trim()
      const response =
        authMode === 'login'
          ? await login({
              email: trimmedEmail,
              password: authForm.password,
            })
          : await register({
              name: trimmedName,
              email: trimmedEmail,
              password: authForm.password,
            })
      await hydrate(response.token)
      setAuthForm({ name: '', email: '', password: '' })
      if (notifyState === 'default') {
        requestNotifications()
      }
    } catch (error) {
      setAuthError(toError(error))
    } finally {
      setAuthBusy(false)
    }
  }

  const handleSignOut = () => {
    persistToken(null)
    setSession(null)
    setTodos([])
    setOverview(null)
    if (isAdminView) {
      navigate('/')
    }
  }

  const handleAdminCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!session || session.profile.role !== 'admin' || adminBusy) return
    setAdminBusy(true)
    setAdminError('')
    try {
      await createUserAsAdmin(
        {
          name: adminForm.name.trim(),
          email: adminForm.email.trim(),
          password: adminForm.password,
          role: adminForm.role as 'user' | 'admin',
        },
        session.token,
      )
      const payload = await fetchAdminOverview(session.token)
      setOverview(payload)
      setAdminForm({ name: '', email: '', password: '', role: 'user' })
    } catch (error) {
      setAdminError(toError(error))
    } finally {
      setAdminBusy(false)
    }
  }

  if (booting) {
    return (
      <div className="board-stage">
        <div className="board-card loading">loading</div>
      </div>
    )
  }

  const renderAuth = () => (
    <section className="auth-block">
      {session ? (
        <div className="auth-row">
          <div>
            <span className="auth-name">
              {session.profile.name}
              {session.profile.role === 'admin' && (
                <i className="mini-tag">admin</i>
              )}
            </span>
            <span className="auth-mail">{session.profile.email}</span>
          </div>
          <div className="auth-actions">
            {session.profile.role === 'admin' && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => navigate('/admin')}
              >
                admin
              </button>
            )}
            <button type="button" onClick={handleSignOut}>
              sign out
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="auth-tabs">
            <button
              type="button"
              className={authMode === 'login' ? 'active' : ''}
              onClick={() => {
                setAuthMode('login')
                setAuthError('')
              }}
            >
              login
            </button>
            <button
              type="button"
              className={authMode === 'signup' ? 'active' : ''}
              onClick={() => {
                setAuthMode('signup')
                setAuthError('')
              }}
            >
              sign up
            </button>
          </div>
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'signup' && (
              <input
                type="text"
                placeholder="name"
                value={authForm.name}
                onChange={(event) =>
                  setAuthForm((prev) => ({ ...prev, name: event.target.value }))
                }
                required
              />
            )}
            <input
              type="email"
              placeholder="email"
              value={authForm.email}
              onChange={(event) =>
                setAuthForm((prev) => ({ ...prev, email: event.target.value }))
              }
              required
            />
            <input
              type="password"
              placeholder="password"
              value={authForm.password}
              onChange={(event) =>
                setAuthForm((prev) => ({
                  ...prev,
                  password: event.target.value,
                }))
              }
              required
            />
            <button type="submit" disabled={authBusy}>
              {authBusy ? '...' : authMode === 'login' ? 'login' : 'create'}
            </button>
            {authError && <span className="auth-error">{authError}</span>}
          </form>
        </>
      )}
    </section>
  )

  const renderBoard = () => (
    <div className="board-stage">
      <div className="board-card">
        <header className="board-head">
          <div className="brand-chip">Winery</div>
          <h1>Winery Board</h1>
          <div className="count-chip">
            <span>{remaining}</span>
            left
          </div>
        </header>

        {renderAuth()}

        <div className="composer">
          <input
            placeholder="add task"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addTodo()
            }}
            disabled={locked}
          />
          <button
            type="button"
            onClick={addTodo}
            disabled={locked || !draft.trim() || todoBusy}
          >
            {todoBusy ? '...' : 'add'}
          </button>
        </div>

        <div className="push-row">
          <span>push</span>
          <button
            type="button"
            className={`ghost-btn ${notifyState === 'granted' ? 'active' : ''}`}
            onClick={requestNotifications}
            disabled={notifyState === 'granted'}
          >
            {notifyState === 'granted'
              ? 'on'
              : notifyState === 'denied'
                ? 'blocked'
                : 'allow'}
          </button>
        </div>

        <div className="filter-row">
          {filters.map((item) => (
            <button
              key={item.id}
              className={filter === item.id ? 'active' : ''}
              onClick={() => setFilter(item.id)}
              type="button"
              disabled={locked}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="todo-wrap">
          {!session && <div className="todo-mask">locked</div>}
          <ul>
            {filteredTodos.map((todo) => (
              <li key={todo.id} className={todo.done ? 'done' : ''}>
                <label>
                  <input
                    type="checkbox"
                    checked={todo.done}
                    onChange={() => toggleTodo(todo.id)}
                  />
                  <span>{todo.label}</span>
                </label>
                <div>
                  <time>
                    {new Date(todo.createdAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  <button
                    type="button"
                    aria-label="delete"
                    onClick={() => removeTodo(todo.id)}
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {pulse && <div className="pulse">{pulse}</div>}
        <footer className="board-foot">made by winery</footer>
      </div>
    </div>
  )

  const renderAdmin = () => (
    <div className="board-stage">
      <div className="board-card admin">
        <header className="board-head">
          <div className="brand-chip ghost">Admin</div>
          <h1>Winery Panel</h1>
          <button className="ghost-btn" type="button" onClick={() => navigate('/')}>
            board
          </button>
        </header>

        {!session ? (
          <div className="admin-lock">sign in first</div>
        ) : session.profile.role !== 'admin' ? (
          <div className="admin-lock">no access</div>
        ) : (
          <>
            <section className="admin-form">
              <form onSubmit={handleAdminCreate}>
                <div className="grid">
                  <input
                    type="text"
                    placeholder="name"
                    value={adminForm.name}
                    onChange={(event) =>
                      setAdminForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    required
                  />
                  <input
                    type="email"
                    placeholder="email"
                    value={adminForm.email}
                    onChange={(event) =>
                      setAdminForm((prev) => ({
                        ...prev,
                        email: event.target.value,
                      }))}
                    required
                  />
                </div>
                <div className="grid">
                  <input
                    type="password"
                    placeholder="password"
                    value={adminForm.password}
                    onChange={(event) =>
                      setAdminForm((prev) => ({
                        ...prev,
                        password: event.target.value,
                      }))
                    }
                    required
                  />
                  <select
                    value={adminForm.role}
                    onChange={(event) =>
                      setAdminForm((prev) => ({
                        ...prev,
                        role: event.target.value,
                      }))
                    }
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <button type="submit" disabled={adminBusy}>
                  {adminBusy ? '...' : 'create'}
                </button>
                {adminError && <span className="auth-error">{adminError}</span>}
              </form>
            </section>

            <section className="admin-grid">
              {adminBusy && <div className="admin-note">updating</div>}
              {overview &&
                [...overview.admins, ...overview.users].map((account) => (
                  <article key={account.id}>
                    <header>
                      <strong>{account.name}</strong>
                      <span>{account.email}</span>
                    </header>
                    <div className="meta">
                      <span>{account.role}</span>
                      <span>{account.todos.length} todos</span>
                    </div>
                    <ul>
                      {account.todos.slice(0, 3).map((todo) => (
                        <li key={todo.id} className={todo.done ? 'done' : ''}>
                          <span>{todo.label}</span>
                          <time>
                            {new Date(todo.createdAt).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </li>
                      ))}
                      {account.todos.length === 0 && (
                        <li className="muted">no items</li>
                      )}
                      {account.todos.length > 3 && (
                        <li className="muted">+{account.todos.length - 3} more</li>
                      )}
                    </ul>
                  </article>
                ))}
            </section>
          </>
        )}

        <footer className="board-foot">made by winery</footer>
      </div>
    </div>
  )

  return isAdminView ? renderAdmin() : renderBoard()
}

export const Winery = true
export default App

