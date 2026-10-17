import { useEffect, useState } from 'react';
import { apiJson, asItems } from '../utils/api';

interface ClientRecord {
  _id: string;
  companyName: string;
  contactPerson: string;
  email: string;
  mobile: string;
  gstin: string;
  billingAddress: string;
  shippingAddress: string;
  website: string;
  notes: string;
}

const emptyClient = {
  companyName: '',
  contactPerson: '',
  email: '',
  mobile: '',
  gstin: '',
  billingAddress: '',
  shippingAddress: '',
  website: '',
  notes: '',
};

export default function Clients() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyClient);
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');

  const load = async (q = query) => {
    const data = await apiJson(`/api/clients?limit=50&q=${encodeURIComponent(q)}`);
    setClients(asItems<ClientRecord>(data));
  };

  useEffect(() => {
    apiJson('/api/clients?limit=50')
      .then((data) => setClients(asItems<ClientRecord>(data)))
      .catch((err: Error) => setError(err.message));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await apiJson(`/api/clients/${editingId}`, { method: 'PUT', body: JSON.stringify(form) });
      } else {
        await apiJson('/api/clients', { method: 'POST', body: JSON.stringify(form) });
      }
      setForm(emptyClient);
      setEditingId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save client');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this client? Saved quotations keep their own client snapshot.')) return;
    try {
      await apiJson(`/api/clients/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete client');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl space-y-6">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Clients</h1>
          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input name="companyName" value={form.companyName} onChange={handleChange} required placeholder="Company name" className="border rounded-lg px-3 py-2" />
            <input name="contactPerson" value={form.contactPerson} onChange={handleChange} placeholder="Contact person" className="border rounded-lg px-3 py-2" />
            <input name="email" type="email" value={form.email} onChange={handleChange} required placeholder="Email" className="border rounded-lg px-3 py-2" />
            <input name="mobile" value={form.mobile} onChange={handleChange} placeholder="Mobile" className="border rounded-lg px-3 py-2" />
            <input name="gstin" value={form.gstin} onChange={handleChange} placeholder="GSTIN" className="border rounded-lg px-3 py-2" />
            <input name="website" value={form.website} onChange={handleChange} placeholder="Website" className="border rounded-lg px-3 py-2" />
            <textarea name="billingAddress" value={form.billingAddress} onChange={handleChange} placeholder="Billing address" className="border rounded-lg px-3 py-2" />
            <textarea name="shippingAddress" value={form.shippingAddress} onChange={handleChange} placeholder="Shipping address" className="border rounded-lg px-3 py-2" />
            <textarea name="notes" value={form.notes} onChange={handleChange} placeholder="Notes" className="border rounded-lg px-3 py-2 sm:col-span-2" />
            <div className="sm:col-span-2 flex gap-3">
              <button className="bg-cravora-purple text-white px-4 py-2 rounded-lg" type="submit">{editingId ? 'Update client' : 'Create client'}</button>
              {editingId && (
                <button type="button" className="bg-gray-200 px-4 py-2 rounded-lg" onClick={() => { setEditingId(''); setForm(emptyClient); }}>Cancel</button>
              )}
            </div>
          </form>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <div className="flex gap-3 mb-4">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients" className="border rounded-lg px-3 py-2 flex-1" />
            <button className="bg-gray-800 text-white px-4 py-2 rounded-lg" onClick={() => load().catch((err) => setError(err.message))}>Search</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2">Company</th>
                  <th>Email</th>
                  <th>Mobile</th>
                  <th>GSTIN</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client._id} className="border-b">
                    <td className="py-3">{client.companyName}</td>
                    <td>{client.email}</td>
                    <td>{client.mobile}</td>
                    <td>{client.gstin}</td>
                    <td className="text-right space-x-2">
                      <button className="text-cravora-purple" onClick={() => { setEditingId(client._id); setForm({ ...emptyClient, ...client }); }}>Edit</button>
                      <button className="text-red-600" onClick={() => handleDelete(client._id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
