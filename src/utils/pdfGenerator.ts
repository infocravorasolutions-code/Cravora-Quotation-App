import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface PDFOptions {
  template?: 'modern' | 'classic' | 'minimal';
  includeSignature?: boolean;
  watermark?: string;
  quality?: 'high' | 'medium' | 'low';
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

  console.log('Generating PDF for element:', element);
  console.log('Element dimensions:', {
    offsetWidth: element.offsetWidth,
    offsetHeight: element.offsetHeight,
    scrollWidth: element.scrollWidth,
    scrollHeight: element.scrollHeight
  });

  // Enhanced canvas options based on quality setting
  const qualitySettings = {
    high: { scale: 3, dpi: 300 },
    medium: { scale: 2, dpi: 200 },
    low: { scale: 1.5, dpi: 150 }
  };

  const settings = qualitySettings[options.quality || 'high'];

  // Ensure element is visible and has content
  if (element.offsetWidth === 0 || element.offsetHeight === 0) {
    console.warn('Element has zero dimensions, trying to make it visible');
    element.style.display = 'block';
    element.style.visibility = 'visible';
    element.style.position = 'static';
  }

  // Ensure fonts are fully loaded before rendering
  await document.fonts.ready;

    const canvas = await html2canvas(element, {
    scale: settings.scale,
    useCORS: true,
    logging: true, // Enable logging for debugging
    allowTaint: true,
    backgroundColor: '#ffffff',
    width: element.scrollWidth || element.offsetWidth,
    height: element.scrollHeight || element.offsetHeight,
    // letterRendering: true, // Not available in current version
    // foreignObjectRendering: true, // Not available in current version
    removeContainer: true,
    onclone: (clonedDoc) => {
      console.log('Cloned document:', clonedDoc);
      const clonedElement = clonedDoc.getElementById(elementId);

      // Inject Poppins font explicitly into the cloned document so html2canvas can render it
      const style = clonedDoc.createElement('style');
      style.innerHTML = `
        @font-face {
          font-family: 'Poppins';
          src: url('/fonts/Poppins-Regular.ttf') format('truetype');
          font-weight: 400;
          font-style: normal;
        }
        @font-face {
          font-family: 'Poppins';
          src: url('/fonts/Poppins-Medium.ttf') format('truetype');
          font-weight: 500;
          font-style: normal;
        }
        @font-face {
          font-family: 'Poppins';
          src: url('/fonts/Poppins-SemiBold.ttf') format('truetype');
          font-weight: 600;
          font-style: normal;
        }
        @font-face {
          font-family: 'Poppins';
          src: url('/fonts/Poppins-Bold.ttf') format('truetype');
          font-weight: 700;
          font-style: normal;
        }
        * {
          font-family: 'Poppins', sans-serif !important;
        }
      `;
      clonedDoc.head.appendChild(style);

      if (clonedElement) {
        // Strip margins that cause slice mismatches during mult-page rendering
        Array.from(clonedElement.children).forEach((child: any) => {
          child.style.marginBottom = '0px';
          child.style.boxShadow = 'none';
        });
        console.log('Cloned element found:', clonedElement);
      }
    }
  });

  console.log('Canvas created:', canvas);
  console.log('Canvas dimensions:', {
    width: canvas.width,
    height: canvas.height
  });

  const imgData = canvas.toDataURL('image/png', 1.0);
  const pdf = new jsPDF('p', 'mm', 'a4');

  // Add watermark if specified
  if (options.watermark) {
    pdf.setFontSize(50);
    pdf.setTextColor(200, 200, 200);
    pdf.text(options.watermark, 105, 150, { angle: 45, align: 'center' });
  }

  const imgWidth = 210;
  const pageHeight = 297;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  // Ignore less than 50mm of remaining trailing height to fiercely prevent floating-point rounding errors or minor padding from triggering a blank tail page
  while (heightLeft > 50) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  // Add digital signature placeholder if requested
  if (options.includeSignature) {
    const pageCount = pdf.getNumberOfPages();
    pdf.setPage(pageCount);
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.text('Digital Signature: _________________', 20, 280);
    pdf.text('Date: _________________', 120, 280);
  }

  pdf.save(filename);
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
