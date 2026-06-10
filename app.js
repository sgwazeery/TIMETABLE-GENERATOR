import React, { useState, useEffect, useContext, createContext, useRef, useCallback, useMemo } from 'https://cdn.jsdelivr.net/npm/react@18.2.0/+esm';
import { createRoot } from 'https://cdn.jsdelivr.net/npm/react-dom@18.2.0/client/+esm';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation, Navigate, useParams, useSearchParams } from 'https://cdn.jsdelivr.net/npm/react-router-dom@6.20.0/+esm';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'https://cdn.jsdelivr.net/npm/recharts@2.10.3/+esm';
import jsPDF from 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm';
import html2canvas from 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from 'https://cdn.jsdelivr.net/npm/@tanstack/react-query@5.17.19/+esm';
import { create } from 'https://cdn.jsdelivr.net/npm/zustand@4.4.7/+esm';

// ---------- Constants ----------

// ---------- Zustand Store (Auth + Theme) ----------
const useStore = create((set, get) => ({
  user: null,
  token: localStorage.getItem('token') || null,
  theme: localStorage.getItem('theme') || 'light',
  login: (token, userData) => {
    localStorage.setItem('token', token);
    set({
      token,
      user: userData
    });
  },
  logout: () => {
    localStorage.removeItem('token');
    set({
      token: null,
      user: null
    });
  },
  setUser: user => set({
    user
  }),
  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    set({
      theme: newTheme
    });
  },
  initTheme: () => {
    const theme = get().theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }
}));

// ---------- Query Client ----------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      retry: 1
    }
  }
});

// ---------- Auth API Helper (React Query) ----------
function useAuthApi() {
  const token = useStore(state => state.token);
  const logout = useStore(state => state.logout);
  const fetchWithAuth = useCallback(async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers
    });
    if (res.status === 401) {
      logout();
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({
        msg: 'Request failed'
      }));
      throw new Error(err.msg || 'Error');
    }
    return res.json();
  }, [token, logout]);
  return fetchWithAuth;
}

// ---------- Toast Context (for simple notifications) ----------
const ToastContext = /*#__PURE__*/createContext();
function ToastProvider({
  children
}) {
  const [toasts, setToasts] = useState([]);
  const addToast = (msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, {
      id,
      msg,
      type
    }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };
  return /*#__PURE__*/React.createElement(ToastContext.Provider, {
    value: {
      addToast
    }
  }, children, /*#__PURE__*/React.createElement("div", {
    className: "fixed top-4 right-4 z-50 space-y-2"
  }, toasts.map(t => /*#__PURE__*/React.createElement("div", {
    key: t.id,
    className: `px-4 py-2 rounded shadow-lg text-white flex items-center gap-2 ${t.type === 'success' ? 'bg-green-600' : t.type === 'error' ? 'bg-red-600' : 'bg-blue-600'}`
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas ${t.type === 'success' ? 'fa-check-circle' : t.type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}`
  }), t.msg))));
}
function useToast() {
  return useContext(ToastContext);
}

// ---------- Protected Route ----------
function ProtectedRoute({
  children,
  roles
}) {
  const user = useStore(state => state.user);
  const token = useStore(state => state.token);
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    // If user not loaded, fetch from /api/auth/me
    if (!user) {
      fetch(`${API_BASE}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }).then(res => res.ok ? res.json() : Promise.reject()).then(data => useStore.getState().setUser(data.user)).catch(() => useStore.getState().logout()).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token, user]);
  if (loading) return /*#__PURE__*/React.createElement("div", {
    className: "flex justify-center items-center h-screen"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-spinner fa-spin text-3xl"
  }));
  if (!token || !user) return /*#__PURE__*/React.createElement(Navigate, {
    to: "/login",
    state: {
      from: location
    },
    replace: true
  });
  if (roles && !roles.includes(user.role)) return /*#__PURE__*/React.createElement("div", {
    className: "p-8 text-red-500 text-center text-xl"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-lock"
  }), " Access Denied");
  return children;
}

// ---------- Pages ----------
// Auth Pages
function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const login = useStore(state => state.login);
  const navigate = useNavigate();
  const {
    addToast
  } = useToast();
  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Login failed');
      login(data.access_token, data.user);
      addToast('Login successful', 'success');
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen flex items-center justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card p-8 w-full max-w-md border border-white/10"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-6 text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white mx-auto mb-4 shadow-lg"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-calendar-check fa-lg"
  })), /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-semibold mb-2"
  }, "Welcome Back"), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-400"
  }, "Secure access to your timetable intelligence.")), error && /*#__PURE__*/React.createElement("div", {
    className: "mb-4 text-rose-300 text-sm bg-rose-950/60 p-3 rounded-xl"
  }, error), /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSubmit,
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("input", {
    type: "email",
    placeholder: "Email",
    value: email,
    onChange: e => setEmail(e.target.value),
    required: true,
    className: "input"
  }), /*#__PURE__*/React.createElement("input", {
    type: "password",
    placeholder: "Password",
    value: password,
    onChange: e => setPassword(e.target.value),
    required: true,
    className: "input"
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "btn btn-primary w-full py-3"
  }, "Login")), /*#__PURE__*/React.createElement("div", {
    className: "mt-6 text-center space-y-2"
  }, /*#__PURE__*/React.createElement(Link, {
    to: "/register",
    className: "text-cyan-300 hover:text-cyan-100 block"
  }, "Create account"), /*#__PURE__*/React.createElement(Link, {
    to: "/forgot-password",
    className: "text-slate-400 hover:text-slate-200 text-sm"
  }, "Forgot password?"))));
}
function RegisterPage() {
  const [form, setForm] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: ''
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const {
    addToast
  } = useToast();
  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Registration failed');
      addToast('Registration successful! You can login now.', 'success');
      navigate('/login');
    } catch (err) {
      setError(err.message);
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-800"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card p-8 w-full max-w-md"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-bold mb-6 text-center"
  }, "Register"), error && /*#__PURE__*/React.createElement("div", {
    className: "mb-4 text-red-500 text-sm bg-red-100 p-2 rounded"
  }, error), /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSubmit,
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("input", {
    placeholder: "First Name",
    value: form.first_name,
    onChange: e => setForm({
      ...form,
      first_name: e.target.value
    }),
    className: "input"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Last Name",
    value: form.last_name,
    onChange: e => setForm({
      ...form,
      last_name: e.target.value
    }),
    className: "input"
  }), /*#__PURE__*/React.createElement("input", {
    type: "email",
    placeholder: "Email",
    required: true,
    value: form.email,
    onChange: e => setForm({
      ...form,
      email: e.target.value
    }),
    className: "input"
  }), /*#__PURE__*/React.createElement("input", {
    type: "password",
    placeholder: "Password",
    required: true,
    value: form.password,
    onChange: e => setForm({
      ...form,
      password: e.target.value
    }),
    className: "input"
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "btn btn-primary w-full py-2"
  }, "Register")), /*#__PURE__*/React.createElement("div", {
    className: "mt-4 text-center"
  }, /*#__PURE__*/React.createElement(Link, {
    to: "/login",
    className: "text-blue-600 hover:underline"
  }, "Already have an account?"))));
}
function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const {
    addToast
  } = useToast();
  const handleSubmit = async e => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Request failed');
      setResetToken(data.reset_token || '');
      setSent(true);
      addToast('Reset token generated successfully.', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen flex items-center justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card p-8 w-full max-w-md"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-3xl font-bold mb-4 section-title"
  }, "Reset Password"), sent ? /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-green-300"
  }, "A reset token has been generated for your account."), resetToken && /*#__PURE__*/React.createElement("div", {
    className: "rounded-2xl bg-slate-950 p-4 text-sm text-slate-200 border border-slate-700"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-semibold mb-2"
  }, "Reset Token"), /*#__PURE__*/React.createElement("pre", {
    className: "whitespace-break-spaces break-all"
  }, resetToken)), /*#__PURE__*/React.createElement("p", {
    className: "text-slate-400"
  }, "Use this token on the reset password page."), /*#__PURE__*/React.createElement(Link, {
    to: "/login",
    className: "btn btn-secondary w-full py-2 text-center"
  }, "Back to Login")) : /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSubmit,
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-slate-300"
  }, "Enter your email to generate a password reset token."), /*#__PURE__*/React.createElement("input", {
    type: "email",
    placeholder: "Email",
    value: email,
    onChange: e => setEmail(e.target.value),
    required: true,
    className: "input"
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "btn btn-primary w-full py-2"
  }, "Generate Reset Token"))));
}
function ResetPasswordPage() {
  const {
    token
  } = useParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const {
    addToast
  } = useToast();
  const handleSubmit = async e => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          password
        })
      });
      if (!res.ok) throw new Error((await res.json()).msg);
      setDone(true);
      addToast('Password reset successful. You can now login.', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-800"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card p-8 w-full max-w-md"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-2xl font-bold mb-4"
  }, "Reset Password"), done ? /*#__PURE__*/React.createElement("p", {
    className: "text-green-600"
  }, "Password reset. ", /*#__PURE__*/React.createElement(Link, {
    to: "/login",
    className: "underline"
  }, "Login")) : /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSubmit,
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("input", {
    type: "password",
    placeholder: "New password",
    value: password,
    onChange: e => setPassword(e.target.value),
    required: true,
    className: "input"
  }), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "btn btn-primary w-full py-2"
  }, "Reset Password"))));
}
function VerifyEmailPage() {
  const {
    token
  } = useParams();
  const [status, setStatus] = useState('verifying');
  useEffect(() => {
    fetch(`${API_BASE}/auth/verify-email/${token}`).then(res => res.ok ? setStatus('success') : setStatus('error')).catch(() => setStatus('error'));
  }, [token]);
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen flex items-center justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card p-8 text-center max-w-sm"
  }, status === 'verifying' && /*#__PURE__*/React.createElement("p", {
    className: "text-slate-300"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Validating token..."), status === 'success' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("p", {
    className: "text-emerald-300 text-xl font-semibold"
  }, "Verification completed."), /*#__PURE__*/React.createElement("p", {
    className: "mt-2 text-slate-400"
  }, "Your account is ready to use."), /*#__PURE__*/React.createElement(Link, {
    to: "/login",
    className: "btn btn-primary mt-4 inline-block"
  }, "Go to Login")), status === 'error' && /*#__PURE__*/React.createElement("p", {
    className: "text-rose-300"
  }, "That link is invalid or expired.")));
}

// ---------- Dashboard Layout ----------
function DashboardLayout({
  children
}) {
  const user = useStore(state => state.user);
  const logout = useStore(state => state.logout);
  const toggleTheme = useStore(state => state.toggleTheme);
  const theme = useStore(state => state.theme);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  const fetchWithAuth = useAuthApi();
  const {
    data: notifications = []
  } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchWithAuth('/notifications').catch(() => []),
    refetchInterval: 30000
  });
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const navItems = useMemo(() => {
    const items = [{
      to: '/dashboard',
      icon: 'fa-tachometer-alt',
      label: 'Dashboard',
      roles: ['super_admin', 'institution_admin', 'hod']
    }, {
      to: '/faculties',
      icon: 'fa-building',
      label: 'Faculties',
      roles: ['super_admin', 'institution_admin']
    }, {
      to: '/departments',
      icon: 'fa-sitemap',
      label: 'Departments',
      roles: ['super_admin', 'institution_admin']
    }, {
      to: '/programmes',
      icon: 'fa-graduation-cap',
      label: 'Programmes',
      roles: ['super_admin', 'institution_admin']
    }, {
      to: '/sessions',
      icon: 'fa-calendar',
      label: 'Sessions',
      roles: ['super_admin', 'institution_admin']
    }, {
      to: '/semesters',
      icon: 'fa-calendar-alt',
      label: 'Semesters',
      roles: ['super_admin', 'institution_admin']
    }, {
      to: '/courses',
      icon: 'fa-book',
      label: 'Courses',
      roles: ['super_admin', 'institution_admin', 'hod']
    }, {
      to: '/lecturers',
      icon: 'fa-chalkboard-teacher',
      label: 'Lecturers',
      roles: ['super_admin', 'institution_admin']
    }, {
      to: '/venues',
      icon: 'fa-door-open',
      label: 'Venues',
      roles: ['super_admin', 'institution_admin']
    }, {
      to: '/timetable/generate',
      icon: 'fa-magic',
      label: 'Generate',
      roles: ['super_admin', 'institution_admin', 'hod']
    }, {
      to: '/timetable/view',
      icon: 'fa-table',
      label: 'Timetable',
      roles: ['super_admin', 'institution_admin', 'hod', 'lecturer', 'student']
    }, {
      to: '/reports',
      icon: 'fa-file-alt',
      label: 'Reports',
      roles: ['super_admin', 'institution_admin']
    }, {
      to: '/notifications',
      icon: 'fa-bell',
      label: 'Notifications',
      roles: ['super_admin', 'institution_admin', 'hod', 'lecturer', 'student']
    }];
    if (user?.role === 'super_admin') {
      items.unshift({
        to: '/admin/users',
        icon: 'fa-users',
        label: 'Users',
        roles: ['super_admin']
      });
      items.unshift({
        to: '/admin/institutions',
        icon: 'fa-university',
        label: 'Institutions',
        roles: ['super_admin']
      });
      items.push({
        to: '/audit-logs',
        icon: 'fa-history',
        label: 'Audit Logs',
        roles: ['super_admin']
      });
    }
    return items.filter(i => i.roles.includes(user?.role));
  }, [user]);
  return /*#__PURE__*/React.createElement("div", {
    className: "flex h-screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: `${sidebarOpen ? 'w-64' : 'w-20'} bg-slate-950/95 text-slate-100 transition-all duration-300 overflow-y-auto sidebar border-r border-white/10`
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-4 flex justify-between items-center"
  }, sidebarOpen && /*#__PURE__*/React.createElement("h2", {
    className: "text-xl font-semibold tracking-tight"
  }, "Timetable"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSidebarOpen(!sidebarOpen),
    className: "text-slate-200 hover:text-white"
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas ${sidebarOpen ? 'fa-times' : 'fa-bars'}`
  }))), /*#__PURE__*/React.createElement("nav", {
    className: "mt-4"
  }, navItems.map(item => /*#__PURE__*/React.createElement(Link, {
    key: item.to,
    to: item.to,
    className: "flex items-center px-4 py-3 hover:bg-gray-700 transition"
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas ${item.icon} w-6`
  }), sidebarOpen && /*#__PURE__*/React.createElement("span", {
    className: "ml-3"
  }, item.label))))), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 flex flex-col overflow-hidden"
  }, /*#__PURE__*/React.createElement("header", {
    className: "bg-slate-950/80 backdrop-blur-xl shadow-[0_25px_50px_-25px_rgba(15,23,42,0.7)] p-4 flex justify-between items-center border-b border-white/10"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setSidebarOpen(!sidebarOpen),
    className: "text-xl lg:hidden text-slate-200 hover:text-white"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-bars"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center space-x-4 ml-auto"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: toggleTheme,
    className: "p-2 rounded-full bg-slate-900/70 border border-white/10 hover:bg-slate-800"
  }, /*#__PURE__*/React.createElement("i", {
    className: `fas ${theme === 'dark' ? 'fa-sun' : 'fa-moon'} text-slate-200`
  })), /*#__PURE__*/React.createElement("div", {
    className: "relative"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setNotifOpen(!notifOpen),
    className: "p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-bell"
  }), unreadCount > 0 && /*#__PURE__*/React.createElement("span", {
    className: "absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center"
  }, unreadCount)), notifOpen && /*#__PURE__*/React.createElement("div", {
    className: "absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded shadow-lg z-10 border dark:border-gray-700 max-h-96 overflow-y-auto"
  }, /*#__PURE__*/React.createElement("div", {
    className: "p-2 font-bold border-b"
  }, "Notifications"), notifications.length === 0 ? /*#__PURE__*/React.createElement("p", {
    className: "p-4 text-gray-500"
  }, "No notifications") : notifications.slice(0, 5).map(n => /*#__PURE__*/React.createElement("div", {
    key: n.id,
    className: "p-3 border-b last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
  }, n.message)), /*#__PURE__*/React.createElement(Link, {
    to: "/notifications",
    className: "block p-2 text-blue-600 text-center hover:underline"
  }, "View all"))), /*#__PURE__*/React.createElement("span", {
    className: "hidden sm:inline"
  }, user?.first_name, " (", user?.role, ")"), /*#__PURE__*/React.createElement("button", {
    onClick: logout,
    className: "btn btn-secondary text-sm py-1 px-3"
  }, "Logout"))), /*#__PURE__*/React.createElement("main", {
    className: "flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900"
  }, children)));
}

// ---------- Reusable DataTable (with React Query integration optionally) ----------
function DataTable({
  columns,
  data,
  onEdit,
  onDelete,
  loading
}) {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;
  const filtered = data.filter(row => columns.some(col => String(row[col.accessor] || '').toLowerCase().includes(search.toLowerCase())));
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("input", {
    type: "text",
    placeholder: "Search...",
    value: search,
    onChange: e => {
      setSearch(e.target.value);
      setCurrentPage(1);
    },
    className: "input mb-4 max-w-sm"
  }), loading ? /*#__PURE__*/React.createElement("p", {
    className: "text-center py-4"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Loading...") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "overflow-x-auto"
  }, /*#__PURE__*/React.createElement("table", {
    className: "min-w-full card border"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "bg-gray-200 dark:bg-gray-700"
  }, columns.map(col => /*#__PURE__*/React.createElement("th", {
    key: col.accessor,
    className: "px-4 py-2 text-left"
  }, col.header)), (onEdit || onDelete) && /*#__PURE__*/React.createElement("th", {
    className: "px-4 py-2 w-24"
  }, "Actions"))), /*#__PURE__*/React.createElement("tbody", null, paginated.map((row, idx) => /*#__PURE__*/React.createElement("tr", {
    key: row.id || idx,
    className: "border-t hover:bg-gray-50 dark:hover:bg-gray-700"
  }, columns.map(col => /*#__PURE__*/React.createElement("td", {
    key: col.accessor,
    className: "px-4 py-2"
  }, row[col.accessor] ?? '')), (onEdit || onDelete) && /*#__PURE__*/React.createElement("td", {
    className: "px-4 py-2 space-x-2"
  }, onEdit && /*#__PURE__*/React.createElement("button", {
    onClick: () => onEdit(row),
    className: "text-blue-600 hover:underline"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-edit"
  })), onDelete && /*#__PURE__*/React.createElement("button", {
    onClick: () => onDelete(row.id),
    className: "text-red-600 hover:underline"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-trash"
  }))))), paginated.length === 0 && /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: columns.length + 1,
    className: "text-center py-4"
  }, "No data"))))), totalPages > 1 && /*#__PURE__*/React.createElement("div", {
    className: "flex justify-center mt-4 space-x-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setCurrentPage(p => Math.max(1, p - 1)),
    disabled: currentPage === 1,
    className: "btn btn-secondary text-xs"
  }, "Prev"), /*#__PURE__*/React.createElement("span", {
    className: "px-3 py-1"
  }, currentPage, " / ", totalPages), /*#__PURE__*/React.createElement("button", {
    onClick: () => setCurrentPage(p => Math.min(totalPages, p + 1)),
    disabled: currentPage === totalPages,
    className: "btn btn-secondary text-xs"
  }, "Next"))));
}

// ---------- Generic CRUD Page (using React Query) ----------
function EntityPage({
  entityName,
  apiPath,
  columns,
  formFields
}) {
  const fetchWithAuth = useAuthApi();
  const {
    addToast
  } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const {
    data = [],
    isLoading
  } = useQuery({
    queryKey: [apiPath],
    queryFn: () => fetchWithAuth(apiPath)
  });
  const deleteMutation = useMutation({
    mutationFn: id => fetchWithAuth(`${apiPath}/${id}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      addToast('Deleted', 'success');
      queryClient.invalidateQueries(apiPath);
    }
  });
  const saveMutation = useMutation({
    mutationFn: payload => editItem ? fetchWithAuth(`${apiPath}/${editItem.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }) : fetchWithAuth(apiPath, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
    onSuccess: () => {
      addToast(editItem ? 'Updated' : 'Created', 'success');
      setShowForm(false);
      setEditItem(null);
      queryClient.invalidateQueries(apiPath);
    },
    onError: err => addToast(err.message, 'error')
  });
  const handleSubmit = e => {
    e.preventDefault();
    const form = new FormData(e.target);
    const payload = Object.fromEntries(form.entries());
    formFields.forEach(f => {
      if (f.type === 'number' && payload[f.name]) payload[f.name] = Number(payload[f.name]);
    });
    saveMutation.mutate(payload);
  };
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center mb-4"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "text-2xl font-bold"
  }, entityName), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setShowForm(true);
      setEditItem(null);
    },
    className: "btn btn-primary"
  }, "Add ", entityName)), showForm && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card p-6 w-full max-w-lg max-h-screen overflow-y-auto"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "text-xl mb-4"
  }, editItem ? 'Edit' : 'Create', " ", entityName), /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSubmit,
    className: "space-y-4"
  }, formFields.map(field => /*#__PURE__*/React.createElement("div", {
    key: field.name
  }, /*#__PURE__*/React.createElement("label", {
    className: "block text-sm mb-1"
  }, field.label), field.type === 'select' ? /*#__PURE__*/React.createElement("select", {
    name: field.name,
    defaultValue: editItem?.[field.name] || '',
    className: "input"
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Select..."), field.options?.map(opt => /*#__PURE__*/React.createElement("option", {
    key: opt.value,
    value: opt.value
  }, opt.label))) : /*#__PURE__*/React.createElement("input", {
    type: field.type || 'text',
    name: field.name,
    defaultValue: editItem?.[field.name] || '',
    required: field.required !== false,
    className: "input",
    step: field.type === 'number' ? 'any' : undefined
  }))), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-end space-x-2"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => setShowForm(false),
    className: "btn btn-secondary"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    type: "submit",
    className: "btn btn-primary",
    disabled: saveMutation.isLoading
  }, "Save"))))), /*#__PURE__*/React.createElement(DataTable, {
    columns: columns,
    data: data,
    onEdit: item => {
      setEditItem(item);
      setShowForm(true);
    },
    onDelete: deleteMutation.mutate,
    loading: isLoading
  }));
}

// ---------- Timetable Generator Page ----------
function TimetableGeneratorPage() {
  const fetchWithAuth = useAuthApi();
  const {
    addToast
  } = useToast();
  const [selectedSession, setSelectedSession] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [result, setResult] = useState(null);
  const {
    data: sessions = []
  } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetchWithAuth('/institution/sessions')
  });
  const {
    data: semesters = []
  } = useQuery({
    queryKey: ['semesters'],
    queryFn: () => fetchWithAuth('/institution/semesters')
  });
  const filteredSemesters = semesters.filter(s => s.session_id == selectedSession);
  const generateMutation = useMutation({
    mutationFn: () => fetchWithAuth('/timetable/generate', {
      method: 'POST',
      body: JSON.stringify({
        session_id: Number(selectedSession),
        semester_id: Number(selectedSemester)
      })
    }),
    onSuccess: data => {
      setResult(data);
      addToast(`Generated with quality ${data.quality_score}`, 'success');
    },
    onError: err => addToast(err.message, 'error')
  });
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-2xl font-bold mb-4"
  }, "Generate Timetable"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 gap-4 mb-4"
  }, /*#__PURE__*/React.createElement("select", {
    value: selectedSession,
    onChange: e => setSelectedSession(e.target.value),
    className: "input"
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Select Session"), sessions.map(s => /*#__PURE__*/React.createElement("option", {
    key: s.id,
    value: s.id
  }, s.name))), /*#__PURE__*/React.createElement("select", {
    value: selectedSemester,
    onChange: e => setSelectedSemester(e.target.value),
    className: "input"
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Select Semester"), filteredSemesters.map(s => /*#__PURE__*/React.createElement("option", {
    key: s.id,
    value: s.id
  }, s.name)))), /*#__PURE__*/React.createElement("button", {
    onClick: generateMutation.mutate,
    disabled: !selectedSession || !selectedSemester || generateMutation.isLoading,
    className: "btn btn-primary px-6 py-2"
  }, generateMutation.isLoading ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Generating...") : 'Generate Timetable'), result && /*#__PURE__*/React.createElement("div", {
    className: "mt-4 card p-4"
  }, /*#__PURE__*/React.createElement("p", null, "Generation ID: ", result.generation_id), /*#__PURE__*/React.createElement("p", null, "Quality Score: ", result.quality_score), /*#__PURE__*/React.createElement("p", null, "Status: ", result.status)));
}

// ---------- Timetable View & Editor ----------
function TimetableViewPage() {
  const fetchWithAuth = useAuthApi();
  const {
    addToast
  } = useToast();
  const user = useStore(state => state.user);
  const [selectedGen, setSelectedGen] = useState('');
  const queryClient = useQueryClient();
  const {
    data: generations = []
  } = useQuery({
    queryKey: ['generations'],
    queryFn: () => fetchWithAuth('/timetable/generations')
  });
  const {
    data: slots = [],
    isLoading: slotsLoading,
    refetch: refetchSlots
  } = useQuery({
    queryKey: ['timetable-slots', selectedGen],
    queryFn: () => fetchWithAuth(`/timetable/slots?generation_id=${selectedGen}`),
    enabled: !!selectedGen
  });
  const updateSlotMutation = useMutation({
    mutationFn: ({
      id,
      payload
    }) => fetchWithAuth(`/timetable/slots/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
    onSuccess: () => {
      addToast('Slot updated', 'success');
      refetchSlots();
    }
  });
  const approveMutation = useMutation({
    mutationFn: genId => fetchWithAuth(`/timetable/approve/${genId}`, {
      method: 'PUT'
    }),
    onSuccess: () => {
      addToast('Timetable approved', 'success');
      queryClient.invalidateQueries('generations');
    }
  });
  const handleDragStart = (e, slotId) => e.dataTransfer.setData('text/plain', slotId);
  const handleDrop = (e, targetDay, targetPeriod) => {
    e.preventDefault();
    const slotId = e.dataTransfer.getData('text/plain');
    if (slotId) updateSlotMutation.mutate({
      id: slotId,
      payload: {
        day: targetDay,
        period: targetPeriod
      }
    });
  };
  const exportPDF = () => window.open(`${API_BASE}/timetable/export/pdf/${selectedGen}`);
  const exportExcel = () => window.open(`${API_BASE}/timetable/export/excel/${selectedGen}`);
  const exportCSV = () => window.open(`${API_BASE}/timetable/export/csv/${selectedGen}`);
  const exportImage = () => window.open(`${API_BASE}/timetable/export/image/${selectedGen}`);
  const days = DAYS;
  const periods = [...new Set(slots.map(s => s.period))].sort((a, b) => a - b);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-2xl font-bold mb-4"
  }, "View & Edit Timetable"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-4 items-center mb-4"
  }, /*#__PURE__*/React.createElement("select", {
    value: selectedGen,
    onChange: e => setSelectedGen(e.target.value),
    className: "input max-w-xs"
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Select Generation"), generations.map(g => /*#__PURE__*/React.createElement("option", {
    key: g.id,
    value: g.id
  }, "Gen ", g.id, " - ", g.status, " (", g.quality_score, ")"))), selectedGen && /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: exportPDF,
    className: "btn btn-secondary text-sm"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-file-pdf"
  }), " PDF"), /*#__PURE__*/React.createElement("button", {
    onClick: exportExcel,
    className: "btn btn-secondary text-sm"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-file-excel"
  }), " Excel"), /*#__PURE__*/React.createElement("button", {
    onClick: exportCSV,
    className: "btn btn-secondary text-sm"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-file-csv"
  }), " CSV"), /*#__PURE__*/React.createElement("button", {
    onClick: exportImage,
    className: "btn btn-secondary text-sm"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-image"
  }), " Image"), (user?.role === 'institution_admin' || user?.role === 'hod') && generations.find(g => g.id == selectedGen)?.status === 'draft' && /*#__PURE__*/React.createElement("button", {
    onClick: () => approveMutation.mutate(Number(selectedGen)),
    className: "btn btn-primary text-sm"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-check"
  }), " Approve"))), slotsLoading ? /*#__PURE__*/React.createElement("p", {
    className: "text-center py-8"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Loading timetable...") : slots.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "overflow-x-auto"
  }, /*#__PURE__*/React.createElement("table", {
    className: "min-w-full border bg-white dark:bg-gray-800"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "bg-gray-200 dark:bg-gray-700"
  }, /*#__PURE__*/React.createElement("th", {
    className: "p-2"
  }, "Period"), days.map(day => /*#__PURE__*/React.createElement("th", {
    key: day,
    className: "p-2"
  }, day)))), /*#__PURE__*/React.createElement("tbody", null, periods.map(period => /*#__PURE__*/React.createElement("tr", {
    key: period
  }, /*#__PURE__*/React.createElement("td", {
    className: "p-2 border font-medium"
  }, period), days.map(day => {
    const slot = slots.find(s => s.day === day && s.period === period);
    return /*#__PURE__*/React.createElement("td", {
      key: day,
      className: "p-2 border min-w-[120px] h-16 relative",
      onDragOver: e => e.preventDefault(),
      onDrop: e => handleDrop(e, day, period)
    }, slot && /*#__PURE__*/React.createElement("div", {
      draggable: true,
      onDragStart: e => handleDragStart(e, slot.id),
      className: "bg-blue-100 dark:bg-blue-900 p-1 rounded cursor-move text-sm",
      style: {
        backgroundColor: `hsl(${slot.course?.code?.charCodeAt(0) * 30 || 0}, 70%, 80%)`
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "font-bold"
    }, slot.course?.code), /*#__PURE__*/React.createElement("div", {
      className: "text-xs"
    }, slot.venue?.code), /*#__PURE__*/React.createElement("div", {
      className: "text-xs"
    }, slot.lecturer?.name)));
  })))))));
}

// ---------- Analytics Dashboard (with fallback data) ----------
function AnalyticsDashboard() {
  const fetchWithAuth = useAuthApi();
  const {
    data,
    isLoading
  } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: () => fetchWithAuth('/analytics/summary').catch(() => ({
      venueUtilization: [{
        name: 'A',
        utilization: 70
      }, {
        name: 'B',
        utilization: 45
      }, {
        name: 'C',
        utilization: 90
      }],
      lecturerWorkload: [{
        name: 'Dr. Smith',
        hours: 18
      }, {
        name: 'Dr. Jones',
        hours: 12
      }, {
        name: 'Prof. Lee',
        hours: 22
      }],
      qualityTrend: [{
        date: 'Jan',
        score: 85
      }, {
        date: 'Feb',
        score: 92
      }, {
        date: 'Mar',
        score: 88
      }]
    }))
  });
  if (isLoading) return /*#__PURE__*/React.createElement("div", {
    className: "text-center py-8"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fas fa-spinner fa-spin"
  }), " Loading analytics...");
  const stats = data || {};
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-2xl font-bold mb-4"
  }, "Analytics Dashboard"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "card p-4"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold mb-2"
  }, "Venue Utilization"), /*#__PURE__*/React.createElement(ResponsiveContainer, {
    width: "100%",
    height: 200
  }, /*#__PURE__*/React.createElement(BarChart, {
    data: stats.venueUtilization
  }, /*#__PURE__*/React.createElement(CartesianGrid, {
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement(XAxis, {
    dataKey: "name"
  }), /*#__PURE__*/React.createElement(YAxis, null), /*#__PURE__*/React.createElement(Tooltip, null), /*#__PURE__*/React.createElement(Bar, {
    dataKey: "utilization",
    fill: "#8884d8"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "card p-4"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold mb-2"
  }, "Lecturer Workload"), /*#__PURE__*/React.createElement(ResponsiveContainer, {
    width: "100%",
    height: 200
  }, /*#__PURE__*/React.createElement(PieChart, null, /*#__PURE__*/React.createElement(Pie, {
    data: stats.lecturerWorkload,
    dataKey: "hours",
    nameKey: "name",
    cx: "50%",
    cy: "50%",
    outerRadius: 80,
    label: true
  }, stats.lecturerWorkload.map((_, idx) => /*#__PURE__*/React.createElement(Cell, {
    key: idx,
    fill: COLORS[idx % COLORS.length]
  }))), /*#__PURE__*/React.createElement(Tooltip, null)))), /*#__PURE__*/React.createElement("div", {
    className: "card p-4"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "font-bold mb-2"
  }, "Quality Trend"), /*#__PURE__*/React.createElement(ResponsiveContainer, {
    width: "100%",
    height: 200
  }, /*#__PURE__*/React.createElement(LineChart, {
    data: stats.qualityTrend
  }, /*#__PURE__*/React.createElement(CartesianGrid, {
    strokeDasharray: "3 3"
  }), /*#__PURE__*/React.createElement(XAxis, {
    dataKey: "date"
  }), /*#__PURE__*/React.createElement(YAxis, {
    domain: [0, 100]
  }), /*#__PURE__*/React.createElement(Tooltip, null), /*#__PURE__*/React.createElement(Line, {
    type: "monotone",
    dataKey: "score",
    stroke: "#82ca9d"
  }))))));
}

// ---------- Notifications Page ----------
function NotificationsPage() {
  const fetchWithAuth = useAuthApi();
  const {
    data: notifications = [],
    isLoading
  } = useQuery({
    queryKey: ['notifications-all'],
    queryFn: () => fetchWithAuth('/notifications').catch(() => [])
  });
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-2xl font-bold mb-4"
  }, "Notifications"), isLoading ? /*#__PURE__*/React.createElement("p", null, "Loading...") : notifications.length === 0 ? /*#__PURE__*/React.createElement("p", null, "No notifications.") : /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, notifications.map(n => /*#__PURE__*/React.createElement("div", {
    key: n.id,
    className: `card p-3 ${n.is_read ? 'opacity-60' : ''}`
  }, /*#__PURE__*/React.createElement("p", null, n.message), /*#__PURE__*/React.createElement("span", {
    className: "text-xs text-gray-500"
  }, new Date(n.created_at).toLocaleString())))));
}

// ---------- Audit Logs Page (Super Admin) ----------
function AuditLogsPage() {
  const fetchWithAuth = useAuthApi();
  const {
    data = [],
    isLoading
  } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => fetchWithAuth('/audit-logs').catch(() => [])
  });
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-2xl font-bold mb-4"
  }, "Audit Logs"), /*#__PURE__*/React.createElement(DataTable, {
    columns: [{
      header: 'ID',
      accessor: 'id'
    }, {
      header: 'User',
      accessor: 'user'
    }, {
      header: 'Action',
      accessor: 'action'
    }, {
      header: 'Details',
      accessor: 'details'
    }, {
      header: 'Time',
      accessor: 'timestamp'
    }],
    data: data,
    loading: isLoading
  }));
}

// ---------- Reports Page ----------
function ReportsPage() {
  const fetchWithAuth = useAuthApi();
  const [reportType, setReportType] = useState('lecturer_workload');
  const {
    data,
    isLoading,
    refetch
  } = useQuery({
    queryKey: ['report', reportType],
    queryFn: () => fetchWithAuth(`/reports/${reportType}`).catch(() => []),
    enabled: false
  });
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", {
    className: "text-2xl font-bold mb-4"
  }, "Reports"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-4 mb-4"
  }, /*#__PURE__*/React.createElement("select", {
    value: reportType,
    onChange: e => setReportType(e.target.value),
    className: "input max-w-xs"
  }, /*#__PURE__*/React.createElement("option", {
    value: "lecturer_workload"
  }, "Lecturer Workload"), /*#__PURE__*/React.createElement("option", {
    value: "venue_utilization"
  }, "Venue Utilization"), /*#__PURE__*/React.createElement("option", {
    value: "course_allocation"
  }, "Course Allocation"), /*#__PURE__*/React.createElement("option", {
    value: "conflict"
  }, "Conflict Report")), /*#__PURE__*/React.createElement("button", {
    onClick: () => refetch(),
    className: "btn btn-primary"
  }, "Generate")), isLoading && /*#__PURE__*/React.createElement("p", null, "Loading..."), data && Array.isArray(data) && /*#__PURE__*/React.createElement(DataTable, {
    columns: Object.keys(data[0] || {}).map(k => ({
      header: k,
      accessor: k
    })),
    data: data
  }));
}

// ---------- App Component ----------
function App() {
  const initTheme = useStore(state => state.initTheme);
  useEffect(() => {
    initTheme();
  }, []);
  return /*#__PURE__*/React.createElement(Routes, null, /*#__PURE__*/React.createElement(Route, {
    path: "/login",
    element: /*#__PURE__*/React.createElement(LoginPage, null)
  }), /*#__PURE__*/React.createElement(Route, {
    path: "/register",
    element: /*#__PURE__*/React.createElement(RegisterPage, null)
  }), /*#__PURE__*/React.createElement(Route, {
    path: "/forgot-password",
    element: /*#__PURE__*/React.createElement(ForgotPasswordPage, null)
  }), /*#__PURE__*/React.createElement(Route, {
    path: "/reset-password/:token",
    element: /*#__PURE__*/React.createElement(ResetPasswordPage, null)
  }), /*#__PURE__*/React.createElement(Route, {
    path: "/verify-email/:token",
    element: /*#__PURE__*/React.createElement(VerifyEmailPage, null)
  }), /*#__PURE__*/React.createElement(Route, {
    path: "/*",
    element: /*#__PURE__*/React.createElement(ProtectedRoute, null, /*#__PURE__*/React.createElement(DashboardLayout, null, /*#__PURE__*/React.createElement(Routes, null, /*#__PURE__*/React.createElement(Route, {
      path: "/dashboard",
      element: /*#__PURE__*/React.createElement(AnalyticsDashboard, null)
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/admin/users",
      element: /*#__PURE__*/React.createElement(EntityPage, {
        entityName: "User",
        apiPath: "/admin/users",
        columns: [{
          header: 'ID',
          accessor: 'id'
        }, {
          header: 'Email',
          accessor: 'email'
        }, {
          header: 'Name',
          accessor: 'first_name'
        }, {
          header: 'Role',
          accessor: 'role'
        }],
        formFields: [{
          name: 'email',
          label: 'Email',
          type: 'email'
        }, {
          name: 'password',
          label: 'Password',
          type: 'password',
          required: false
        }, {
          name: 'first_name',
          label: 'First Name'
        }, {
          name: 'last_name',
          label: 'Last Name'
        }, {
          name: 'role',
          label: 'Role',
          type: 'select',
          options: [{
            value: 'super_admin',
            label: 'Super Admin'
          }, {
            value: 'institution_admin',
            label: 'Institution Admin'
          }, {
            value: 'hod',
            label: 'HOD'
          }, {
            value: 'lecturer',
            label: 'Lecturer'
          }, {
            value: 'student',
            label: 'Student'
          }]
        }]
      })
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/admin/institutions",
      element: /*#__PURE__*/React.createElement(EntityPage, {
        entityName: "Institution",
        apiPath: "/admin/institutions",
        columns: [{
          header: 'ID',
          accessor: 'id'
        }, {
          header: 'Name',
          accessor: 'name'
        }, {
          header: 'Code',
          accessor: 'code'
        }],
        formFields: [{
          name: 'name',
          label: 'Name'
        }, {
          name: 'code',
          label: 'Code'
        }, {
          name: 'type',
          label: 'Type'
        }, {
          name: 'address',
          label: 'Address'
        }, {
          name: 'logo_url',
          label: 'Logo URL'
        }]
      })
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/faculties",
      element: /*#__PURE__*/React.createElement(EntityPage, {
        entityName: "Faculty",
        apiPath: "/institution/faculties",
        columns: [{
          header: 'ID',
          accessor: 'id'
        }, {
          header: 'Name',
          accessor: 'name'
        }, {
          header: 'Code',
          accessor: 'code'
        }],
        formFields: [{
          name: 'name',
          label: 'Name'
        }, {
          name: 'code',
          label: 'Code'
        }, {
          name: 'institution_id',
          label: 'Institution ID',
          type: 'number'
        }]
      })
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/departments",
      element: /*#__PURE__*/React.createElement(EntityPage, {
        entityName: "Department",
        apiPath: "/institution/departments",
        columns: [{
          header: 'ID',
          accessor: 'id'
        }, {
          header: 'Name',
          accessor: 'name'
        }, {
          header: 'Code',
          accessor: 'code'
        }],
        formFields: [{
          name: 'name',
          label: 'Name'
        }, {
          name: 'code',
          label: 'Code'
        }, {
          name: 'faculty_id',
          label: 'Faculty ID',
          type: 'number'
        }, {
          name: 'institution_id',
          label: 'Institution ID',
          type: 'number'
        }]
      })
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/programmes",
      element: /*#__PURE__*/React.createElement(EntityPage, {
        entityName: "Programme",
        apiPath: "/institution/programmes",
        columns: [{
          header: 'ID',
          accessor: 'id'
        }, {
          header: 'Name',
          accessor: 'name'
        }, {
          header: 'Code',
          accessor: 'code'
        }],
        formFields: [{
          name: 'name',
          label: 'Name'
        }, {
          name: 'code',
          label: 'Code'
        }, {
          name: 'department_id',
          label: 'Department ID',
          type: 'number'
        }, {
          name: 'duration_years',
          label: 'Duration',
          type: 'number'
        }]
      })
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/sessions",
      element: /*#__PURE__*/React.createElement(EntityPage, {
        entityName: "Session",
        apiPath: "/institution/sessions",
        columns: [{
          header: 'ID',
          accessor: 'id'
        }, {
          header: 'Name',
          accessor: 'name'
        }, {
          header: 'Current',
          accessor: 'is_current'
        }],
        formFields: [{
          name: 'name',
          label: 'Name'
        }, {
          name: 'start_date',
          label: 'Start Date',
          type: 'date'
        }, {
          name: 'end_date',
          label: 'End Date',
          type: 'date'
        }, {
          name: 'institution_id',
          label: 'Institution ID',
          type: 'number'
        }, {
          name: 'is_current',
          label: 'Is Current?',
          type: 'checkbox'
        }]
      })
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/semesters",
      element: /*#__PURE__*/React.createElement(EntityPage, {
        entityName: "Semester",
        apiPath: "/institution/semesters",
        columns: [{
          header: 'ID',
          accessor: 'id'
        }, {
          header: 'Name',
          accessor: 'name'
        }, {
          header: 'Session ID',
          accessor: 'session_id'
        }],
        formFields: [{
          name: 'name',
          label: 'Name'
        }, {
          name: 'session_id',
          label: 'Session ID',
          type: 'number'
        }, {
          name: 'start_date',
          label: 'Start Date',
          type: 'date'
        }, {
          name: 'end_date',
          label: 'End Date',
          type: 'date'
        }]
      })
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/courses",
      element: /*#__PURE__*/React.createElement(EntityPage, {
        entityName: "Course",
        apiPath: "/institution/courses",
        columns: [{
          header: 'ID',
          accessor: 'id'
        }, {
          header: 'Code',
          accessor: 'code'
        }, {
          header: 'Title',
          accessor: 'title'
        }],
        formFields: [{
          name: 'code',
          label: 'Code'
        }, {
          name: 'title',
          label: 'Title'
        }, {
          name: 'credit_units',
          label: 'Credit Units',
          type: 'number'
        }, {
          name: 'level',
          label: 'Level',
          type: 'number'
        }, {
          name: 'department_id',
          label: 'Dept ID',
          type: 'number'
        }, {
          name: 'programme_id',
          label: 'Programme ID',
          type: 'number'
        }, {
          name: 'semester_id',
          label: 'Semester ID',
          type: 'number'
        }, {
          name: 'lecturer_id',
          label: 'Lecturer ID',
          type: 'number'
        }, {
          name: 'students_count',
          label: 'Students',
          type: 'number'
        }]
      })
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/lecturers",
      element: /*#__PURE__*/React.createElement(EntityPage, {
        entityName: "Lecturer",
        apiPath: "/institution/lecturers",
        columns: [{
          header: 'ID',
          accessor: 'id'
        }, {
          header: 'Staff ID',
          accessor: 'staff_id'
        }, {
          header: 'User ID',
          accessor: 'user_id'
        }],
        formFields: [{
          name: 'staff_id',
          label: 'Staff ID'
        }, {
          name: 'user_id',
          label: 'User ID',
          type: 'number'
        }, {
          name: 'department_id',
          label: 'Dept ID',
          type: 'number'
        }, {
          name: 'rank',
          label: 'Rank'
        }, {
          name: 'max_daily_hours',
          label: 'Max Daily Hours',
          type: 'number'
        }, {
          name: 'max_weekly_hours',
          label: 'Max Weekly Hours',
          type: 'number'
        }, {
          name: 'availability',
          label: 'Availability (JSON)',
          type: 'text'
        }]
      })
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/venues",
      element: /*#__PURE__*/React.createElement(EntityPage, {
        entityName: "Venue",
        apiPath: "/institution/venues",
        columns: [{
          header: 'ID',
          accessor: 'id'
        }, {
          header: 'Code',
          accessor: 'code'
        }, {
          header: 'Capacity',
          accessor: 'capacity'
        }],
        formFields: [{
          name: 'code',
          label: 'Code'
        }, {
          name: 'name',
          label: 'Name'
        }, {
          name: 'capacity',
          label: 'Capacity',
          type: 'number'
        }, {
          name: 'building',
          label: 'Building'
        }, {
          name: 'resources',
          label: 'Resources'
        }, {
          name: 'institution_id',
          label: 'Institution ID',
          type: 'number'
        }]
      })
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/timetable/generate",
      element: /*#__PURE__*/React.createElement(TimetableGeneratorPage, null)
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/timetable/view",
      element: /*#__PURE__*/React.createElement(TimetableViewPage, null)
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/notifications",
      element: /*#__PURE__*/React.createElement(NotificationsPage, null)
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/audit-logs",
      element: /*#__PURE__*/React.createElement(AuditLogsPage, null)
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/reports",
      element: /*#__PURE__*/React.createElement(ReportsPage, null)
    }), /*#__PURE__*/React.createElement(Route, {
      path: "/",
      element: /*#__PURE__*/React.createElement(Navigate, {
        to: "/dashboard",
        replace: true
      })
    }))))
  }));
}

// ---------- Render ----------
try {
  const root = createRoot(document.getElementById('root'));
  root.render(/*#__PURE__*/React.createElement(Router, null, /*#__PURE__*/React.createElement(QueryClientProvider, {
    client: queryClient
  }, /*#__PURE__*/React.createElement(ToastProvider, null, /*#__PURE__*/React.createElement(App, null)))));
} catch (err) {
  console.error('Render error:', err);
  document.getElementById('root').innerHTML = `<div style="padding:20px; color:#ff6b6b; font-family:monospace;"><h3>Error loading app</h3><p>${err.message}</p></div>`;
}