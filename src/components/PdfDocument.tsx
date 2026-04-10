import { format } from 'date-fns';
import { formatCurrency } from '../utils/currency';
import { numberToWords } from '../utils/numberToWords';

interface PdfDocumentProps {
    clientInfo: any;
    modules: any[];
    quotationId: string;
    tax: number;
    discountRate: number;
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    grandTotal: number;
    termsAndConditions: string[];
    documentType: string;
    id?: string;
}

export default function PdfDocument({
    clientInfo,
    modules,
    quotationId,
    tax,
    discountRate,
    subtotal,
    taxAmount,
    discountAmount,
    grandTotal,
    termsAndConditions,
    documentType,
    id = 'pdf-content'
}: PdfDocumentProps) {

    // Dynamic PDF chunking logic to maximize space usage per A4 page
    const calculatePages = () => {
        const PAGES: { modules: any[]; pageNum: number; isFirstPage: boolean; isLastPage: boolean; startIndex: number }[] = [];
        let currentModules: any[] = [];
        let currentHeight = 0;

        // Pixel equivalents of 297mm A4 at 96 DPI
        const FIRST_PAGE_MAX_HEIGHT = 1050; // Keep first page unchanged
        const NORMAL_PAGE_MAX_HEIGHT = 1085; // Safely fit 1 extra row per normal page before hitting the absolutely positioned footer

        // Estimated Heights in px
        const FIRST_PAGE_HEADER = 340; // Reduced to fit more rows on the first page
        const NORMAL_PAGE_HEADER = 64; // Restored to 64 to account for mt-8
        const TABLE_HEADER = 50;
        const FOOTER = 350;
        const ROW_BASE = 53;
        const DESC_LINE = 18;
        const CHARS_PER_LINE = 65;

        let isFirstPage = true;
        let pageNum = 1;
        let absoluteStartIndex = 0;

        currentHeight = FIRST_PAGE_HEADER + TABLE_HEADER;

        // If we have no modules, we still need one guaranteed page with the header AND footer
        if (modules.length === 0) {
            return [{
                modules: [],
                pageNum: 1,
                isFirstPage: true,
                isLastPage: true,
                startIndex: 0
            }];
        }

        for (let i = 0; i < modules.length; i++) {
            const module = modules[i];

            // Estimate row height
            let rowHeight = ROW_BASE;
            if (module.description) {
                const lines = module.description.split('\n').reduce((acc: number, text: string) => acc + (Math.ceil(text.length / CHARS_PER_LINE) || 1), 0);
                rowHeight += lines * DESC_LINE;
                rowHeight += 8; // mb-1 margin above description
            }

            const isLastModule = i === modules.length - 1;
            const maxPageHeight = isFirstPage ? FIRST_PAGE_MAX_HEIGHT : NORMAL_PAGE_MAX_HEIGHT;

            // Check if row fits on current page
            if (currentHeight + rowHeight > maxPageHeight && currentModules.length > 0) {
                PAGES.push({
                    modules: currentModules,
                    pageNum: pageNum++,
                    isFirstPage: isFirstPage,
                    isLastPage: false,
                    startIndex: absoluteStartIndex
                });
                absoluteStartIndex += currentModules.length;
                currentModules = [];
                isFirstPage = false;
                currentHeight = NORMAL_PAGE_HEADER + TABLE_HEADER;
            }

            // If it's the last module, check if the footer forces a new page anyway
            if (isLastModule && currentHeight + rowHeight <= maxPageHeight && currentHeight + rowHeight + FOOTER > maxPageHeight) {
                currentModules.push(module);
                currentHeight += rowHeight;
                PAGES.push({
                    modules: currentModules,
                    pageNum: pageNum++,
                    isFirstPage: isFirstPage,
                    isLastPage: false,
                    startIndex: absoluteStartIndex
                });
                absoluteStartIndex += currentModules.length;
                currentModules = [];
                isFirstPage = false;
                currentHeight = NORMAL_PAGE_HEADER + TABLE_HEADER;
                break;
            }

            currentModules.push(module);
            currentHeight += rowHeight;
        }

        // Always push the final page (even if currentModules is empty, it needs to hold the footer)
        PAGES.push({
            modules: currentModules,
            pageNum: pageNum,
            isFirstPage: isFirstPage,
            isLastPage: true,
            startIndex: absoluteStartIndex
        });

        return PAGES;
    };

    const pages = calculatePages();

    return (
        <div
            id={id}
            className="flex flex-col bg-gray-100"
            style={{
                fontFamily: "'Poppins', sans-serif",
                fontSize: '12px',
                lineHeight: '1.5',
                width: '210mm',
                margin: '0 auto',
                color: '#333'
            }}
        >
            {pages.map((pageChunk) => (
                <div
                    key={`page-${pageChunk.pageNum}`}
                    className="p-8 relative bg-white"
                    style={{
                        width: '210mm',
                        height: '297mm', // Exact A4 height to perfectly align with jsPDF slicing inside pdfGenerator
                        overflow: 'hidden',
                        position: 'relative',
                        pageBreakAfter: pageChunk.isLastPage ? 'auto' : 'always',
                        marginBottom: pageChunk.isLastPage ? '0' : '2rem', // visual gap between pages in preview
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
                    }}
                >
                    {pageChunk.isFirstPage && (
                        <>
                            {/* Header Section */}
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex flex-col gap-4">
                                    <h1 className="text-2xl text-cravora-purple uppercase">
                                        {documentType === 'Billing' ? 'Bill' : 'Quotation'}
                                    </h1>
                             <div className="grid grid-cols-3 gap-x-8 gap-y-3 text-sm mt-2">
  {/* Row 1 */}
  <span className="text-gray-500 font-medium uppercase">
    {documentType === 'Billing' ? 'Bill No' : 'Customer ID'}
  </span>
  <span className="font-bold text-gray-800">{quotationId}</span>
  <span></span>

  {/* Row 2 */}
  <span className="text-gray-500 font-medium uppercase">
    Date
  </span>
  <span className="font-bold text-gray-800">
    {format(new Date(), 'dd/MM/yyyy')}
  </span>
  <span></span>

  {/* Row 3 */}
  <span className="text-gray-500 font-medium uppercase">
    Client
  </span>
  <span className="font-bold text-gray-800 uppercase">
    {clientInfo.clientName}
  </span>
  <span></span>
</div>

                                      <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm mt-2">
                                        
                                     
                                    </div>
                                </div>

                                {/* Company Branding & Logo Right */}
                                <div className="flex items-start justify-end pr-12 mt-2">
                                    <img src="/logo-header.png" alt="Company Logo" className="w-[160px] h-auto object-contain" />
                                </div>
                            </div>

                            {/* Information Boxes */}
                            <div className="grid grid-cols-2 gap-4 mb-2">
                                {/* Quotation by / Billing by */}
                             

                                {/* Quotation to / Billing to */}
                                
                            </div>


                        </>
                    )}

                    {/* Item Table (Repeats per chunk page) */}
                    {(pageChunk.modules.length > 0 || modules.length === 0) && (
                        <div className={`mb-4 rounded-lg overflow-hidden border border-gray-200 ${!pageChunk.isFirstPage ? 'mt-8' : ''}`}>
                            <table className="w-full text-left">
                                    <thead className="bg-cravora-purple text-white">
                                        <tr>
                                            <th className="py-3 px-4 font-normal text-sm w-[45%]" style={{ verticalAlign: 'middle', paddingTop: 0}}>Item #/Item description</th>
                                            <th className="py-3 px-4 font-normal text-sm text-center" style={{ verticalAlign: 'middle', paddingTop: 0}}>Hours</th>
                                            <th className="py-3 px-4 font-normal text-sm text-right" style={{ verticalAlign: 'middle', paddingTop: 0}}>Price</th>
                                            <th className="py-3 px-4 font-normal text-sm text-right" style={{ verticalAlign: 'middle', paddingTop: 0}}>Amount</th>
                                        </tr>
                                    </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {modules.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="py-8 text-center text-gray-500">
                                                No modules added
                                            </td>
                                        </tr>
                                    ) : (
                                        pageChunk.modules.map((module, index) => {
                                            const absoluteIndex = pageChunk.startIndex + index;

                                            return (
                                                <tr key={module.id} className="align-top">
                                                    <td className="py-4 px-4 font-medium text-gray-800">
                                                        <div className="mb-1">{absoluteIndex + 1}. {module.name}</div>
                                                        {module.description && (
                                                            <div className="text-gray-500 font-normal text-xs ml-4 leading-relaxed whitespace-pre-wrap break-words">
                                                                {module.description}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-4 px-4 text-center text-gray-800">
                                                        {module.hours}
                                                    </td>
                                                    <td className="py-4 px-4 text-right text-gray-800">
                                                        {formatCurrency(module.rate, clientInfo.currency)}
                                                    </td>
                                                    <td className="py-4 px-4 text-right font-medium text-gray-800">
                                                        {formatCurrency(module.total, clientInfo.currency)}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {pageChunk.isLastPage && (
                        <div className="mt-8">
                            {/* Footer Section Grid */}
                            <div className="grid gap-8 mb-4  relative pb-6">
                                {/* Left Side: Bank Details */}
                                <div>
                                    
                                    {/* <div className="border border-purple-100 rounded-lg p-3 mb-4 bg-purple-50 shadow-sm">
                                        <h3 className="font-bold text-cravora-purple text-base mb-2">
                                            Bank Details
                                        </h3>
                                        <div className="grid grid-cols-[100px_1fr] gap-x-2 gap-y-1 text-xs">
                                            <span className="font-semibold text-gray-900">Account Name:</span>
                                            <span className="font-medium text-gray-800">CRAVORA SOLUTIONS</span>
                                            <span className="font-semibold text-gray-900">Bank Name:</span>
                                            <span className="font-medium text-gray-800">KOTAK MAHINDRA BANK LIMITED</span>
                                            <span className="font-semibold text-gray-900">Account No:</span>
                                            <span className="font-medium text-gray-800">0051752538</span>
                                            <span className="font-semibold text-gray-900">IFSC Code:</span>
                                            <span className="font-medium text-gray-800">KKBK0002563</span>
                                            <span className="font-semibold text-gray-900">Branch:</span>
                                            <span className="font-medium text-gray-800">ODHAV BRANCH AHMEDABAD, GUJARAT</span>
                                        </div>
                                    </div> */}
                                </div>

                                {/* Right Side: Pricing Summary */}
                                <div>
                                    <div className="space-y-3 mb-4 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-gray-700 font-semibold uppercase">SUB TOTAL</span>
                                            <span className="font-medium text-gray-800 whitespace-nowrap">
                                                {formatCurrency(subtotal, clientInfo.currency)}
                                            </span>
                                        </div>

                                        {discountRate > 0 && (
                                            <div className="flex justify-between text-[#28a745]">
                                                <span>DISCOUNT {discountRate}%</span>
                                                <span className="whitespace-nowrap">
                                                    - {formatCurrency(discountAmount, clientInfo.currency)}
                                                </span>
                                            </div>
                                        )}

                                        {taxAmount > 0 && (
                                            <div className="flex justify-between text-gray-600">
                                                <span className="uppercase">TAX ({tax}%)</span>
                                                <span className="whitespace-nowrap">
                                                    + {formatCurrency(taxAmount, clientInfo.currency)}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center border-t border-gray-200 pt-3 mb-4">
                                        <span className="text-lg text-gray-800 font-bold uppercase">GRAND TOTAL</span>
                                        <span className="text-2xl font-bold text-gray-900 whitespace-nowrap">
                                            {formatCurrency(grandTotal, clientInfo.currency)}
                                        </span>
                                    </div>

                                    <div>
                                        <span className="text-gray-400 text-xs block mb-1">Invoice Total (in words)</span>
                                        <span className="font-medium text-gray-800 text-sm block">
                                            {clientInfo.currency === 'INR' ? numberToWords(grandTotal) : numberToWords(grandTotal).replace('Rupees Only', 'Dollars Only')}
                                        </span>
                                    </div>
                                </div>

                                {/* Decorative background bottom matching the purple gradient blur effect */}
                                <div
                                    className="absolute pointer-events-none"
                                    style={{ borderRadius: '0 0 1rem 1rem' }}
                                />
                                      <div className="bg-[#fbf7ff] rounded-2xl p-6 mt-10 mb-2">
                                <h3 className="font-bold text-cravora-purple text-sm mb-3">
                                    Terms and conditions:
                                </h3>
                                <ul className="space-y-2 text-gray-600 text-xs text-left pl-1">
                                    {termsAndConditions.map((term, i) => {
                                        if (term.trim() === '') return null;
                                        
                                        return (
                                            <li key={i} className="flex items-start">
                                                <span className="shrink-0 font-bold mr-2.5 leading-relaxed">&bull;</span>
                                                <span className="leading-relaxed flex-1">{term}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                            </div>

                            {/* Full-width Terms and Conditions Section matching the provided design */}
                            
                      
                        </div>
                    )}

                    {/* Footer Area for all pages */}
                    <div
                        className="absolute left-0 right-0 text-center text-[11px] text-cravora-purple/80 space-y-1"
                        style={{ bottom: '1rem', position: 'absolute' }}
                    >
                        {pageChunk.isLastPage && (
                            <div className="font-medium text-cravora-purple">
                                Thank you for doing business with us. 
                            </div>
                            
                        )}
                        <div>
                            For any enquiries, email us on{' '}
                            <span className="font-bold text-cravora-purple">info@cravorasolutions.com</span>{' '}
                            or call us on{' '}
                            <span className="font-bold text-cravora-purple">+91 95123 62944</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
