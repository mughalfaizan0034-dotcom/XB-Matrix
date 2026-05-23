import { jsPDF } from 'jspdf';

/**
 * Branded PDF generator for the upload templates guide.
 *
 * Produces a navy-branded multi-page document, NOT a plain text dump.
 * Navy header band, xB badge, section headings in brand navy, a
 * "Powered by Xcelerate Brands" footer on every page.
 */

const NAVY: [number, number, number] = [15, 45, 75];      // #0F2D4B
const ORANGE: [number, number, number] = [234, 110, 46];  // accent
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const LIGHT: [number, number, number] = [241, 245, 249];

export interface GuideDataset {
  readonly title: string;
  readonly description: string;
  readonly columns: ReadonlyArray<string>;
  readonly validationRules: ReadonlyArray<string>;
  readonly comingSoon?: boolean;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;
const CONTENT_W = PAGE_W - MARGIN * 2;

export function generateUploadGuidePdf(datasets: ReadonlyArray<GuideDataset>): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 0;

  // ---- Cover header band -------------------------------------------
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, 52, 'F');

  // xB badge
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGIN, 16, 14, 14, 2.5, 2.5, 'F');
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('xB', MARGIN + 7, 25.5, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('xB Matrix', MARGIN + 20, 23);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(200, 214, 229);
  doc.text('Upload Templates Guide', MARGIN + 20, 30);

  // Orange accent rule
  doc.setFillColor(...ORANGE);
  doc.rect(0, 52, PAGE_W, 1.4, 'F');

  y = 66;

  // ---- Intro --------------------------------------------------------
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const intro =
    'Upload one file per operational dataset. A single file carries every marketplace, ' +
    'the marketplace column inside the file is what the engine uses for all calculations. ' +
    'There are no per-marketplace uploads. Fill the template, then upload it from the ' +
    'Upload Files tab.';
  const introLines = doc.splitTextToSize(intro, CONTENT_W);
  doc.text(introLines, MARGIN, y);
  y += introLines.length * 5 + 6;

  // ---- Per-dataset sections ----------------------------------------
  for (const ds of datasets) {
    const estimated =
      14 + ds.columns.length * 0 + 8 + ds.validationRules.length * 5 + 28;
    if (y + estimated > PAGE_H - 24) {
      doc.addPage();
      y = MARGIN + 6;
    }

    // Section heading bar
    doc.setFillColor(...LIGHT);
    doc.rect(MARGIN, y - 5, CONTENT_W, 9, 'F');
    doc.setFillColor(...NAVY);
    doc.rect(MARGIN, y - 5, 1.6, 9, 'F');
    doc.setTextColor(...NAVY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(ds.title + (ds.comingSoon ? '  (coming soon)' : ''), MARGIN + 4, y + 1);
    y += 11;

    // Description
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const descLines = doc.splitTextToSize(ds.description, CONTENT_W);
    doc.text(descLines, MARGIN, y);
    y += descLines.length * 4.4 + 4;

    if (ds.columns.length > 0) {
      doc.setTextColor(...INK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('COLUMNS', MARGIN, y);
      y += 4.5;
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      const colLine = ds.columns.join('  ·  ');
      const colLines = doc.splitTextToSize(colLine, CONTENT_W);
      doc.text(colLines, MARGIN, y);
      y += colLines.length * 4 + 4;
    }

    if (ds.validationRules.length > 0) {
      doc.setTextColor(...INK);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('VALIDATION RULES', MARGIN, y);
      y += 4.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      for (const rule of ds.validationRules) {
        const ruleLines = doc.splitTextToSize(rule, CONTENT_W - 5);
        doc.setFillColor(...ORANGE);
        doc.circle(MARGIN + 1, y - 1.1, 0.7, 'F');
        doc.text(ruleLines, MARGIN + 5, y);
        y += ruleLines.length * 4.4;
      }
      y += 4;
    }

    y += 6;
  }

  // ---- Footer on every page ----------------------------------------
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LIGHT);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, PAGE_H - 16, PAGE_W - MARGIN, PAGE_H - 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text('Powered by Xcelerate Brands', MARGIN, PAGE_H - 10);
    doc.text(`Page ${p} of ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 10, { align: 'right' });
  }

  doc.save('xb-matrix-upload-guide.pdf');
}
