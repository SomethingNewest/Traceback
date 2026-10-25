// The downloaded report carries its styles with it and works without a network.
// Fixed light colours keep printed charts legible in every accessibility theme.
export const REPORT_STYLE = `
:root {
  color-scheme: light;
  --ink: #26203a;
  --muted: #60596e;
  --violet: #6840aa;
  --violet-dark: #432574;
  --lavender: #f3eef9;
  --line: #ded7e9;
  --paper: #fff;
  --soft: #faf8fd;
}
* {
  box-sizing: border-box;
}
html {
  background: #ece9f1;
}
body {
  margin: 0;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 15px;
  line-height: 1.55;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
button {
  font: inherit;
}
.report-toolbar {
  max-width: 940px;
  margin: 22px auto 16px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.report-toolbar p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}
.report-print {
  flex: none;
  border: 0;
  border-radius: 10px;
  background: var(--violet-dark);
  color: #fff;
  font-weight: 700;
  padding: 13px 20px;
  min-height: 48px;
  cursor: pointer;
}
.report-print:focus-visible {
  outline: 3px solid var(--violet);
  outline-offset: 4px;
}
.report-document {
  max-width: 940px;
  margin: 0 auto 32px;
  background: var(--paper);
  padding: 48px 54px;
  box-shadow: 0 6px 32px #31204312;
}
.report-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.6px;
  color: var(--violet-dark);
}
.report-brand svg {
  width: 31px;
  height: 31px;
  flex: none;
}
.report-eyebrow {
  margin: 29px 0 6px;
  text-transform: uppercase;
  letter-spacing: 1.7px;
  font-size: 11px;
  font-weight: 700;
  color: var(--violet);
}
h1,
h2,
h3,
h4,
p,
figure,
dl {
  margin: 0;
}
h1,
h2,
h3,
h4 {
  line-height: 1.2;
  overflow-wrap: anywhere;
}
h1 {
  font-size: 39px;
  letter-spacing: -1.3px;
  max-width: 650px;
}
.report-range {
  font-size: 20px;
  margin-top: 13px;
  font-weight: 700;
}
.report-selection {
  margin-top: 4px;
  color: var(--muted);
}
.report-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 24px;
  padding: 17px 0 22px;
  border-bottom: 2px solid var(--violet-dark);
  margin-top: 16px;
  font-size: 11px;
  color: var(--muted);
}
.report-meta strong {
  font-weight: 700;
  color: var(--ink);
}
.report-overview {
  margin-top: 26px;
}
.report-section-title {
  font-size: 21px;
  letter-spacing: -0.4px;
  margin-bottom: 13px;
}
.report-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 11px;
}
.report-stat {
  border: 1px solid var(--line);
  border-top: 3px solid var(--violet);
  border-radius: 11px;
  padding: 15px 14px;
  background: var(--soft);
  break-inside: avoid;
}
.report-stat dt {
  font-size: 11px;
  color: var(--muted);
  font-weight: 700;
}
.report-stat dd {
  margin: 7px 0 0;
  font-size: 32px;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -1px;
  color: var(--violet-dark);
}
.report-overview-note {
  margin-top: 12px;
  font-size: 11px;
  color: var(--muted);
}
.report-frequency {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 18px 19px 12px;
  margin-top: 22px;
  break-inside: avoid;
}
.report-frequency h2 {
  font-size: 17px;
  letter-spacing: -0.2px;
}
.report-caption {
  font-size: 11px;
  color: var(--muted);
  margin-top: 5px;
  line-height: 1.5;
}
.report-frequency svg {
  width: 100%;
  height: auto;
  display: block;
  margin-top: 12px;
}
.report-notice {
  border-left: 3px solid var(--violet);
  padding: 11px 15px;
  background: var(--lavender);
  font-size: 12px;
  line-height: 1.6;
  margin-top: 22px;
  break-inside: avoid;
}
.report-notice strong {
  display: block;
  margin-bottom: 3px;
}
.report-contents {
  margin-top: 23px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
  break-inside: avoid;
}
.report-contents h2 {
  font-size: 15px;
  margin-bottom: 8px;
}
.report-contents ol {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px 18px;
}
.report-contents li {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);
}
.report-contents a {
  color: var(--violet-dark);
  text-decoration: none;
  font-weight: 700;
}
.report-index {
  font-weight: 700;
  color: var(--violet);
  min-width: 18px;
}
.report-game-section {
  margin-top: 38px;
  padding-top: 30px;
  border-top: 2px solid var(--violet-dark);
}
.report-group-kicker {
  color: var(--violet);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.3px;
  font-size: 10px;
  margin-bottom: 7px;
}
.report-group-title {
  font-size: 28px;
  letter-spacing: -0.7px;
}
.report-setup {
  font-size: 11px;
  color: var(--muted);
  margin-top: 9px;
  overflow-wrap: anywhere;
}
.report-setup strong {
  color: var(--ink);
}
.report-group-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
  font-size: 10px;
  color: var(--muted);
  margin-top: 7px;
}
.report-group-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}
.report-metric-card {
  background: var(--lavender);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 13px 16px;
  break-inside: avoid;
}
.report-metric-card h3 {
  font-size: 11px;
  color: var(--muted);
  font-weight: 700;
}
.report-metric-value {
  font-weight: 700;
  color: var(--violet-dark);
  font-size: 27px;
  line-height: 1.2;
  margin: 5px 0;
  letter-spacing: -0.7px;
}
.report-metric-change {
  font-size: 11px;
  font-weight: 700;
}
.report-metric-baseline {
  font-size: 10px;
  color: var(--muted);
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.report-chart {
  border: 1px solid var(--line);
  border-radius: 11px;
  margin-top: 17px;
  padding: 13px 16px 10px;
  break-inside: avoid;
}
.report-chart h3 {
  font-size: 13px;
}
.report-chart svg {
  width: 100%;
  height: auto;
  display: block;
  margin-top: 5px;
}
.report-chart .report-caption {
  font-size: 10px;
}
.report-chart-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 20px;
  font-size: 10px;
  color: var(--muted);
  margin-top: 1px;
}
.report-chart-legend span {
  display: flex;
  align-items: center;
  gap: 7px;
}
.report-legend-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--violet);
}
.report-legend-dash {
  display: inline-block;
  width: 20px;
  border-top: 2px dashed #7b718c;
}
.report-trend-note {
  margin-top: 10px;
  font-size: 10px;
  color: var(--muted);
}
.report-games-table {
  margin-top: 20px;
}
.report-subheading {
  font-size: 15px;
  margin-bottom: 8px;
}
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 11px;
  line-height: 1.45;
  table-layout: fixed;
}
caption {
  text-align: left;
  font-size: 10px;
  color: var(--muted);
  margin-bottom: 7px;
}
th {
  text-align: left;
  background: var(--lavender);
  color: var(--violet-dark);
  font-weight: 700;
  padding: 9px 10px;
  border-bottom: 1px solid #b5a5cb;
  vertical-align: bottom;
}
td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
  overflow-wrap: anywhere;
}
thead {
  display: table-header-group;
}
tfoot {
  display: table-footer-group;
}
tr {
  break-inside: avoid;
}
.report-game-list th:first-child {
  width: 34%;
}
.report-game-list th:nth-child(2) {
  width: 22%;
}
.report-game-list th:nth-child(3) {
  width: 25%;
}
.report-game-list td:first-child {
  font-weight: 700;
}
.report-game-list td small {
  display: block;
  font-size: 9px;
  color: var(--muted);
  font-weight: 400;
  margin-top: 3px;
}
.report-data-section {
  margin-top: 37px;
  padding-top: 28px;
  border-top: 2px solid var(--violet-dark);
}
.report-data-intro {
  margin-top: 9px;
  font-size: 11px;
  color: var(--muted);
}
.report-data-group {
  margin-top: 24px;
}
.report-data-group > h3 {
  font-size: 19px;
  letter-spacing: -0.3px;
}
.report-data-group .report-setup {
  margin-top: 6px;
}
.report-data-game {
  margin-top: 16px;
}
.report-data-game h4 {
  font-size: 12px;
  margin-bottom: 7px;
  padding: 9px 10px;
  background: var(--soft);
  border-left: 3px solid var(--violet);
}
.report-measurements th:nth-child(1) {
  width: 29%;
}
.report-measurements th:nth-child(2) {
  width: 20%;
}
.report-measurements th:nth-child(3) {
  width: 23%;
}
.report-measurements th:nth-child(4) {
  width: 28%;
}
.report-measurements td:first-child {
  font-weight: 700;
}
.report-measurements td small {
  display: block;
  font-size: 9px;
  color: var(--muted);
  font-weight: 400;
  margin-top: 2px;
}
.report-game-note {
  font-size: 11px;
  margin-top: 7px;
  padding: 9px 10px;
  border: 1px solid var(--line);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.report-game-note strong {
  white-space: normal;
}
.report-quality {
  font-size: 10px;
  color: var(--muted);
  margin-top: 6px;
  overflow-wrap: anywhere;
}
.report-definitions {
  margin-top: 34px;
  padding-top: 23px;
  border-top: 1px solid var(--line);
}
.report-definitions h2 {
  font-size: 20px;
  letter-spacing: -0.4px;
}
.report-definitions h3 {
  font-size: 14px;
  margin-top: 18px;
}
.report-definitions ul {
  padding-left: 17px;
  margin: 9px 0 0;
  font-size: 10px;
  color: var(--muted);
}
.report-definitions li {
  margin-bottom: 7px;
  break-inside: avoid;
}
.report-definitions strong {
  color: var(--ink);
}
.report-empty {
  margin: 30px 0;
  padding: 30px 24px;
  background: var(--soft);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.report-empty h2 {
  font-size: 23px;
  margin-bottom: 10px;
}
.report-empty p {
  font-size: 13px;
  color: var(--muted);
}
.report-footer {
  border-top: 2px solid var(--violet-dark);
  margin-top: 32px;
  padding-top: 15px;
  font-size: 10px;
  color: var(--muted);
}
.report-footer p + p {
  margin-top: 6px;
}
.report-footer .report-footer-brand {
  color: var(--violet-dark);
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  font-size: 10px;
}
a {
  color: var(--violet-dark);
}
@media (max-width: 700px) {
  .report-toolbar {
    padding: 0 15px;
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
  .report-document {
    padding: 30px 20px;
    margin-bottom: 0;
  }
  .report-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  h1 {
    font-size: 33px;
  }
  .report-range {
    font-size: 17px;
  }
  .report-group-title {
    font-size: 25px;
  }
  .report-group-metrics {
    gap: 8px;
  }
  .report-metric-card {
    padding: 12px;
  }
  .report-metric-value {
    font-size: 23px;
  }
  .report-contents ol {
    grid-template-columns: 1fr;
  }
  th,
  td {
    padding: 8px 6px;
    font-size: 10px;
  }
}
@media print {
  @page {
    size: portrait;
    margin: 11mm 13mm 12mm;
    @bottom-left {
      content: 'TraceBack | Practice progress';
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      color: #60596e;
    }
    @bottom-right {
      content: 'Page ' counter(page) ' of ' counter(pages);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      color: #60596e;
    }
  }
  html,
  body {
    background: #fff;
    color: #26203a;
    font-size: 9.5pt;
    line-height: 1.45;
  }
  .report-toolbar {
    display: none !important;
  }
  .report-document {
    max-width: none;
    margin: 0;
    padding: 0;
    box-shadow: none;
  }
  .report-brand {
    font-size: 17pt;
  }
  .report-brand svg {
    width: 25px;
    height: 25px;
  }
  .report-eyebrow {
    margin-top: 14px;
    font-size: 8pt;
  }
  h1 {
    font-size: 29pt;
    letter-spacing: -0.8pt;
  }
  .report-range {
    font-size: 15pt;
    margin-top: 10px;
  }
  .report-selection {
    font-size: 10pt;
  }
  .report-meta {
    font-size: 8pt;
    margin-top: 8px;
    padding: 10px 0 12px;
  }
  .report-overview {
    margin-top: 17px;
  }
  .report-section-title {
    font-size: 16pt;
    margin-bottom: 10px;
  }
  .report-summary {
    gap: 9px;
  }
  .report-stat {
    padding: 9px 11px;
  }
  .report-stat dt {
    font-size: 8pt;
  }
  .report-stat dd {
    font-size: 24pt;
  }
  .report-overview-note {
    font-size: 8pt;
  }
  .report-frequency {
    padding: 11px 14px 8px;
    margin-top: 14px;
  }
  .report-frequency h2 {
    font-size: 12pt;
  }
  .report-frequency svg {
    margin-top: 8px;
  }
  .report-caption {
    font-size: 8pt;
  }
  .report-notice {
    font-size: 8.5pt;
    margin-top: 14px;
    padding: 8px 12px;
  }
  .report-contents {
    margin-top: 14px;
    padding-top: 11px;
  }
  .report-contents h2 {
    font-size: 10pt;
  }
  .report-contents li {
    font-size: 8pt;
  }
  .report-game-section {
    break-before: page;
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
  .report-group-kicker {
    font-size: 8pt;
  }
  .report-group-title {
    font-size: 21pt;
  }
  .report-setup {
    font-size: 8pt;
    margin-top: 7px;
  }
  .report-group-meta {
    font-size: 7.5pt;
    margin-top: 5px;
  }
  .report-group-metrics {
    gap: 10px;
    margin-top: 10px;
  }
  .report-metric-card {
    padding: 8px 12px;
  }
  .report-metric-card h3 {
    font-size: 8pt;
  }
  .report-metric-value {
    font-size: 21pt;
    margin: 3px 0;
  }
  .report-metric-change {
    font-size: 8pt;
  }
  .report-metric-baseline {
    font-size: 7.5pt;
  }
  .report-chart {
    margin-top: 9px;
    padding: 7px 12px 5px;
  }
  .report-chart h3 {
    font-size: 9.5pt;
  }
  .report-chart .report-caption,
  .report-chart-legend,
  .report-trend-note {
    font-size: 7.5pt;
  }
  .report-trend-note {
    margin-top: 7px;
  }
  .report-games-table {
    margin-top: 12px;
  }
  .report-small-game-list {
    break-inside: avoid;
  }
  .report-subheading {
    font-size: 11pt;
  }
  table {
    font-size: 8pt;
    line-height: 1.4;
  }
  th,
  td {
    font-size: inherit;
    padding: 7px 8px;
  }
  .report-game-list td small {
    font-size: 7pt;
  }
  .report-data-section {
    break-before: page;
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
  .report-data-intro {
    font-size: 8pt;
  }
  .report-data-group {
    margin-top: 19px;
  }
  .report-data-group > h3 {
    font-size: 14pt;
  }
  .report-data-game {
    margin-top: 12px;
    break-inside: avoid;
  }
  .report-data-game h4 {
    font-size: 9pt;
    padding: 6px 8px;
  }
  .report-measurements th,
  .report-measurements td {
    padding: 5px 7px;
  }
  .report-measurements td small {
    font-size: 7pt;
  }
  .report-game-note {
    font-size: 8pt;
    padding: 7px 8px;
  }
  .report-quality {
    font-size: 7.5pt;
  }
  .report-definitions {
    margin-top: 24px;
    padding-top: 18px;
  }
  .report-definitions h2 {
    font-size: 15pt;
  }
  .report-definitions h3 {
    font-size: 10pt;
  }
  .report-definitions ul {
    font-size: 8pt;
  }
  .report-footer {
    font-size: 7.5pt;
    margin-top: 24px;
    padding-top: 12px;
  }
  .report-footer .report-footer-brand {
    font-size: 7.5pt;
  }
  h2,
  h3,
  h4,
  .report-setup,
  .report-group-meta,
  .report-subheading {
    break-after: avoid;
  }
  .report-definitions ul,
  .report-footer {
    break-inside: avoid;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
}
`;
