import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '../utils/currency';
import { numberToWords } from '../utils/numberToWords';
import { loadPaymentProfile } from '../utils/paymentProfile';

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
    issuedAt?: string | null;
    validUntil?: string | null;
    notes?: string;
    gstDetails?: any;
    amountPaid?: number;
    balanceDue?: number;
    dueDate?: string | null;
    includeSignature?: boolean;
}

const PURPLE = '#6D4AFF';
const PURPLE_DARK = '#5536E0';
const SOFT = '#F4F2FF';

function useClearLogo(src: string) {
    const [url, setUrl] = useState('');
    useEffect(() => {
        let cancelled = false;
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d');
            if (!context) return;
            context.drawImage(image, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            const data = pixels.data;
            let minX = canvas.width;
            let minY = canvas.height;
            let maxX = 0;
            let maxY = 0;
            for (let y = 0; y < canvas.height; y += 1) {
                for (let x = 0; x < canvas.width; x += 1) {
                    const index = (y * canvas.width + x) * 4;
                    if (data[index] < 28 && data[index + 1] < 28 && data[index + 2] < 28) {
                        data[index + 3] = 0;
                    } else if (data[index + 3] > 12) {
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            context.putImageData(pixels, 0, 0);
            const pad = 4;
            const sx = Math.max(0, minX - pad);
            const sy = Math.max(0, minY - pad);
            const sw = Math.max(1, Math.min(canvas.width - sx, maxX - minX + 1 + pad * 2));
            const sh = Math.max(1, Math.min(canvas.height - sy, maxY - minY + 1 + pad * 2));
            const cropped = document.createElement('canvas');
            cropped.width = sw;
            cropped.height = sh;
            cropped.getContext('2d')?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
            if (!cancelled) setUrl(cropped.toDataURL('image/png'));
        };
        image.src = src;
        return () => { cancelled = true; };
    }, [src]);
    return url;
}

interface PagePlan {
    start: number;
    end: number;
    intro: boolean;
    footer: boolean;
}

function blockHeight(element: HTMLElement | null) {
    if (!element) return 0;
    const style = getComputedStyle(element);
    return element.offsetHeight + parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0');
}

function planPages(contentHeight: number, introHeight: number, continuedHeight: number, headHeight: number, footerHeight: number, rowHeights: number[]) {
    const slack = 6;
    const firstRoom = Math.max(0, contentHeight - introHeight - slack);
    const nextRoom = Math.max(0, contentHeight - continuedHeight - slack);
    const page1WithFooter = firstRoom - headHeight - footerHeight;
    const page1Rows = firstRoom - headHeight;
    const page2Rows = nextRoom - headHeight - footerHeight;
    if (rowHeights.length === 0) {
        return { pages: [{ start: 0, end: 0, intro: true, footer: true }] as PagePlan[], overflow: false };
    }

    const total = rowHeights.reduce((sum, height) => sum + height, 0);
    if (total <= page1WithFooter) {
        return { pages: [{ start: 0, end: rowHeights.length, intro: true, footer: true }], overflow: false };
    }

    let used = 0;
    let count = 0;
    while (count < rowHeights.length && used + rowHeights[count] <= page1Rows) {
        used += rowHeights[count];
        count += 1;
    }
    if (count >= rowHeights.length) {
        return {
            pages: [
                { start: 0, end: rowHeights.length, intro: true, footer: false },
                { start: rowHeights.length, end: rowHeights.length, intro: false, footer: true },
            ],
            overflow: false,
        };
    }

    const rest = rowHeights.slice(count).reduce((sum, height) => sum + height, 0);
    return {
        pages: [
            { start: 0, end: count, intro: true, footer: false },
            { start: count, end: rowHeights.length, intro: false, footer: true },
        ],
        overflow: rest > page2Rows,
    };
}

function clipText(value: string, max: number) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (!clean || max <= 0) return '';
    const sliced = clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
    return sliced.replace(/[^\s]{28,}/g, (word) => word.replace(/(.{28})/g, '$1 ').trim());
}

function safeDate(value: string | null | undefined, pattern: string) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return format(date, pattern);
}

export default function PdfDocument(props: PdfDocumentProps) {
    const logo = useClearLogo('/logo-header.png');
    const isInvoice = props.documentType === 'Billing' || props.documentType === 'Invoice';
    const currency = props.clientInfo?.currency === 'USD' ? 'USD' : 'INR';
    const money = (amount: number) => formatCurrency(amount || 0, currency);
    const rateLabel = currency === 'USD' ? 'Rate ($)' : 'Rate (₹)';
    const amountLabel = currency === 'USD' ? 'Amount ($)' : 'Amount (₹)';
    const issued = safeDate(props.issuedAt, 'dd MMM yyyy') || format(new Date(), 'dd MMM yyyy');
    const issuedLong = safeDate(props.issuedAt, 'dd MMMM yyyy') || format(new Date(), 'dd MMMM yyyy');
    const due = safeDate(props.dueDate, 'dd MMM yyyy') || safeDate(props.validUntil, 'dd MMM yyyy');
    const valid = safeDate(props.validUntil, 'dd MMM yyyy');
    const words = currency === 'INR'
        ? numberToWords(props.grandTotal || 0)
        : numberToWords(props.grandTotal || 0).replace('Rupees', 'Dollars');
    const terms = (props.termsAndConditions || []).filter((term) => String(term || '').trim()).slice(0, 8).map((term) => clipText(term, 180));
    const modules = props.modules || [];
    const signature = modules.map((module) => `${module?.id || ''}:${module?.name || ''}:${module?.description || ''}`).join('|');
    const [density, setDensity] = useState({ signature: '', compact: false });
    const compact = density.signature === signature && density.compact;
    const lines = modules.map((module) => ({
        ...module,
        name: clipText(module?.name, compact ? 42 : 60),
        description: clipText(module?.description, compact ? 0 : 90),
    }));
    const measureRef = useRef<HTMLDivElement>(null);
    const [pages, setPages] = useState<PagePlan[]>([{ start: 0, end: lines.length, intro: true, footer: true }]);
    const unpaid = (props.balanceDue ?? props.grandTotal ?? 0) > 0;
    const sellerGstin = props.clientInfo?.gstNumber || props.clientInfo?.clientGstNumber || '—';

    useLayoutEffect(() => {
        const root = measureRef.current;
        if (!root) return;
        const pageBox = root.querySelector<HTMLElement>('[data-page-box]');
        const intro = root.querySelector<HTMLElement>('[data-intro-box]');
        const continued = root.querySelector<HTMLElement>('[data-continued-box]');
        const table = root.querySelector<HTMLElement>('[data-head-box]');
        const head = table?.querySelector<HTMLElement>('thead') || null;
        const footer = root.querySelector<HTMLElement>('[data-footer-box]');
        const rows = [...root.querySelectorAll<HTMLElement>('[data-row]')];
        if (!pageBox) return;
        const style = getComputedStyle(pageBox);
        const contentHeight = pageBox.clientHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0');
        const tableMargin = table ? parseFloat(getComputedStyle(table).marginTop || '0') : 0;
        const next = planPages(
            contentHeight,
            blockHeight(intro),
            blockHeight(continued),
            blockHeight(head) + tableMargin,
            blockHeight(footer),
            rows.map((row) => row.offsetHeight),
        );
        if (next.overflow && !compact) {
            setDensity({ signature, compact: true });
            return;
        }
        setPages((current) => JSON.stringify(current) === JSON.stringify(next.pages) ? current : next.pages);
    }, [lines, terms, logo, isInvoice, props.grandTotal, props.clientInfo, props.quotationId, props.discountRate, props.amountPaid, compact, signature]);

    const renderClosing = () => (
        <>
            <div style={{ marginLeft: 'auto', width: '78mm', paddingTop: '2mm' }}>
                <TotalLine label="Sub Total" value={money(props.subtotal)} />
                {props.discountRate > 0 && <TotalLine label={`Discount (${props.discountRate}%)`} value={`- ${money(props.discountAmount)}`} />}
                {props.gstDetails && typeof props.gstDetails === 'object' && Object.keys(props.gstDetails).length > 0 ? (
                    (props.gstDetails.totalGstAmount || 0) > 0 ? (
                        props.gstDetails.gstType === 'inter' ? (
                            <TotalLine label={`IGST (${props.gstDetails.igstRate}%)`} value={money(props.gstDetails.igstAmount || 0)} />
                        ) : (
                            <>
                                <TotalLine label={`CGST (${props.gstDetails.cgstRate}%)`} value={money(props.gstDetails.cgstAmount || 0)} />
                                <TotalLine label={`SGST (${props.gstDetails.sgstRate}%)`} value={money(props.gstDetails.sgstAmount || 0)} />
                            </>
                        )
                    ) : null
                ) : props.taxAmount > 0 ? (
                    <TotalLine label={`Tax (${props.tax}%)`} value={money(props.taxAmount)} />
                ) : null}
            </div>
            <div style={{ marginTop: '3mm', marginLeft: 'auto', width: '118mm', background: SOFT, borderRadius: '12px', padding: '3mm 4mm' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ color: PURPLE_DARK, fontWeight: 800, letterSpacing: '0.04em', fontSize: '14px' }}>GRAND TOTAL</div>
                    <div style={{ width: '1px', height: '10mm', background: '#ddd8ff', margin: '0 5mm' }} />
                    <div style={{ color: PURPLE_DARK, fontWeight: 800, fontSize: '22px', whiteSpace: 'nowrap' }}>{money(props.grandTotal)}</div>
                </div>
                <div style={{ marginTop: '2mm', fontSize: '10px', color: '#6b7280', lineHeight: 1.45 }}>
                    <span style={{ color: '#9aa0ad' }}>(In Words)</span> {words}
                </div>
            </div>
            {isInvoice && typeof props.amountPaid === 'number' && (
                <div style={{ marginTop: '3mm', marginLeft: 'auto', width: '78mm', fontSize: '11px' }}>
                    <TotalLine label="Amount paid" value={money(props.amountPaid)} />
                    <TotalLine label="Balance due" value={money(props.balanceDue || 0)} />
                </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4mm', marginTop: '4mm' }}>
                {isInvoice ? <PaymentCard /> : <TermsCard terms={terms} />}
                {isInvoice ? <TermsCard terms={terms} /> : <PaymentCard />}
            </div>
            <Footer invoice={isInvoice} signature={props.includeSignature} />
        </>
    );

    return (
        <div id={props.id || 'pdf-content'} style={{ width: '210mm', margin: '0 auto', position: 'relative' }}>
            <div ref={measureRef} aria-hidden style={{ position: 'absolute', left: '-2400px', top: 0, width: '210mm', fontFamily: "'Poppins', sans-serif", color: '#1f2430' }}>
                <div data-page-box style={{ width: '210mm', height: '297mm', boxSizing: 'border-box', padding: '10mm 12mm 8mm' }} />
                <div data-intro-box style={{ width: '186mm' }}>
                    <Header logo={logo} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: '6mm', marginTop: '4mm' }}>
                        <BillTo clientInfo={props.clientInfo} invoice={isInvoice} />
                        {isInvoice ? (
                            <InvoiceMeta dateLabel={issued} dueLabel={due || '—'} number={props.quotationId} gstin={sellerGstin} unpaid={unpaid} />
                        ) : (
                            <EstimateMeta number={props.quotationId} dateLabel={issued} validLabel={valid || '—'} reference={clipText(props.clientInfo?.projectName, 80) || '—'} />
                        )}
                    </div>
                </div>
                <table data-head-box style={{ width: '186mm', borderCollapse: 'collapse', marginTop: '5mm', tableLayout: 'fixed' }}>
                    <thead>
                        <tr style={{ background: PURPLE, color: '#fff' }}>
                            <th style={thStyle('8%')}>#</th>
                            <th style={{ ...thStyle('44%'), textAlign: 'left' }}>Item / Description</th>
                            <th style={thStyle('14%')}>{isInvoice ? 'Hours / Qty' : 'Qty / Hrs'}</th>
                            <th style={thStyle('16%')}>{rateLabel}</th>
                            <th style={thStyle('18%')}>{amountLabel}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((module, index) => (
                            <tr key={module.id || index} data-row style={{ borderBottom: '1px solid #eef0f4' }}>
                                <td style={cellStyle}>{String(index + 1).padStart(2, '0')}</td>
                                <td style={{ ...cellStyle, textAlign: 'left', paddingRight: '3mm' }}>
                                    <ItemCopy name={module.name} description={module.description} />
                                </td>
                                <td style={cellStyle}>{module.hours}</td>
                                <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{money(module.rate)}</td>
                                <td style={{ ...cellStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>{money(module.total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div data-footer-box style={{ width: '186mm', marginTop: '2mm' }}>{renderClosing()}</div>
                <div data-continued-box style={{ width: '186mm' }}>
                    <ContinuedHeader logo={logo} quotationId={props.quotationId || ' '} pageNumber={2} />
                </div>
            </div>
            {pages.map((page, pageIndex) => (
                <div
                    key={pageIndex}
                    data-pdf-page
                    style={{
                        width: '210mm',
                        height: '297mm',
                        overflow: 'hidden',
                        position: 'relative',
                        background: '#ffffff',
                        marginBottom: pageIndex === pages.length - 1 ? 0 : '16px',
                        boxShadow: '0 8px 30px rgba(80, 60, 160, 0.08)',
                        fontFamily: "'Poppins', sans-serif",
                        color: '#1f2430',
                    }}
                >
                    {page.intro && <BannerTitle invoice={isInvoice} quotationId={props.quotationId} dateLabel={issuedLong} />}
                    <div style={{ padding: page.intro ? '10mm 12mm 8mm' : '8mm 12mm', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
                        {page.intro ? (
                            <Header logo={logo} />
                        ) : (
                            <ContinuedHeader logo={logo} quotationId={props.quotationId} pageNumber={pageIndex + 1} />
                        )}

                        {page.intro && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: '6mm', marginTop: '4mm', flexShrink: 0 }}>
                                <BillTo clientInfo={props.clientInfo} invoice={isInvoice} />
                                {isInvoice ? (
                                    <InvoiceMeta
                                        dateLabel={issued}
                                        dueLabel={due || '—'}
                                        number={props.quotationId}
                                        gstin={sellerGstin}
                                        unpaid={unpaid}
                                    />
                                ) : (
                                    <EstimateMeta
                                        number={props.quotationId}
                                        dateLabel={issued}
                                        validLabel={valid || '—'}
                                        reference={clipText(props.clientInfo?.projectName, 80) || '—'}
                                    />
                                )}
                            </div>
                        )}

                        {page.end > page.start && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: page.intro ? '5mm' : '4mm', tableLayout: 'fixed', flexShrink: 0 }}>
                            <thead>
                                <tr style={{ background: PURPLE, color: '#fff' }}>
                                    <th style={thStyle('8%')}>#</th>
                                    <th style={{ ...thStyle('44%'), textAlign: 'left' }}>Item / Description</th>
                                    <th style={thStyle('14%')}>{isInvoice ? 'Hours / Qty' : 'Qty / Hrs'}</th>
                                    <th style={thStyle('16%')}>{rateLabel}</th>
                                    <th style={thStyle('18%')}>{amountLabel}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.slice(page.start, page.end).map((module, index) => (
                                    <tr key={`${page.start}-${index}`} style={{ borderBottom: '1px solid #eef0f4' }}>
                                        <td style={cellStyle}>{String(page.start + index + 1).padStart(2, '0')}</td>
                                        <td style={{ ...cellStyle, textAlign: 'left', paddingRight: '3mm' }}>
                                            <ItemCopy name={module.name} description={module.description} />
                                        </td>
                                        <td style={cellStyle}>{module.hours}</td>
                                        <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{money(module.rate)}</td>
                                        <td style={{ ...cellStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>{money(module.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        )}
                        {page.end === page.start && page.intro && (
                            <div style={{ textAlign: 'center', padding: '8mm', color: '#6b7280', fontSize: '12px' }}>No items added</div>
                        )}

                        {page.footer && (
                            <div style={{ marginTop: page.end > page.start ? 'auto' : '6mm', flexShrink: 0 }}>
                                {renderClosing()}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

function Header({ logo }: { logo: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', minHeight: '22mm', flexShrink: 0 }}>
            <div>
                {logo ? (
                    <img src={logo} alt="Cravora Solutions" style={{ height: '16mm', width: 'auto', maxWidth: '78mm', objectFit: 'contain', display: 'block' }} />
                ) : (
                    <div style={{ height: '18mm' }} />
                )}
                <div style={{ marginTop: '0.6mm', fontSize: '9px', letterSpacing: '0.16em', color: '#8b90a0', fontWeight: 600 }}>WEB · APP · IT SOLUTIONS</div>
            </div>
        </div>
    );
}

function BannerTitle({ invoice, quotationId, dateLabel }: { invoice: boolean; quotationId: string; dateLabel: string }) {
    return (
        <div style={{ position: 'absolute', top: 0, right: 0, width: '112mm', height: '30mm' }}>
            <svg viewBox="0 0 440 120" preserveAspectRatio="none" width="100%" height="100%" aria-hidden>
                <polygon points="78,0 440,0 440,120 0,120" fill="#C4B5FD" />
                <polygon points="132,0 440,0 440,120 48,120" fill="#6D4AFF" />
            </svg>
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: '28mm', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', paddingRight: '8mm', color: '#fff', textAlign: 'right' }}>
                <div style={{ fontSize: invoice ? '16px' : '14px', fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1.2 }}>{invoice ? 'TAX INVOICE' : 'ESTIMATE / QUOTATION'}</div>
                <div style={{ marginTop: '0.8mm', fontSize: '12px', fontWeight: 600 }}>{invoice ? quotationId : `# ${quotationId}`}</div>
                <div style={{ fontSize: '11px', opacity: 0.92 }}>{dateLabel}</div>
            </div>
        </div>
    );
}

function ItemCopy({ name, description }: { name: string; description: string }) {
    return (
        <>
            <div style={{ fontWeight: 650, color: '#1f2430', lineHeight: 1.35, wordBreak: 'normal', overflowWrap: 'break-word' }}>{name}</div>
            {description ? (
                <div style={{ marginTop: '0.8mm', fontSize: '10px', color: '#6b7280', lineHeight: 1.35, wordBreak: 'normal', overflowWrap: 'break-word' }}>{description}</div>
            ) : null}
        </>
    );
}

function ContinuedHeader({ logo, quotationId, pageNumber }: { logo: string; quotationId: string; pageNumber: number }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${PURPLE}`, paddingBottom: '3mm', marginBottom: '4mm' }}>
            {logo ? <img src={logo} alt="Cravora Solutions" style={{ height: '12mm', objectFit: 'contain' }} /> : <div />}
            <div style={{ textAlign: 'right', fontSize: '11px', color: '#4b5160' }}>
                <div style={{ fontWeight: 700, color: PURPLE_DARK }}>{quotationId}</div>
                <div>Page {pageNumber}</div>
            </div>
        </div>
    );
}

function BillTo({ clientInfo, invoice }: { clientInfo: any; invoice: boolean }) {
    return (
        <div style={{ background: invoice ? 'transparent' : SOFT, borderRadius: '12px', padding: invoice ? '0' : '3mm 4mm' }}>
            <div style={{ color: PURPLE, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em' }}>BILL TO</div>
            <div style={{ marginTop: '2mm', fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.3, wordBreak: 'normal', overflowWrap: 'break-word' }}>{clipText(clientInfo?.clientName, 80)}</div>
            {clientInfo?.clientAddress ? <div style={{ marginTop: '1.5mm', fontSize: '11px', color: '#4b5160', lineHeight: 1.45, wordBreak: 'normal', overflowWrap: 'break-word' }}>{clipText(clientInfo.clientAddress, 160)}</div> : null}
            {clientInfo?.clientGstNumber ? <div style={{ marginTop: '2mm', fontSize: '11px', fontWeight: 700 }}>GSTIN <span style={{ fontWeight: 500 }}> : {clientInfo.clientGstNumber}</span></div> : null}
        </div>
    );
}

function EstimateMeta({ number, dateLabel, validLabel, reference }: { number: string; dateLabel: string; validLabel: string; reference: string }) {
    const rows = [
        ['Estimate No.', number],
        ['Estimate Date', dateLabel],
        ['Valid Until', validLabel],
        ['Reference', reference],
        ['Prepared By', 'Cravora Solutions'],
    ];
    return (
        <div style={{ background: SOFT, borderRadius: '12px', padding: '3mm 4mm' }}>
            <div style={{ color: PURPLE, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '2mm' }}>ESTIMATE DETAILS</div>
            {rows.map(([label, value]) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '28mm 4mm 1fr', fontSize: '11px', marginBottom: '1mm', lineHeight: 1.3 }}>
                    <span style={{ color: '#667085' }}>{label}</span>
                    <span>:</span>
                    <span style={{ fontWeight: 650, wordBreak: 'normal', overflowWrap: 'break-word' }}>{value}</span>
                </div>
            ))}
        </div>
    );
}

function InvoiceMeta({ dateLabel, dueLabel, number, gstin, unpaid }: { dateLabel: string; dueLabel: string; number: string; gstin: string; unpaid: boolean }) {
    return (
        <div style={{ background: '#F7F8FC', border: '1px solid #ECEEF5', borderRadius: '12px', padding: '4mm' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3mm 4mm' }}>
                <MetaCell label="Invoice Date" value={dateLabel} />
                <MetaCell label="Payment Due" value={dueLabel} />
                <MetaCell label="Invoice No." value={number} />
                <MetaCell label="GSTIN" value={gstin} />
            </div>
            <div style={{ marginTop: '3mm', display: 'flex', alignItems: 'center', gap: '2mm', fontSize: '11px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: unpaid ? PURPLE : '#16a34a', display: 'inline-block' }} />
                <span style={{ color: '#667085' }}>Status</span>
                <span style={{ marginLeft: '2mm', background: unpaid ? '#EDE9FE' : '#DCFCE7', color: unpaid ? PURPLE_DARK : '#15803d', borderRadius: '999px', padding: '0.5mm 2.5mm', fontSize: '10px', fontWeight: 800 }}>{unpaid ? 'UNPAID' : 'PAID'}</span>
            </div>
        </div>
    );
}

function MetaCell({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div style={{ fontSize: '10px', color: '#8b90a0' }}>{label}</div>
            <div style={{ fontSize: '12px', fontWeight: 700, marginTop: '0.6mm', wordBreak: 'normal', overflowWrap: 'break-word' }}>{value}</div>
        </div>
    );
}

function TotalLine({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4mm', fontSize: '12px', marginBottom: '1.4mm', color: '#4b5160' }}>
            <span>{label}</span>
            <span style={{ fontWeight: 650, whiteSpace: 'nowrap' }}>{value}</span>
        </div>
    );
}

function TermsCard({ terms }: { terms: string[] }) {
    return (
        <div style={{ background: SOFT, borderRadius: '12px', padding: '3mm 4mm' }}>
            <div style={{ color: PURPLE, fontWeight: 800, fontSize: '11px', letterSpacing: '0.06em', marginBottom: '2mm' }}>TERMS & CONDITIONS</div>
            {terms.length === 0 ? <div style={{ fontSize: '11px', color: '#6b7280' }}>No terms added.</div> : terms.map((term, index) => (
                <div key={index} style={{ display: 'flex', gap: '2mm', marginBottom: '0.7mm', fontSize: '10px', color: '#4b5160', lineHeight: 1.25 }}>
                    <span style={{ width: '4.5mm', height: '4.5mm', borderRadius: '50%', background: '#E4E0FF', color: PURPLE_DARK, fontWeight: 700, fontSize: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{index + 1}</span>
                    <span style={{ wordBreak: 'normal', overflowWrap: 'break-word' }}>{term}</span>
                </div>
            ))}
        </div>
    );
}

function PaymentCard() {
    const profile = loadPaymentProfile();
    const rows = [
        ['Bank Name', profile.bankName],
        ['Account Name', profile.accountName],
        ['Account No.', profile.accountNumber],
        ['IFSC Code', profile.ifsc],
        ['UPI ID', profile.upiId],
    ].filter(([, value]) => String(value || '').trim());
    return (
        <div style={{ border: '1px solid #ECEEF5', borderRadius: '12px', padding: '3mm 4mm', display: 'flex', gap: '3mm' }}>
            <div style={{ flex: 1 }}>
                <div style={{ color: PURPLE, fontWeight: 800, fontSize: '11px', letterSpacing: '0.06em', marginBottom: '3mm' }}>PAYMENT DETAILS</div>
                {rows.map(([label, value]) => (
                    <div key={label} style={{ display: 'grid', gridTemplateColumns: '24mm 3mm 1fr', fontSize: '10px', marginBottom: '1.3mm' }}>
                        <span style={{ color: '#667085' }}>{label}</span>
                        <span>:</span>
                        <span style={{ fontWeight: 650 }}>{value}</span>
                    </div>
                ))}
            </div>
            <div style={{ width: '22mm', textAlign: 'center' }}>
                {profile.qrDataUrl ? (
                    <img src={profile.qrDataUrl} alt="Payment QR" style={{ width: '18mm', height: '18mm', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
                ) : (
                    <QrMark />
                )}
                <div style={{ fontSize: '10px', fontWeight: 800, marginTop: '1mm' }}>Scan to Pay</div>
                <div style={{ fontSize: '8px', color: '#8b90a0' }}>UPI · Bank Transfer</div>
            </div>
        </div>
    );
}

function QrMark() {
    const cells = [
        '111011101',
        '100010001',
        '101110101',
        '101010101',
        '101110101',
        '100000001',
        '111011101',
        '000100000',
        '110101011',
    ];
    return (
        <svg viewBox="0 0 9 9" width="68" height="68" style={{ display: 'block', margin: '0 auto' }}>
            {cells.map((row, y) => row.split('').map((cell, x) => cell === '1' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#241b4a" /> : null))}
        </svg>
    );
}

function Footer({ invoice, signature }: { invoice: boolean; signature?: boolean }) {
    return (
        <div style={{ borderTop: '1px solid #eceef3', marginTop: '4mm', paddingTop: '3mm' }}>
            {signature && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8mm', marginBottom: '3mm', fontSize: '10px', color: '#4b5160' }}>
                    <span>Digital Signature: _________________</span>
                    <span>Date: _________________</span>
                </div>
            )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '6mm', fontSize: '10px' }}>
            <div>
                <div style={{ color: PURPLE_DARK, fontWeight: 800 }}>{invoice ? 'Thank you for doing business with us!' : 'Thank you for considering Cravora Solutions!'}</div>
                <div style={{ color: '#8b90a0', marginTop: '0.8mm' }}>{invoice ? 'For any enquiries, feel free to reach out.' : 'We look forward to working with you.'}</div>
            </div>
            <div style={{ textAlign: 'right', color: '#4b5160', lineHeight: 1.6 }}>
                <div>info@cravorasolutions.com</div>
                <div>+91 95123 62944</div>
                <div>www.cravorasolutions.com</div>
            </div>
        </div>
        </div>
    );
}

function thStyle(width: string): CSSProperties {
    return { width, padding: '2.4mm 2mm', fontSize: '11px', fontWeight: 650, textAlign: 'center' };
}

const cellStyle: CSSProperties = {
    padding: '1.5mm 2mm',
    fontSize: '11px',
    textAlign: 'center',
    verticalAlign: 'top',
    color: '#374151',
};
