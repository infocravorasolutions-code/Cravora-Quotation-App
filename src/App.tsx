import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import ClientDetails from './pages/ClientDetails';
import Modules from './pages/Modules';
import Summary from './pages/Summary';
import PdfPreview from './pages/PdfPreview';
import History from './pages/History';
import Clients from './pages/Clients';
import Invoices from './pages/Invoices';
import Payments from './pages/Payments';
import Receipts from './pages/Receipts';
import Home from './pages/Home';
import InvoiceDetail from './pages/InvoiceDetail';
import Settings from './pages/Settings';
import Accounts from './pages/Accounts';
import Receivables from './pages/Receivables';
import Expenses from './pages/Expenses';
import Register from './pages/Register';
import FinanceReports from './pages/FinanceReports';
import Collections from './pages/Collections';
import Statements from './pages/Statements';
import PublicQuotation from './pages/PublicQuotation';
import Login from './pages/Login';
import RequireAuth from './components/RequireAuth';

function AppShell() {
  const location = useLocation();
  const isPublic = location.pathname.startsWith('/public');
  const isLogin = location.pathname === '/login';
  return (
    <div className="min-h-screen bg-gray-50">
      {!isPublic && !isLogin && <Navbar />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/public/quotation/:token" element={<PublicQuotation />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<ClientDetails />} />
          <Route path="/modules" element={<Modules />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/pdf-preview" element={<PdfPreview />} />
          <Route path="/history" element={<History />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoices/:invoiceNumber" element={<InvoiceDetail />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/home" element={<Home />} />
          <Route path="/dashboard" element={<Navigate to="/home" replace />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/accounts/receivables" element={<Receivables />} />
          <Route path="/accounts/collections" element={<Collections />} />
          <Route path="/accounts/statements" element={<Statements />} />
          <Route path="/accounts/expenses" element={<Expenses />} />
          <Route path="/accounts/payables" element={<Navigate to="/accounts/expenses" replace />} />
          <Route path="/accounts/register" element={<Register />} />
          <Route path="/accounts/reports" element={<FinanceReports />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}

export default App;
