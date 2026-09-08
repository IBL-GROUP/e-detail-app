import { jsPDF } from "jspdf";
import { Platform } from "react-native";

export interface AnalyticsMetric {
  label: string;
  value: string;
  /** The figure printed under the value. Omitted when there is none. */
  change?: string;
  tone: "positive" | "negative" | "neutral";
}

/** One bar of a breakdown. `value` sizes the bar; `display` is what's printed. */
export interface BreakdownRow {
  name: string;
  value: number;
  display: string;
}

/** One report inside the document — calls, or sales. */
export interface AnalyticsReportSection {
  /** Names the report: 'Call Performance' / 'Sales Performance'. */
  viewLabel: string;
  metrics: readonly AnalyticsMetric[];
  /** The headline two-stat block: this month against the one before. */
  monthly: { title: string; thisMonth: string; previousMonth: string };
  /** Titled runs of bars, printed in order. */
  breakdowns: { title: string; rows: BreakdownRow[] }[];
  /** Shown in place of a run of bars that has no rows. */
  emptyText: string;
}

export interface AnalyticsReportData {
  dateLabel: string;
  /**
   * Printed in order, one page each. The export carries every view rather than
   * whichever was on screen, so one document is the whole picture.
   */
  sections: AnalyticsReportSection[];
}

type RGB = [number, number, number];

// Refined, restrained palette — navy accent on grays.
const INK: RGB = [17, 24, 39];
const NAVY: RGB = [30, 41, 84];
const MUTED: RGB = [100, 116, 139];
const FAINT: RGB = [148, 163, 184];
const HAIRLINE: RGB = [226, 232, 240];
const TRACK: RGB = [237, 240, 245];
// A tinted panel and the alternating row band — enough contrast to group
// things on paper without printing as grey blocks.
const CARD: RGB = [248, 250, 252];
const BAND: RGB = [246, 248, 251];
const GREEN: RGB = [21, 128, 61];
const RED: RGB = [185, 28, 28];

/** Uppercase, letter-spaced label — used for the elegant small captions. */
function tracked(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options?: { align?: "left" | "right" | "center"; space?: number },
) {
  doc.setCharSpace(options?.space ?? 0.6);
  doc.text(text, x, y, options?.align ? { align: options.align } : undefined);
  doc.setCharSpace(0);
}

/** Width of a tracked (letter-spaced) run, which is wider than the plain text. */
function trackedWidth(doc: jsPDF, text: string, space: number) {
  return doc.getTextWidth(text) + Math.max(0, text.length - 1) * space;
}

/**
 * Splits a tracked label across at most `maxLines`, measured WITH its letter
 * spacing.
 *
 * jsPDF's own splitTextToSize measures plain text, so a tracked label it calls
 * a fit still runs past the box — which is how "AVG ENGAGEMENT TIME" ended up
 * printed over the edge of its card.
 */
function wrapTracked(
  doc: jsPDF,
  text: string,
  width: number,
  space: number,
  maxLines: number,
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (trackedWidth(doc, candidate, space) <= width || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  // Anything that still does not fit is cut with an ellipsis rather than left
  // to overrun the card.
  return lines.slice(0, maxLines).map((entry, index) => {
    if (index < maxLines - 1) return entry;
    let cut = entry;
    while (cut.length > 1 && trackedWidth(doc, cut, space) > width) {
      cut = cut.slice(0, -1);
    }
    return cut === entry ? entry : `${cut.trimEnd()}…`;
  });
}

function buildDoc(data: AnalyticsReportData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const right = pageWidth - margin;

  // The footer rule sits 22mm from the bottom. Nothing may be drawn below this,
  // which is what let the bars run under the footer and print on top of it.
  const bodyBottom = pageHeight - 28;

  /** The letterhead, redrawn per page so every page stands on its own. */
  const drawHeader = (viewLabel: string) => {
    // Thin accent rule across the very top.
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageWidth, 1.4, "F");

    const y = 24;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    tracked(doc, "SEARLE · E-DETAILING", margin, y - 8, { space: 1 });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...INK);
    doc.text("Analytics", margin, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(...MUTED);
    doc.text(viewLabel, margin, y + 7);

    // Right-aligned period block.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...FAINT);
    tracked(doc, "REPORTING PERIOD", right, y - 8, {
      align: "right",
      space: 0.8,
    });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(data.dateLabel, right, y, { align: "right" });

    doc.setDrawColor(...INK);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 13, right, y + 13);
    return y + 27;
  };

  /**
   * Section heading: a navy tab, the tracked label, and a hairline running out
   * to the right margin. The tab is what makes a heading findable when you are
   * flicking through five pages of bars.
   */
  const heading = (label: string, top: number) => {
    doc.setFillColor(...NAVY);
    doc.roundedRect(margin, top - 3.4, 1.6, 4.2, 0.8, 0.8, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY);
    const x = margin + 4.5;
    tracked(doc, label.toUpperCase(), x, top);

    const textW = trackedWidth(doc, label.toUpperCase(), 0.6);
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.3);
    doc.line(x + textW + 5, top - 1.4, right, top - 1.4);
  };

  let y = 0;
  let currentLabel = "";

  /** Starts a fresh page. Footers are stamped in one pass at the end. */
  const breakPage = () => {
    doc.addPage();
    y = drawHeader(currentLabel);
  };

  // ---- Engagement breakdowns (horizontal bars, single accent) ----
  const labelW = 46;
  const valueW = 20;
  const barX = margin + labelW;
  const barMaxW = contentWidth - labelW - valueW;
  const barH = 5;
  const nameLineH = 3.6;

  /** One titled run of bars. */
  const breakdown = (
    title: string,
    rows: BreakdownRow[],
    emptyText: string,
  ) => {
    // A heading with no room for even one row under it belongs on the next page.
    if (y + 23 > bodyBottom) breakPage();
    heading(title, y);
    y += 11;

    if (rows.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(emptyText, margin, y + 2);
      y += 10;
      return;
    }

    const maxValue = Math.max(1, ...rows.map((item) => item.value));

    rows.forEach((item, index) => {
      // Measured with the row font, and re-set AFTER any page break: a break
      // redraws the letterhead, whose last call leaves the font bold — which is
      // why the first row of every continuation page came out bold.
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const nameLines: string[] = doc.splitTextToSize(item.name, labelW - 4);
      const rowH = Math.max(11, nameLines.length * nameLineH + 6);

      if (y + rowH > bodyBottom) {
        breakPage();
        // The reader lands mid-list otherwise, looking at bars with no idea
        // what they are of.
        heading(`${title} (continued)`, y);
        y += 11;
      }

      // Alternating band, so the eye tracks from a name across to its figure.
      if (index % 2 === 1) {
        doc.setFillColor(...BAND);
        doc.rect(margin - 2, y - 1.5, contentWidth + 4, rowH, "F");
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      nameLines.forEach((line, lineIndex) => {
        doc.text(line, margin, y + 3.6 + lineIndex * nameLineH);
      });

      // The bar sits on the first line of the name, so a three-line name reads
      // as one row rather than as a bar floating between two.
      const barY = y + 0.6;
      doc.setFillColor(...TRACK);
      doc.roundedRect(barX, barY, barMaxW, barH, 1.5, 1.5, "F");
      const w = Math.max(2, (barMaxW * item.value) / maxValue);
      doc.setFillColor(...NAVY);
      doc.roundedRect(barX, barY, w, barH, 1.5, 1.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      doc.text(item.display, right, barY + barH - 0.6, { align: "right" });

      y += rowH;
    });

    y += 7;
  };

  /** One report — metrics, the month comparison, then its breakdowns. */
  const drawSection = (section: AnalyticsReportSection) => {
    // ---- Key metrics ----
    if (section.metrics.length > 0) {
      if (y + 42 > bodyBottom) breakPage();
      heading("Key Metrics", y);
      y += 9;

      const count = section.metrics.length;
      const gap = 5;
      const boxW = (contentWidth - gap * (count - 1)) / count;
      const labelSpace = 0.3;
      const boxH = 33;

      section.metrics.forEach((metric, index) => {
        const x = margin + index * (boxW + gap);
        const inner = boxW - 10;

        // A tinted card with a hairline, and a navy rule across its top edge —
        // enough structure that four of them read as a row of cards rather than
        // as four floating numbers.
        doc.setFillColor(...CARD);
        doc.setDrawColor(...HAIRLINE);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y, boxW, boxH, 2, 2, "FD");
        doc.setFillColor(...NAVY);
        doc.rect(x + 2, y, boxW - 4, 0.8, "F");

        // label — wrapped to the card, never past it
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        const labelLines = wrapTracked(
          doc,
          metric.label.toUpperCase(),
          inner,
          labelSpace,
          2,
        );
        labelLines.forEach((line, lineIndex) => {
          tracked(doc, line, x + 5, y + 8 + lineIndex * 3.2, {
            space: labelSpace,
          });
        });

        // value — shrunk if a long figure would otherwise overrun the card
        doc.setFont("helvetica", "bold");
        let valueSize = 18;
        doc.setFontSize(valueSize);
        while (valueSize > 10 && doc.getTextWidth(metric.value) > inner) {
          valueSize -= 1;
          doc.setFontSize(valueSize);
        }
        doc.setTextColor(...INK);
        doc.text(metric.value, x + 5, y + 22);

        // change — subtle colored text, no pill. Metrics carrying no figure
        // simply leave this line off. A 'neutral' one is progress through a
        // target rather than a movement, so it gets no +/- sign.
        if (metric.change) {
          const neutral = metric.tone === "neutral";
          const positive = metric.tone === "positive";
          const signed =
            metric.change.startsWith("+") || metric.change.startsWith("-");
          const changeText =
            neutral || signed
              ? metric.change
              : `${positive ? "+" : ""}${metric.change}`;

          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(...(neutral ? NAVY : positive ? GREEN : RED));
          doc.text(changeText, x + 5, y + 28);
          const changeW = doc.getTextWidth(changeText);

          // The caption only if it genuinely fits beside the figure. Printed
          // regardless, it ran into it — "87% of monthplan".
          const caption = neutral ? "of plan" : "vs prev.";
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6);
          if (changeW + 1.5 + doc.getTextWidth(caption) <= inner) {
            doc.setTextColor(...FAINT);
            doc.text(caption, x + 5 + changeW + 1.5, y + 28);
          }
        }
      });

      y += boxH + 14;
    }

    // ---- This month vs last ----
    if (y + 36 > bodyBottom) breakPage();
    heading(section.monthly.title, y);
    y += 11;

    // Two figures in one tinted panel, divided down the middle.
    const panelH = 22;
    doc.setFillColor(...CARD);
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y - 4, contentWidth, panelH, 2, 2, "FD");

    const half = contentWidth / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    tracked(doc, "THIS MONTH", margin + 6, y + 2, { space: 0.6 });
    tracked(doc, "PREVIOUS MONTH", margin + half + 6, y + 2, { space: 0.6 });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(...NAVY);
    doc.text(section.monthly.thisMonth, margin + 6, y + 12);
    doc.setTextColor(...INK);
    doc.text(section.monthly.previousMonth, margin + half + 6, y + 12);

    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.3);
    doc.line(margin + half, y - 1, margin + half, y + 15);

    y += panelH + 8;

    section.breakdowns.forEach((run) => {
      breakdown(run.title, run.rows, section.emptyText);
    });
  };

  /**
   * Every section starts a page of its own.
   *
   * The report carries both views — a rep exports one document and it holds
   * their calls AND their sales, rather than whichever tab happened to be open.
   * A section longer than a page continues onto the next, headed and footed the
   * same way, instead of running off the bottom.
   */
  data.sections.forEach((section, index) => {
    currentLabel = section.viewLabel;
    if (index > 0) doc.addPage();
    y = drawHeader(section.viewLabel);
    drawSection(section);
  });

  // ---- Footers ----
  // Stamped in one pass at the end, because "Page 2 of 5" cannot be written
  // until the last page exists.
  const pageCount = doc.internal.pages.length - 1;
  const generated = new Date().toLocaleString();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const footerY = pageHeight - 16;
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.3);
    doc.line(margin, footerY - 6, right, footerY - 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...FAINT);
    tracked(doc, "SEARLE · E-DETAILING", margin, footerY, { space: 0.8 });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      `Page ${page} of ${pageCount}`,
      margin + contentWidth / 2,
      footerY,
      {
        align: "center",
      },
    );

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...FAINT);
    doc.text(`Generated ${generated}`, right, footerY, { align: "right" });
  }

  return doc;
}

/** Generates the analytics PDF and downloads it (web) or saves + shares it (native). */
export async function exportAnalyticsPdf(data: AnalyticsReportData) {
  const doc = buildDoc(data);
  const fileName = `analytics-report-${new Date().toISOString().slice(0, 10)}.pdf`;

  if (Platform.OS === "web") {
    // Triggers a normal browser file download — no print dialog.
    doc.save(fileName);
    return;
  }

  // Native: write the PDF to disk, then hand it to the OS share/save sheet.
  const FileSystem = await import("expo-file-system/legacy");
  const Sharing = await import("expo-sharing");
  const base64 = doc.output("datauristring").split("base64,")[1] ?? "";
  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "Analytics Report",
      UTI: "com.adobe.pdf",
    });
  }
}
