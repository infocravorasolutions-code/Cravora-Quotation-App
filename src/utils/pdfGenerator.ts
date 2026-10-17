import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PDFOptions {
  template?: 'modern' | 'classic' | 'minimal';
  includeSignature?: boolean;
  watermark?: string;
  quality?: 'high' | 'medium' | 'low';
  download?: boolean;
}

export async function generatePDF(
  elementId: string,
  filename: string,
  options: PDFOptions = {}
) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error('Element not found with ID:', elementId);
    throw new Error(`Element with ID '${elementId}' not found`);
  }

  // Ensure element is visible and has content
  if (element.offsetWidth === 0 || element.offsetHeight === 0) {
    element.style.display = 'block';
    element.style.visibility = 'visible';
    element.style.position = 'static';
  }

  await document.fonts.ready;

  const scale = options.quality === 'low' ? 1.5 : options.quality === 'medium' ? 2 : 2;
  const sheets = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-page]'));
  const targets = sheets.length > 0 ? sheets : [element];
  const pdf = new jsPDF('p', 'mm', 'a4');

  const painted = targets.filter((sheet) => (sheet.innerText || '').trim().length > 0);
  const scaledAncestors: { node: HTMLElement; transform: string }[] = [];
  let ancestor: HTMLElement | null = element.parentElement;
  while (ancestor && ancestor !== document.body) {
    if (ancestor.style.transform) {
      scaledAncestors.push({ node: ancestor, transform: ancestor.style.transform });
      ancestor.style.transform = 'none';
    }
    ancestor = ancestor.parentElement;
  }
  for (let index = 0; index < painted.length; index += 1) {
    const sheet = painted[index];
    const previous = {
      position: sheet.style.position,
      left: sheet.style.left,
      top: sheet.style.top,
      zIndex: sheet.style.zIndex,
    };
    sheet.style.position = 'fixed';
    sheet.style.left = '0';
    sheet.style.top = '0';
    sheet.style.zIndex = '10000';
    const canvas = await html2canvas(sheet, {
      scale,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: sheet.offsetWidth,
      height: sheet.offsetHeight,
      windowWidth: sheet.offsetWidth,
      windowHeight: sheet.offsetHeight,
      scrollX: 0,
      scrollY: 0,
    });
    sheet.style.position = previous.position;
    sheet.style.left = previous.left;
    sheet.style.top = previous.top;
    sheet.style.zIndex = previous.zIndex;
    const image = canvas.toDataURL('image/jpeg', 0.95);
    if (index > 0) pdf.addPage();
    pdf.addImage(image, 'JPEG', 0, 0, 210, 297);
  }
  scaledAncestors.forEach(({ node, transform }) => {
    node.style.transform = transform;
  });

  if (options.watermark) {
    const pageCount = pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page);
      pdf.setFontSize(48);
      pdf.setTextColor(210, 210, 210);
      pdf.text(options.watermark, 105, 150, { angle: 45, align: 'center' });
    }
  }

  const blob = pdf.output('blob');
  if (options.download !== false) pdf.save(filename);
  return blob;
}

// Enhanced PDF generation with templates
export async function generateEnhancedPDF(
  data: any,
  filename: string,
  template: 'modern' | 'classic' | 'minimal' = 'modern'
) {
  const pdf = new jsPDF('p', 'mm', 'a4');

  // Set up fonts and colors based on template
  const templateStyles = {
    modern: {
      primaryColor: [59, 130, 246], // Blue
      secondaryColor: [107, 114, 128], // Gray
      headerFont: 'helvetica',
      bodyFont: 'helvetica'
    },
    classic: {
      primaryColor: [0, 0, 0], // Black
      secondaryColor: [75, 85, 99], // Dark gray
      headerFont: 'times',
      bodyFont: 'times'
    },
    minimal: {
      primaryColor: [31, 41, 55], // Dark gray
      secondaryColor: [107, 114, 128], // Gray
      headerFont: 'helvetica',
      bodyFont: 'helvetica'
    }
  };

  const styles = templateStyles[template];

  // Header
  pdf.setFillColor(styles.primaryColor[0], styles.primaryColor[1], styles.primaryColor[2]);
  pdf.rect(0, 0, 210, 30, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(24);
  pdf.setFont(styles.headerFont, 'bold');
  pdf.text('Cravora Solutions', 20, 20);

  pdf.setFontSize(10);
  pdf.setFont(styles.headerFont, 'normal');
  pdf.text('Professional Quotation System', 20, 25);

  // Quotation ID and Date
  pdf.text(`Quotation: ${data.quotationId}`, 150, 15);
  pdf.text(`Date: ${new Date().toLocaleDateString()}`, 150, 20);

  // Reset colors
  pdf.setTextColor(styles.secondaryColor[0], styles.secondaryColor[1], styles.secondaryColor[2]);

  // Client Information
  let yPosition = 50;
  pdf.setFontSize(14);
  pdf.setFont(styles.bodyFont, 'bold');
  pdf.text('Bill To:', 20, yPosition);

  yPosition += 10;
  pdf.setFontSize(12);
  pdf.setFont(styles.bodyFont, 'normal');
  pdf.text(data.clientInfo.clientName, 20, yPosition);
  pdf.text(data.clientInfo.clientEmail, 20, yPosition + 5);

  // Project Details
  pdf.setFont(styles.bodyFont, 'bold');
  pdf.text('Project:', 110, yPosition);
  pdf.setFont(styles.bodyFont, 'normal');
  pdf.text(data.clientInfo.projectName, 110, yPosition + 5);

  // Modules Table
  yPosition += 30;
  pdf.setFont(styles.bodyFont, 'bold');
  pdf.setFontSize(12);
  pdf.text('Modules & Services', 20, yPosition);

  yPosition += 10;

  // Table headers
  pdf.setFillColor(240, 240, 240);
  pdf.rect(20, yPosition - 5, 170, 8, 'F');

  pdf.setFontSize(10);
  pdf.setFont(styles.bodyFont, 'bold');
  pdf.text('Description', 22, yPosition);
  pdf.text('Hours', 120, yPosition);
  pdf.text('Rate', 140, yPosition);
  pdf.text('Amount', 170, yPosition);

  yPosition += 8;

  // Table rows
  data.modules.forEach((module: any) => {
    if (yPosition > 250) {
      pdf.addPage();
      yPosition = 20;
    }

    pdf.setFont(styles.bodyFont, 'normal');
    pdf.text(module.name, 22, yPosition);
    pdf.text(module.hours.toString(), 120, yPosition);
    pdf.text(formatCurrency(module.rate, data.clientInfo.currency), 140, yPosition);
    pdf.text(formatCurrency(module.total, data.clientInfo.currency), 170, yPosition);

    yPosition += 6;
  });

  // Totals
  yPosition += 10;
  pdf.setFont(styles.bodyFont, 'bold');
  pdf.text(`Subtotal: ${formatCurrency(data.subtotal, data.clientInfo.currency)}`, 120, yPosition);
  pdf.text(`Buffer (${data.buffer}%): ${formatCurrency(data.bufferAmount, data.clientInfo.currency)}`, 120, yPosition + 5);
  pdf.text(`Tax (${data.tax}%): ${formatCurrency(data.taxAmount, data.clientInfo.currency)}`, 120, yPosition + 10);
  pdf.text(`Total: ${formatCurrency(data.grandTotal, data.clientInfo.currency)}`, 120, yPosition + 15);

  pdf.save(filename);
}

// Helper function for currency formatting in PDF
function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}
