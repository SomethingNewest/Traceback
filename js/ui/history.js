import { printReportDocument } from '../export/print.js';
import { downloadFile } from './results-helpers.js';
import { renderResultsPage } from './results-page.js';
import { renderWeeklyReport } from './weekly-report.js';

export function renderHistoryPage(
  container,
  {
    store,
    mode = 'progress',
    download = downloadFile,
    print = printReportDocument,
    confirmShare = async () => true,
    earlierResultsCount = 0,
    now = new Date(),
  },
) {
  const options = { store, now, download, print, confirmShare, earlierResultsCount };

  if (mode === 'report') {
    return renderWeeklyReport(container, options);
  }

  return renderResultsPage(container, options);
}
