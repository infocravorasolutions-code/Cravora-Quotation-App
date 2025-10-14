import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import ClientDetails from './pages/ClientDetails';
import Modules from './pages/Modules';
import Summary from './pages/Summary';
import PdfPreview from './pages/PdfPreview';
import History from './pages/History';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <Routes>
          <Route path="/" element={<ClientDetails />} />
          <Route path="/modules" element={<Modules />} />
          <Route path="/summary" element={<Summary />} />
          <Route path="/pdf-preview" element={<PdfPreview />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
