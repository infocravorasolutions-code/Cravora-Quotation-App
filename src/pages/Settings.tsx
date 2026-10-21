import { useEffect, useState } from 'react';
import { apiJson } from '../utils/api';
import { loadPaymentProfile, savePaymentProfile, type PaymentProfile } from '../utils/paymentProfile';

export default function Settings() {
  const [profile, setProfile] = useState<PaymentProfile>(() => loadPaymentProfile());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mail, setMail] = useState({ host: '', port: '587', user: '', password: '', from: '', testTo: '' });
  const [passwordSet, setPasswordSet] = useState(false);
  const [mailMessage, setMailMessage] = useState('');
  const [mailError, setMailError] = useState('');
  const [mailBusy, setMailBusy] = useState(false);
  const [role, setRole] = useState('admin');
  const [users, setUsers] = useState<Array<{ _id?: string; email: string; role: string }>>([]);
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'accounts' });
  const [editingUser, setEditingUser] = useState<{ _id: string; email: string; role: string } | null>(null);
  const [editRole, setEditRole] = useState('accounts');
  const [editPassword, setEditPassword] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [userError, setUserError] = useState('');

  const reloadUsers = async () => {
    try {
      const data = await apiJson('/api/auth/users');
      setUsers((data.items || []) as Array<{ _id: string; email: string; role: string }>);
    } catch {
      // ignore
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser?._id) return;
    setUserError('');
    setUserMessage('');
    try {
      const body: Record<string, string> = { role: editRole };
      if (editPassword) body.password = editPassword;
      await apiJson(`/api/auth/users/${editingUser._id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setUserMessage(`User ${editingUser.email} updated.`);
      setEditingUser(null);
      setEditPassword('');
      await reloadUsers();
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Could not update user');
    }
  };

  const handleDeleteUser = async (user: { _id?: string; email: string }) => {
    if (!user._id) return;
    if (!confirm(`Are you sure you want to delete user ${user.email}?`)) return;
    setUserError('');
    setUserMessage('');
    try {
      await apiJson(`/api/auth/users/${user._id}`, { method: 'DELETE' });
      setUserMessage(`User ${user.email} deleted.`);
      await reloadUsers();
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Could not delete user');
    }
  };

  useEffect(() => {
    apiJson('/api/settings/smtp').then((data) => {
      setMail({
        host: data.host || '',
        port: String(data.port || 587),
        user: data.user || '',
        password: '',
        from: data.from || '',
        testTo: data.from || '',
      });
      setPasswordSet(Boolean(data.passwordSet));
    }).catch(() => setMailError('Could not load mail settings.'));
    apiJson('/api/auth/me').then((data) => setRole(data.role || 'admin')).catch(() => setRole('admin'));
    apiJson('/api/auth/users').then((data) => setUsers((data.items || []) as Array<{ email: string; role: string }>)).catch(() => setUsers([]));
  }, []);

  const saveMail = async () => {
    setMailBusy(true);
    setMailError('');
    setMailMessage('');
    try {
      const result = await apiJson('/api/settings/smtp', {
        method: 'POST',
        body: JSON.stringify({
          host: mail.host,
          port: Number(mail.port),
          user: mail.user,
          password: mail.password,
          from: mail.from,
          testTo: mail.testTo || mail.from,
        }),
      });
      setPasswordSet(Boolean(result.passwordSet));
      setMail((current) => ({ ...current, password: '' }));
      setMailMessage(result.message || 'Mail server saved.');
    } catch (err) {
      setMailError(err instanceof Error ? err.message : 'Could not save mail settings');
    } finally {
      setMailBusy(false);
    }
  };

  const update = (field: keyof PaymentProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
    setMessage('');
  };

  const onQr = (file: File | undefined) => {
    setError('');
    setMessage('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Upload a PNG or JPG image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const max = 480;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        update('qrDataUrl', canvas.toDataURL('image/jpeg', 0.85));
      };
      image.onerror = () => setError('Could not read that image.');
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  const save = () => {
    savePaymentProfile(profile);
    setError('');
    setMessage('Payment details saved. New quotation and bill PDFs will use them.');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6 text-gray-700">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
            <p className="mt-2 text-sm text-gray-600">Mail is sent from here. Bank details and the payment QR appear on every quotation and tax invoice. This account's role is {role}.</p>
          </div>

          <div className="space-y-4 border-b border-gray-100 pb-6">
            <h2 className="text-lg font-semibold text-gray-800">Email (SMTP)</h2>
            <p className="text-sm text-gray-500">Use the mailbox that should send quotations and invoices. Save and test sends a real message to the test address below. Port 587 is the usual choice.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="SMTP host" value={mail.host} onChange={(value) => setMail({ ...mail, host: value })} />
              <Field label="Port" value={mail.port} onChange={(value) => setMail({ ...mail, port: value })} />
              <Field label="SMTP user" value={mail.user} onChange={(value) => setMail({ ...mail, user: value })} />
              <Field label="From email" value={mail.from} onChange={(value) => setMail({ ...mail, from: value, testTo: mail.testTo || value })} />
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-gray-700">SMTP password</span>
                <input
                  type="password"
                  value={mail.password}
                  placeholder={passwordSet ? 'Saved. Enter a new password only to replace it.' : 'App password or mailbox password'}
                  onChange={(event) => setMail({ ...mail, password: event.target.value })}
                  className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </label>
              <Field label="Send test to" value={mail.testTo} onChange={(value) => setMail({ ...mail, testTo: value })} />
            </div>
            {mailError && <p className="text-sm text-red-600">{mailError}</p>}
            {mailMessage && <p className="text-sm text-green-700">{mailMessage}</p>}
            <button type="button" onClick={saveMail} disabled={mailBusy} className="bg-cravora-purple text-white px-4 py-2 rounded-lg font-medium disabled:opacity-60">
              {mailBusy ? 'Checking mail server…' : 'Save and test email'}
            </button>
          </div>

          {role === 'admin' && (
            <div className="space-y-4 border-b border-gray-100 pb-6">
              <h2 className="text-lg font-semibold text-gray-800">Team</h2>
              <p className="text-sm text-gray-500">Manage user access and roles for your organization.</p>

              <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-600">
                    <tr>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((user) => (
                      <tr key={user.email} className="hover:bg-purple-50/30">
                        <td className="px-4 py-3 font-medium text-gray-800">{user.email}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                            user.role === 'accounts' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <button
                            type="button"
                            className="text-cravora-purple hover:underline text-xs font-medium"
                            onClick={() => {
                              setEditingUser(user as { _id: string; email: string; role: string });
                              setEditRole(user.role);
                              setEditPassword('');
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-red-600 hover:underline text-xs font-medium"
                            onClick={() => handleDeleteUser(user)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-center text-gray-500">No team members found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Edit User Modal / Box */}
              {editingUser && (
                <div className="p-4 bg-purple-50/60 border border-purple-100 rounded-xl space-y-3">
                  <h3 className="text-sm font-semibold text-gray-800">Edit User: {editingUser.email}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                      >
                        <option value="admin">admin</option>
                        <option value="accounts">accounts</option>
                        <option value="viewer">viewer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Reset Password (leave empty to keep)</label>
                      <input
                        type="password"
                        placeholder="New password (optional)"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="bg-cravora-purple text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-cravora-purple-dark transition"
                      onClick={handleUpdateUser}
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-300 transition"
                      onClick={() => setEditingUser(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Add User Section */}
              <h3 className="text-sm font-semibold text-gray-800 pt-2">Add New Member</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Email" value={newUser.email} onChange={(value) => setNewUser({ ...newUser, email: value })} />
                <Field label="Password" type="password" value={newUser.password} onChange={(value) => setNewUser({ ...newUser, password: value })} />
                <div>
                  <label className="block text-sm font-medium text-gray-700">Role</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  >
                    <option value="accounts">accounts</option>
                    <option value="admin">admin</option>
                    <option value="viewer">viewer</option>
                  </select>
                </div>
              </div>
              {userError && <p className="text-sm text-red-600">{userError}</p>}
              {userMessage && <p className="text-sm text-green-700">{userMessage}</p>}
              <button
                type="button"
                className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 transition"
                onClick={async () => {
                  setUserError('');
                  setUserMessage('');
                  try {
                    const created = await apiJson('/api/auth/users', {
                      method: 'POST',
                      body: JSON.stringify({ email: newUser.email, password: newUser.password, role: newUser.role }),
                    });
                    setUsers((current) => [...current, { _id: created._id, email: created.email || newUser.email, role: created.role || newUser.role }]);
                    setNewUser({ email: '', password: '', role: 'accounts' });
                    setUserMessage('Team member added.');
                  } catch (err) {
                    setUserError(err instanceof Error ? err.message : 'Could not add the user');
                  }
                }}
              >
                Add Member
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Bank name" value={profile.bankName} onChange={(value) => update('bankName', value)} />
            <Field label="Account name" value={profile.accountName} onChange={(value) => update('accountName', value)} />
            <Field label="Account number" value={profile.accountNumber} onChange={(value) => update('accountNumber', value)} />
            <Field label="IFSC code" value={profile.ifsc} onChange={(value) => update('ifsc', value)} />
            <Field label="UPI ID" value={profile.upiId} onChange={(value) => update('upiId', value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment QR</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => onQr(event.target.files?.[0])}
              className="block w-full text-sm text-gray-600"
            />
            {profile.qrDataUrl ? (
              <div className="mt-3 flex items-center gap-4">
                <img src={profile.qrDataUrl} alt="Payment QR preview" className="w-24 h-24 object-contain border rounded-lg" />
                <button type="button" className="text-sm text-red-600" onClick={() => update('qrDataUrl', '')}>Remove QR</button>
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-500">No QR uploaded yet. The PDF shows a placeholder until you add one.</p>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-700">{message}</p>}

          <button type="button" onClick={save} className="bg-cravora-purple text-white px-4 py-2 rounded-lg font-medium">
            Save payment details
          </button>

          <p className="text-sm text-gray-500">The mail password stays on the server and is not shown again after you save it.</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
      />
    </label>
  );
}
