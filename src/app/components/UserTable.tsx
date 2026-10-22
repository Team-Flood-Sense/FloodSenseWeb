import { motion, AnimatePresence } from 'motion/react';
import { Edit2, Trash2, Search, UserPlus, X, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useEscape } from '@/app/hooks/useEscape';

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'Admin' | 'Operator' | 'Viewer';
  status: 'Active' | 'Inactive';
  avatar: string;
  lastActive: string;
  location: string;
}

const capitalizeRole = (role: string | null): User['role'] => {
  switch ((role || '').toLowerCase()) {
    case 'admin': return 'Admin';
    case 'operator': return 'Operator';
    default: return 'Viewer';
  }
};

// Calls the admin-users Edge Function and surfaces its error message.
async function invokeAdminUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let message = 'Something went wrong. Please try again.';
    if (error instanceof FunctionsHttpError) {
      try {
        message = error.context.status === 404
          ? 'The admin-users function is not deployed in this Supabase project.'
          : (await error.context.json()).error || message;
      } catch { /* non-JSON response */ }
    }
    throw new Error(message);
  }
  return data;
}

export function UserTable() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '', email: '', phone: '', role: 'Viewer', location: '', password: '',
  });
  const [addLoading, setAddLoading] = useState(false);

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Escape closes whichever modal is open
  const closeModals = useCallback(() => {
    setShowAddModal(false);
    setShowEditModal(false);
    setShowDeleteModal(false);
  }, []);
  useEscape(showAddModal || showEditModal || showDeleteModal, closeModals);

  // ✅ Fetch users from the profiles table
  const fetchUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      setLoadError('Failed to load users. Please refresh the page.');
      setLoading(false);
      return;
    }
    setLoadError('');

    const fetchedUsers: User[] = (data ?? []).map((row) => {
      // ✅ Convert timestamptz to readable string
      let lastActive = 'Never';
      if (row.last_active) {
        lastActive = new Date(row.last_active).toLocaleString('en-PH', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      }

      return {
        id: row.id,
        name: row.name || row.email?.split('@')[0] || 'Unknown',
        email: row.email || '',
        phone: row.phone || 'N/A',
        role: capitalizeRole(row.role),
        status: row.status || 'Active',
        avatar: row.avatar || '',
        lastActive,
        location: row.location || 'N/A',
      };
    });
    setUsers(fetchedUsers);
    setLoading(false);
  }, []);

  // ✅ Keep the table live with Supabase Realtime
  useEffect(() => {
    fetchUsers();

    const channel = supabase
      .channel('profiles-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUsers]);

  // ✅ Add User — the admin-users Edge Function creates the Auth account + profile
  // (runs server-side, so the admin stays signed in)
  async function handleAddUser() {
    setActionError('');
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password) {
      setActionError('Name, email, and password are required.');
      return;
    }
    if (newUser.password.length < 6) {
      setActionError('Password must be at least 6 characters.');
      return;
    }

    setAddLoading(true);
    try {
      await invokeAdminUsers({
        action: 'create',
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        password: newUser.password,
        phone: newUser.phone,
        location: newUser.location,
        role: newUser.role.toLowerCase(),
      });

      setShowAddModal(false);
      setNewUser({ name: '', email: '', phone: '', role: 'Viewer', location: '', password: '' });
      fetchUsers();
    } catch (err: any) {
      setActionError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setAddLoading(false);
    }
  }

  // ✅ Edit User — updates the profiles row; status changes go through the
  // admin-users function so deactivated users are also signed out (banned).
  async function handleEditUser() {
    if (!editingUser) return;
    setActionError('');
    if (!editingUser.name.trim()) {
      setActionError('Name cannot be empty.');
      return;
    }
    setEditLoading(true);

    try {
      const original = users.find((u) => u.id === editingUser.id);

      const { error } = await supabase
        .from('profiles')
        .update({
          name: editingUser.name.trim(),
          phone: editingUser.phone === 'N/A' ? '' : editingUser.phone.trim(),
          role: editingUser.role.toLowerCase(),
          location: editingUser.location === 'N/A' ? '' : editingUser.location.trim(),
        })
        .eq('id', editingUser.id);
      if (error) throw error;

      if (original && original.status !== editingUser.status) {
        await invokeAdminUsers({ action: 'set-status', id: editingUser.id, status: editingUser.status });
      }

      setShowEditModal(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      setActionError(
        err?.message?.includes('last active admin')
          ? 'There must always be at least one active admin.'
          : err?.message || 'Failed to update user. Please try again.',
      );
    } finally {
      setEditLoading(false);
    }
  }

  // ✅ Delete User — removes the Auth account (profile row cascades)
  async function handleDeleteUser() {
    if (!deletingUser) return;
    setActionError('');
    setDeleteLoading(true);

    try {
      await invokeAdminUsers({ action: 'delete', id: deletingUser.id });
      setShowDeleteModal(false);
      setDeletingUser(null);
      fetchUsers();
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete user. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  }

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRoleBadgeStyle = (role: string) => {
    if (role === 'Admin' || role === 'admin') {
      return {
        background: 'linear-gradient(135deg, rgba(46, 196, 182, 0.15) 0%, rgba(46, 196, 182, 0.08) 100%)',
        border: '1px solid rgba(46, 196, 182, 0.3)',
        color: '#2EC4B6',
      };
    } else if (role === 'Operator' || role === 'operator') {
      return {
        background: 'linear-gradient(135deg, rgba(29, 112, 162, 0.15) 0%, rgba(29, 112, 162, 0.08) 100%)',
        border: '1px solid rgba(29, 112, 162, 0.3)',
        color: 'var(--link)',
      };
    } else {
      return {
        background: 'linear-gradient(135deg, rgba(var(--ink-rgb), 0.15) 0%, rgba(var(--ink-rgb), 0.08) 100%)',
        border: '1px solid rgba(var(--ink-rgb), 0.3)',
        color: 'rgb(var(--ink-rgb))',
      };
    }
  };

  const inputStyle = {
    background: 'rgba(var(--surface-rgb), 0.6)',
    border: '1px solid rgba(46, 196, 182, 0.2)',
    borderRadius: '12px',
    padding: '10px 14px',
    width: '100%',
    color: 'rgb(var(--ink-rgb))',
    fontSize: '14px',
    outline: 'none',
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative bg-surface/80 overflow-hidden"
        style={{
          borderRadius: '28px',
          boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.12), 0 8px 32px rgba(var(--shadow-rgb), 0.08)',
          border: '1px solid rgba(var(--surface-rgb), 0.6)',
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-surface/50 to-transparent pointer-events-none" style={{ borderRadius: '28px' }} />

        <div className="relative z-10">
          {/* Header */}
          <div className="p-8 border-b border-ink/10">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-ink text-2xl mb-1" style={{ fontWeight: 700 }}>
                  User Management
                </h3>
                <p className="text-ink/60 text-sm">
                  Staff accounts only (admins, operators, viewers). Residents are managed on the Residents page.
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setShowAddModal(true); setActionError(''); }}
                className="flex items-center gap-2 px-6 py-3 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)',
                  boxShadow: '0 8px 24px rgba(46, 196, 182, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              >
                <UserPlus className="text-white" size={20} strokeWidth={2.5} />
                <span className="text-white text-sm" style={{ fontWeight: 600 }}>Add New User</span>
              </motion.button>
            </div>

            {/* Search Bar */}
            <div
              className="relative max-w-md"
              style={{
                background: 'rgba(var(--surface-rgb), 0.6)',
                borderRadius: '20px',
                boxShadow: 'inset 0 0 1px 1px rgba(46, 196, 182, 0.2), 0 4px 16px rgba(var(--shadow-rgb), 0.05)',
                border: '1px solid rgba(46, 196, 182, 0.15)',
              }}
            >
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-ink/40" size={20} />
              <input
                type="text"
                placeholder="Search users by name, email, or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-transparent text-ink placeholder:text-ink/40 text-sm outline-none"
                style={{ fontWeight: 500 }}
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '480px' }}>
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-ink/50 text-sm">Loading users...</p>
              </div>
            ) : loadError ? (
              <div className="flex items-center justify-center py-20">
                <p className="text-[#ef4444] text-sm" style={{ fontWeight: 500 }}>⚠ {loadError}</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink/10 bg-ink/[0.04]">
                    <th className="text-left px-8 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>User</th>
                    <th className="text-left px-8 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>Contact</th>
                    <th className="text-left px-8 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>Role</th>
                    <th className="text-left px-8 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>Status</th>
                    <th className="text-left px-8 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>Location</th>
                    <th className="text-left px-8 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>Last Active</th>
                    <th className="text-center px-8 py-4 text-ink/70 text-sm" style={{ fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-ink/40 text-sm">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user, index) => {
                      const roleBadgeStyle = getRoleBadgeStyle(user.role);
                      return (
                        <motion.tr
                          key={user.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03 }}
                          className="border-b border-ink/5 user-row group"
                          style={{ transition: 'all 0.3s ease' }}
                        >
                          {/* User */}
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-4">
                              <div className="relative">
                                <div
                                  className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg"
                                  style={{
                                    background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)',
                                    fontWeight: 700,
                                    boxShadow: '0 8px 24px rgba(var(--shadow-rgb), 0.2)',
                                    border: '2px solid rgba(var(--surface-rgb), 0.8)',
                                  }}
                                >
                                  {user.name.charAt(0).toUpperCase()}
                                </div>
                                {user.status === 'Active' && (
                                  <div
                                    className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full animate-pulse"
                                    style={{
                                      background: '#2EC4B6',
                                      boxShadow: '0 0 0 2px white, 0 0 8px rgba(46, 196, 182, 0.5)',
                                    }}
                                  />
                                )}
                              </div>
                              <span className="text-ink text-sm" style={{ fontWeight: 600 }}>
                                {user.name}
                              </span>
                            </div>
                          </td>

                          {/* Contact */}
                          <td className="px-8 py-5">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-ink/70 text-sm">{user.email}</span>
                              <span className="text-ink/50 text-xs">{user.phone}</span>
                            </div>
                          </td>

                          {/* Role */}
                          <td className="px-8 py-5">
                            <div
                              className="inline-flex items-center px-3 py-1.5 rounded-full text-xs capitalize"
                              style={{ ...roleBadgeStyle, fontWeight: 600 }}
                            >
                              {user.role}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-8 py-5">
                            <div
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
                              style={{
                                background: user.status === 'Active' ? 'rgba(46, 196, 182, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                                border: user.status === 'Active' ? '1px solid rgba(46, 196, 182, 0.3)' : '1px solid rgba(107, 114, 128, 0.3)',
                              }}
                            >
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ background: user.status === 'Active' ? '#2EC4B6' : '#6B7280' }}
                              />
                              <span className="text-xs" style={{ fontWeight: 600, color: user.status === 'Active' ? '#2EC4B6' : '#6B7280' }}>
                                {user.status}
                              </span>
                            </div>
                          </td>

                          {/* Location */}
                          <td className="px-8 py-5">
                            <span className="text-ink/70 text-sm">{user.location}</span>
                          </td>

                          {/* Last Active */}
                          <td className="px-8 py-5">
                            <span className="text-ink/60 text-sm">{user.lastActive}</span>
                          </td>

                          {/* Actions */}
                          <td className="px-8 py-5">
                            <div className="flex items-center justify-center gap-2">
                              <motion.button
                                aria-label={`Edit ${user.name}`}
                                whileHover={{ scale: 1.1, y: -2 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => { setEditingUser(user); setShowEditModal(true); setActionError(''); }}
                                className="p-2 rounded-xl"
                                style={{
                                  background: 'linear-gradient(135deg, rgba(29, 112, 162, 0.08) 0%, rgba(29, 112, 162, 0.04) 100%)',
                                  boxShadow: '0 2px 8px rgba(29, 112, 162, 0.1)',
                                }}
                              >
                                <Edit2 className="text-link" size={16} strokeWidth={2.5} />
                              </motion.button>

                              {user.id !== currentUser?.id && (
                              <motion.button
                                aria-label={`Delete ${user.name}`}
                                whileHover={{ scale: 1.1, y: -2 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => { setDeletingUser(user); setShowDeleteModal(true); setActionError(''); }}
                                className="p-2 rounded-xl"
                                style={{
                                  background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.08) 0%, rgba(255, 107, 53, 0.04) 100%)',
                                  boxShadow: '0 2px 8px rgba(255, 107, 53, 0.1)',
                                }}
                              >
                                <Trash2 className="text-[#FF6B35]" size={16} strokeWidth={2.5} />
                              </motion.button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 py-5 border-t border-ink/10 bg-surface/40">
            <div className="flex items-center justify-between">
              <span className="text-ink/60 text-sm">
                Showing {filteredUsers.length} of {users.length} users
              </span>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#2EC4B6]/10">
                  <div className="w-2 h-2 rounded-full bg-[#2EC4B6]" />
                  <span className="text-xs text-[#2EC4B6]" style={{ fontWeight: 600 }}>
                    {users.filter(u => u.status === 'Active').length} Active
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-ink/10">
                  <div className="w-2 h-2 rounded-full bg-[#6B7280]" />
                  <span className="text-xs text-ink/70" style={{ fontWeight: 600 }}>
                    {users.filter(u => u.status === 'Inactive').length} Inactive
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <style>{`
            .user-row:hover {
            background: linear-gradient(90deg, rgba(46, 196, 182, 0.03) 0%, rgba(46, 196, 182, 0.06) 50%, rgba(46, 196, 182, 0.03) 100%);
          }
        `}</style>
      </motion.div>

      {/* ===================== ADD USER MODAL ===================== */}
      <AnimatePresence>
        {showAddModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(var(--ink-rgb), 0.5)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ pointerEvents: 'none' }}
            >
              <div
                className="w-full max-w-md p-8 relative"
                style={{
                  background: 'rgba(var(--surface-rgb), 0.95)',
                  borderRadius: '28px',
                  boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.2)',
                  border: '1px solid rgba(46, 196, 182, 0.2)',
                  pointerEvents: 'all',
                }}
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-ink text-xl" style={{ fontWeight: 700 }}>Add New User</h3>
                    <p className="text-ink/50 text-sm mt-0.5">Fill in the details to register a new team member</p>
                  </div>
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={() => setShowAddModal(false)} className="p-2 rounded-xl" style={{ background: 'rgba(var(--ink-rgb), 0.05)' }}>
                    <X className="text-ink/60" size={20} />
                  </motion.button>
                </div>

                <div className="space-y-4">
                  {[
                    { label: 'Full Name', key: 'name', type: 'text', placeholder: 'e.g. Juan Dela Cruz' },
                    { label: 'Email Address', key: 'email', type: 'email', placeholder: 'e.g. juan@floodsense.ph' },
                    { label: 'Password', key: 'password', type: 'password', placeholder: 'Min. 6 characters' },
                    { label: 'Phone Number', key: 'phone', type: 'text', placeholder: 'e.g. +63 912 345 6789' },
                    { label: 'Location', key: 'location', type: 'text', placeholder: 'e.g. District A Station' },
                  ].map(({ label, key, type, placeholder }) => (
                    <div key={key}>
                      <label className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>{label}</label>
                      <input
                        type={type}
                        placeholder={placeholder}
                        value={newUser[key as keyof typeof newUser]}
                        onChange={(e) => setNewUser({ ...newUser, [key]: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>Role</label>
                    <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} style={inputStyle}>
                      <option value="Admin">Admin</option>
                      <option value="Operator">Operator</option>
                      <option value="Viewer">Viewer</option>
                    </select>
                  </div>
                </div>

                {actionError && (
                  <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '12px', fontWeight: 500 }}>⚠ {actionError}</p>
                )}

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-3 rounded-2xl text-sm"
                    style={{ background: 'rgba(var(--ink-rgb), 0.05)', color: 'rgb(var(--ink-rgb))', fontWeight: 600, border: '1px solid rgba(var(--ink-rgb), 0.1)' }}
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleAddUser}
                    disabled={addLoading}
                    className="flex-1 py-3 rounded-2xl text-sm text-white"
                    style={{ background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)', boxShadow: '0 8px 24px rgba(46, 196, 182, 0.4)', fontWeight: 600, opacity: addLoading ? 0.7 : 1 }}
                  >
                    {addLoading ? 'Adding...' : 'Add User'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===================== EDIT USER MODAL ===================== */}
      <AnimatePresence>
        {showEditModal && editingUser && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowEditModal(false)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(var(--ink-rgb), 0.5)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ pointerEvents: 'none' }}
            >
              <div
                className="w-full max-w-md p-8 relative"
                style={{
                  background: 'rgba(var(--surface-rgb), 0.95)',
                  borderRadius: '28px',
                  boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.2)',
                  border: '1px solid rgba(46, 196, 182, 0.2)',
                  pointerEvents: 'all',
                }}
              >
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-ink text-xl" style={{ fontWeight: 700 }}>Edit User</h3>
                    <p className="text-ink/50 text-sm mt-0.5">Update the details for {editingUser.name}</p>
                  </div>
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} onClick={() => setShowEditModal(false)} className="p-2 rounded-xl" style={{ background: 'rgba(var(--ink-rgb), 0.05)' }}>
                    <X className="text-ink/60" size={20} />
                  </motion.button>
                </div>

                <div className="space-y-4">
                  {[
                    { label: 'Full Name', key: 'name', type: 'text' },
                    { label: 'Phone Number', key: 'phone', type: 'text' },
                    { label: 'Location', key: 'location', type: 'text' },
                  ].map(({ label, key, type }) => (
                    <div key={key}>
                      <label className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>{label}</label>
                      <input
                        type={type}
                        value={editingUser[key as keyof User] as string}
                        onChange={(e) => setEditingUser({ ...editingUser, [key]: e.target.value })}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>Role</label>
                    <select value={editingUser.role} onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value as User['role'] })} style={inputStyle}>
                      <option value="Admin">Admin</option>
                      <option value="Operator">Operator</option>
                      <option value="Viewer">Viewer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-ink text-sm mb-1.5" style={{ fontWeight: 600 }}>Status</label>
                    <select value={editingUser.status} onChange={(e) => setEditingUser({ ...editingUser, status: e.target.value as User['status'] })} style={inputStyle}>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {actionError && (
                  <p style={{ color: '#ef4444', fontSize: '13px', marginTop: '12px', fontWeight: 500 }}>⚠ {actionError}</p>
                )}

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 py-3 rounded-2xl text-sm"
                    style={{ background: 'rgba(var(--ink-rgb), 0.05)', color: 'rgb(var(--ink-rgb))', fontWeight: 600, border: '1px solid rgba(var(--ink-rgb), 0.1)' }}
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleEditUser}
                    disabled={editLoading}
                    className="flex-1 py-3 rounded-2xl text-sm text-white"
                    style={{ background: 'linear-gradient(135deg, #2EC4B6 0%, #1fa299 100%)', boxShadow: '0 8px 24px rgba(46, 196, 182, 0.4)', fontWeight: 600, opacity: editLoading ? 0.7 : 1 }}
                  >
                    {editLoading ? 'Saving...' : 'Save Changes'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===================== DELETE MODAL ===================== */}
      <AnimatePresence>
        {showDeleteModal && deletingUser && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowDeleteModal(false)}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(var(--ink-rgb), 0.5)', backdropFilter: 'blur(4px)' }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ pointerEvents: 'none' }}
            >
              <div
                className="w-full max-w-sm p-8 relative"
                style={{
                  background: 'rgba(var(--surface-rgb), 0.95)',
                  borderRadius: '28px',
                  boxShadow: '0 20px 60px rgba(var(--shadow-rgb), 0.2)',
                  border: '1px solid rgba(255, 107, 53, 0.2)',
                  pointerEvents: 'all',
                }}
              >
                <div className="flex justify-center mb-4">
                  <div className="p-4 rounded-2xl" style={{ background: 'rgba(255, 107, 53, 0.1)' }}>
                    <AlertTriangle className="text-[#FF6B35]" size={32} strokeWidth={2} />
                  </div>
                </div>

                <h3 className="text-ink text-xl text-center mb-2" style={{ fontWeight: 700 }}>Delete User</h3>
                <p className="text-ink/60 text-sm text-center mb-6">
                  Are you sure you want to delete <span className="font-semibold text-ink">{deletingUser.name}</span>? This action cannot be undone.
                </p>

                {actionError && (
                  <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px', fontWeight: 500, textAlign: 'center' }}>⚠ {actionError}</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="flex-1 py-3 rounded-2xl text-sm"
                    style={{ background: 'rgba(var(--ink-rgb), 0.05)', color: 'rgb(var(--ink-rgb))', fontWeight: 600, border: '1px solid rgba(var(--ink-rgb), 0.1)' }}
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleDeleteUser}
                    disabled={deleteLoading}
                    className="flex-1 py-3 rounded-2xl text-sm text-white"
                    style={{ background: 'linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%)', boxShadow: '0 8px 24px rgba(255, 107, 53, 0.4)', fontWeight: 600, opacity: deleteLoading ? 0.7 : 1 }}
                  >
                    {deleteLoading ? 'Deleting...' : 'Delete'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}