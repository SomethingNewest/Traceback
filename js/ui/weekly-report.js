import { activities, activityById } from '../activities/registry.js';
import { exportCSV } from '../export/csv.js';
import {
  REPORT_LIMITATIONS,
  localDate,
  printableReportHTML,
  selectReportResults,
  weekRange,
} from '../export/report.js';
import { node } from './results-helpers.js';
import { savedResultsTable } from './results-table.js';

export function renderWeeklyReport(
  container,
  { store, now, download, print, confirmShare = async () => true },
) {
  let selectedWeek = weekRange(now).startDate;
  let selectedActivity = 'all';
  let includeNotes = false;
  let printing = false;
  let selectedResults = [];

  container.innerHTML = `
    <div class="page-intro">
      <h1>Weekly report</h1>
      <p>Choose a week. Then download your results or print them.</p>
    </div>
    <section class="card history-controls no-print" aria-label="Report choices">
      <div class="history-filters">
        <div class="field">
          <label for="history-activity">Activity</label>
          <select id="history-activity"><option value="all">All activities</option></select>
        </div>
        <div class="field">
          <label for="history-week">Week of</label>
          <input id="history-week" type="date" aria-describedby="history-week-help">
          <small id="history-week-help">Weeks run Monday to Sunday.</small>
        </div>
      </div>
      <div class="history-week-nav actions">
        <button type="button" class="button button-outline button-small" id="previous-week">Previous week</button>
        <button type="button" class="button button-outline button-small" id="next-week">Next week</button>
      </div>
      <label class="history-notes-choice">
        <input type="checkbox" id="history-notes"> Include my notes in the report and CSV
      </label>
      <div class="report-actions actions">
        <button type="button" class="button" id="download-week-csv">Download CSV</button>
        <button type="button" class="button button-outline" id="download-week-report">Download report</button>
        <button type="button" class="button button-outline" id="print-week">Print / Save as PDF</button>
      </div>
      <p class="muted">The report includes graphs and comparisons. Choose Print / Save as PDF to keep a PDF copy. CSV opens in a spreadsheet.</p>
      <p id="history-status" class="form-status" role="status"></p>
    </section>
    <section class="history-summary card" aria-labelledby="history-summary-heading">
      <h2 id="history-summary-heading"></h2>
      <p id="history-summary-copy"></p>
    </section>
    <div id="history-results"></div>
    <p class="report-note"></p>
  `;

  const $ = (selector) => container.querySelector(selector);
  const activitySelect = $('#history-activity');
  const status = $('#history-status');
  const resultArea = $('#history-results');

  for (const activity of activities) {
    const option = node('option', activity.name);
    option.value = activity.id;
    activitySelect.append(option);
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const generated = node(
    'p',
    `Generated ${now.toLocaleString()} (${timezone})`,
    'report-generated muted',
  );
  $('.history-summary').append(generated);
  $('.report-note').textContent =
    `${REPORT_LIMITATIONS} Results stay in this browser unless you download them.`;

  function update() {
    const selection = selectReportResults(store, {
      weekStart: selectedWeek,
      activityId: selectedActivity,
    });
    selectedResults = selection.results;
    const gameCount = selectedResults.length;
    const gameLabel = gameCount === 1 ? 'game' : 'games';
    const activityLabel =
      selectedActivity === 'all' ? '' : ` · ${activityById(selectedActivity).name}`;

    $('#history-summary-heading').textContent = `${selection.startDate} to ${selection.endDate}`;
    $('#history-summary-copy').textContent =
      `${gameCount} ${gameLabel}${activityLabel}. A starting point is your first saved game with the same setup. A higher or lower number describes that game only.`;
    $('#history-week').value = selection.startDate;
    $('#download-week-csv').disabled = !gameCount;
    $('#download-week-report').disabled = !gameCount;
    $('#print-week').disabled = !gameCount || printing;
    resultArea.replaceChildren();

    if (!gameCount) {
      const empty = node('section', undefined, 'card history-empty');
      empty.append(
        node('h2', 'No saved games this week'),
        node('p', 'Choose another week, or play an activity.'),
      );
      const link = node('a', 'Choose an activity', 'button');
      link.href = '#/activities';
      empty.append(link);
      resultArea.append(empty);
      return;
    }

    resultArea.append(
      node(
        'p',
        'Each game measures accuracy in a different way. Compare the same game and setup. Accuracy is not averaged across games.',
        'accuracy-explainer',
      ),
    );
    resultArea.append(
      savedResultsTable(store, selectedResults, 'Games saved during the selected week'),
    );
  }

  function moveWeek(days) {
    const range = weekRange(selectedWeek);
    range.start.setDate(range.start.getDate() + days);
    selectedWeek = localDate(range.start);
    status.textContent = '';
    update();
  }

  function currentReport() {
    return printableReportHTML(store, {
      weekStart: selectedWeek,
      activityId: selectedActivity,
      includeNotes,
    });
  }

  async function downloadReport(format) {
    try {
      if (
        !(await confirmShare({ kind: format === 'csv' ? 'CSV' : 'report', includeNotes })) ||
        !status.isConnected
      )
        return;
      const suffix = selectedActivity === 'all' ? '' : `-${selectedActivity}`;
      const filename = `traceback-week-${selectedWeek}${suffix}`;

      if (format === 'csv') {
        download(
          `${filename}.csv`,
          exportCSV(store, selectedResults, { includeNotes }),
          'text/csv;charset=utf-8',
        );
      } else {
        download(`${filename}.html`, currentReport(), 'text/html;charset=utf-8');
      }

      status.textContent = 'Your download is ready. Check your downloads folder.';
    } catch (error) {
      status.textContent = `The download could not be made. ${error.message}`;
    }
  }

  activitySelect.addEventListener('change', () => {
    selectedActivity = activitySelect.value;
    status.textContent = '';
    update();
  });

  $('#history-week').addEventListener('change', (event) => {
    try {
      selectedWeek = weekRange(event.target.value).startDate;
      status.textContent = '';
      update();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  $('#previous-week').addEventListener('click', () => moveWeek(-7));
  $('#next-week').addEventListener('click', () => moveWeek(7));
  $('#history-notes').addEventListener('change', (event) => {
    includeNotes = event.target.checked;
  });
  $('#download-week-csv').addEventListener('click', () => downloadReport('csv'));
  $('#download-week-report').addEventListener('click', () => downloadReport('html'));

  $('#print-week').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (printing) return;
    if (
      !(await confirmShare({ kind: 'printed report or PDF', includeNotes })) ||
      !status.isConnected
    )
      return;
    printing = true;
    button.disabled = true;
    status.textContent = 'Opening your report. Choose Save as PDF in the print window.';

    try {
      await print(currentReport());
      if (status.isConnected) {
        status.textContent = 'Your report opened for printing. Choose Save as PDF to keep a copy.';
      }
    } catch (error) {
      if (status.isConnected) {
        status.textContent = `The print view could not open. Download the report and print that copy. ${error.message}`;
      }
    } finally {
      printing = false;
      if (button.isConnected) button.disabled = !selectedResults.length;
    }
  });

  update();
}
