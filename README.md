# Cravora Quotation App

A modern, full-stack quotation and billing management application built with the MERN stack (MongoDB, Express, React, Node.js). Generate professional quotations and bills with GST support, module-based pricing, and PDF export capabilities.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-ISC-green)
![React](https://img.shields.io/badge/React-18.3.1-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5.3-3178C6)

## 📋 Overview

Cravora Quotation App enables businesses to create, manage, and export professional quotations and billing documents. The application supports:

- **Quotation Generation**: Create detailed quotations with multiple service modules
- **Billing**: Generate bills/invoices from quotations
- **GST Calculations**: Support for both intra-state (CGST + SGST) and inter-state (IGST) tax calculations
- **Auto-Save**: Automatic draft saving to prevent data loss
- **PDF Export**: Export quotations and bills to professional PDF documents
- **History Management**: View and manage all past quotations and bills

## 🏗️ Architecture

### Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | React | 18.3.1 |
| Frontend | TypeScript | 5.5.3 |
| Frontend | Vite | 5.4.2 |
| Frontend | TailwindCSS | 3.4.1 |
| Frontend | Zustand | 5.0.8 |
| Frontend | Framer Motion | 12.23.24 |
| Frontend | React Router DOM | 7.9.4 |
| Frontend | jsPDF + html2canvas | 3.0.3 / 1.4.1 |
| Backend | Node.js | - |
| Backend | Express | 5.2.1 |
| Backend | Mongoose | 9.2.4 |
| Database | MongoDB | - |

### Project Structure

```
Cravora-Quotation-App/
├── src/                          # Frontend source code
│   ├── assets/
│   │   └── fonts/                # Poppins font family
│   ├── components/              # Reusable UI components
│   │   ├── GSTConfiguration.tsx # GST settings component
│   │   ├── Navbar.tsx           # Navigation bar
│   │   ├── PdfDocument.tsx      # PDF template component
│   │   └── ProgressStepper.tsx   # Step progress indicator
│   ├── hooks/
│   │   └── useAutoSave.ts       # Auto-save hook
│   ├── pages/                   # Application pages
│   │   ├── ClientDetails.tsx    # Client information form
│   │   ├── History.tsx          # Quotation history
│   │   ├── Modules.tsx          # Service modules management
│   │   ├── PdfPreview.tsx       # PDF preview page
│   │   └── Summary.tsx          # Summary & totals page
│   ├── store/
│   │   └── quotationStore.ts    # Zustand state management
│   ├── utils/                   # Utility functions
│   │   ├── currency.ts          # Currency formatting
│   │   ├── numberToWords.ts     # Number to words conversion
│   │   └── pdfGenerator.ts      # PDF generation utilities
│   ├── App.tsx                  # Main app component
│   ├── index.css                # Global styles
│   └── main.tsx                 # App entry point
├── backend/                     # Backend source code
│   ├── models/
│   │   └── Quotation.js        # Mongoose schema
│   ├── routes/
│   │   └── quotations.js       # API routes
│   ├── server.js               # Express server
│   └── package.json
├── public/                      # Static assets
│   └── logo.png                # Company logos
├── package.json                # Root package configuration
├── vite.config.ts               # Vite configuration
├── tailwind.config.js          # TailwindCSS configuration
└── tsconfig.json               # TypeScript configuration
```

## 🚀 Features

### 1. Document Types
- **Quotation**: Professional quotation generation with detailed pricing
- **Billing**: Generate bills/invoices from existing quotations

### 2. Client Information Management
- Client name and email
- Project name and description
- Currency selection (INR / USD)
- Pricing type (Hourly / Fixed)
- GST registration details
- PAN numbers
- Address information
- Place and country of supply

### 3. Module/Service Management
- Add multiple service modules
- Define hours and rate per module
- Automatic total calculation per module
- Edit and delete existing modules

### 4. Financial Calculations
- **Subtotal**: Sum of all module totals
- **Discount**: Optional percentage-based discount
- **Tax**: Configurable tax rate
- **GST Support**:
  - Intra-state: CGST + SGST splitting
  - Inter-state: IGST calculation
  - Configurable GST rates (0%, 5%, 12%, 18%, 28%)
- **Grand Total**: Final amount after all calculations

### 5. Auto-Save Functionality
- Automatic draft saving
- Manual save option
- Last saved timestamp display
- Resume work from any point

### 6. PDF Generation
- Professional PDF layout
- Company branding
- Detailed pricing breakdown
- Terms and conditions
- Export to downloadable PDF

### 7. History Management
- View all past quotations
- Filter by document type
- Load previous quotations for editing
- Delete unwanted records

## 📄 API Endpoints

### Quotation Routes (`/api/quotations`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get all quotations |
| GET | `/:id` | Get quotation by ID |
| POST | `/` | Create new quotation |
| PUT | `/:id` | Update quotation |
| DELETE | `/:id` | Delete quotation |

### Request/Response Examples

**Create Quotation (POST)**
```json
{
  "quotationId": "QTN-2026-001",
  "documentType": "Quotation",
  "clientInfo": {
    "clientName": "Acme Corp",
    "clientEmail": "accounts@acme.com",
    "projectName": "Website Redesign",
    "currency": "INR",
    "pricingType": "Fixed"
  },
  "modules": [
    {
      "id": "mod-1",
      "name": "UI/UX Design",
      "description": "Complete UI/UX design",
      "hours": 40,
      "rate": 1500,
      "total": 60000
    }
  ],
  "tax": 18,
  "discountRate": 0,
  "gstDetails": {
    "gstType": "intra",
    "gstRate": 18,
    "cgstRate": 9,
    "sgstRate": 9
  },
  "isDraft": true
}
```

## 💻 Installation & Setup

### Prerequisites
- Node.js (v18 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file in the `backend` directory:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/cravora_quotations
```

Start the backend server:

```bash
npm start
# or with nodemon for development
npm run dev
```

### Frontend Setup

```bash
# From root directory
npm install
```

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The production-ready files will be in the `dist` folder.

## 🔧 Configuration

### GST Rates
The application supports standard GST rates:
- 0% - Exempt
- 5% - Essential items
- 12% - Standard rate
- 18% - Standard rate (most common)
- 28% - Luxury items

### Default Terms and Conditions
Default terms that appear on quotations:
1. "Please pay within 15 days from the date of invoice, overdue interest @ 14% will be charged on delayed payments."
2. "Please quote invoice number when remitting funds."

### Quotation ID Format
- Quotation: `QTN-{year}-{sequence}` (e.g., QTN-2026-001)
- Billing: `BILL-{year}-{sequence}` (e.g., BILL-2026-001)

## 🎨 UI/UX

### Design System
- **Font Family**: Poppins (Google Fonts)
- **Color Scheme**:
  - Primary: Custom branding
  - Background: Light gray (#F9FAFB)
  - Text: Dark gray (#1F2937)
- **Animations**: Framer Motion for smooth transitions

### Responsive Design
The application is fully responsive and works on:
- Desktop (1024px+)
- Tablet (768px - 1023px)
- Mobile (320px - 767px)

### Pages Flow
1. **Client Details** → 2. **Modules** → 3. **Summary** → 4. **PDF Preview**

## 🔐 Environment Variables

### Frontend
No required environment variables for basic setup.

### Backend

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 5000 |
| MONGODB_URI | MongoDB connection string | mongodb://127.0.0.1:27017/cravora_quotations |

## 🧪 Testing

The current setup does not include automated tests. To add tests:

```bash
# Install testing dependencies
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom
```

## 📦 Dependencies

### Frontend Dependencies
- `@supabase/supabase-js` - Supabase client
- `date-fns` - Date manipulation
- `framer-motion` - Animations
- `html2canvas` - HTML to canvas conversion
- `jspdf` - PDF generation
- `lucide-react` - Icon library
- `react` - React library
- `react-dom` - React DOM
- `react-router-dom` - Routing
- `zustand` - State management

### Backend Dependencies
- `cors` - CORS middleware
- `dotenv` - Environment variables
- `express` - Express framework
- `mongoose` - MongoDB ODM

## 🔄 Future Enhancements

Potential improvements for the application:
- [ ] User authentication
- [ ] PDF template customization
- [ ] Email quotation directly
- [ ] Multi-language support
- [ ] Currency conversion
- [ ] Template library
- [ ] Client database
- [ ] Analytics dashboard
- [ ] Export to Excel/CSV

## 📄 License

This project is licensed under the ISC License.

## 👏 Acknowledgments

- [React](https://react.dev)
- [Vite](https://vitejs.dev)
- [TailwindCSS](https://tailwindcss.com)
- [MongoDB](https://www.mongodb.com)
- [Express](https://expressjs.com)
- [Supabase](https://supabase.com)

---

Built with ❤️ by Cravora Team
