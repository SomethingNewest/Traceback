import { activities, supportsActivity } from '../activities/registry.js';
import { icon } from './components.js';

const actions = {
  trace: 'Draw',
  tap: 'Tap',
  aim: 'Drag',
  hold: 'Follow',
  sequence: 'Order',
  memory: 'Match',
  choice: 'Choose',
};
const cardShapes = {
  trace: '<path d="M51 48c-8-12-25-4-20 9s31 13 42-4-2-41-25-41S5 38 11 61s34 36 61 23"/>',
  tap: '<circle cx="48" cy="48" r="30"/><circle cx="48" cy="48" r="13"/><path d="M48 7v8m0 66v8M7 48h8m66 0h8"/>',
  aim: '<rect x="6" y="51" width="30" height="30" rx="7"/><rect x="59" y="10" width="30" height="30" rx="7" stroke-dasharray="5 5"/><path d="m38 53 19-19m-13 0h13v13"/>',
  hold: '<circle cx="48" cy="48" r="35"/><circle cx="48" cy="48" r="4" fill="currentColor" stroke="none"/><path d="m47 26 0 29 8-8 10-1Z"/>',
  sequence:
    '<path d="m23 27 50 3-44 41" stroke-dasharray="4 6"/><circle cx="23" cy="27" r="15" fill="var(--surface)"/><circle cx="73" cy="30" r="15" fill="var(--surface)"/><circle cx="29" cy="71" r="15" fill="var(--surface)"/><g fill="currentColor" stroke="none" font-family="system-ui,sans-serif" font-size="19" font-weight="700" text-anchor="middle"><text x="23" y="34">1</text><text x="73" y="37">2</text><text x="29" y="78">3</text></g>',
  memory:
    '<rect x="9" y="13" width="33" height="53" rx="7"/><rect x="53" y="30" width="33" height="53" rx="7"/><path d="m25 28 9 10-9 10-9-10Zm44 17 9 10-9 10-9-10Z"/>',
  choice:
    '<circle cx="47" cy="25" r="15"/><path d="m18 59 14 25H4Z"/><circle cx="48" cy="71" r="13"/><rect x="72" y="58" width="23" height="26" rx="3"/><path d="m42 69 4 4 9-10"/>',
};

export function activityIllustration(id, className = '') {
  return `<svg class="${className}" viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cardShapes[id]}</svg>`;
}

export function activityCards(capabilities, headingLevel = 3) {
  return `<div class="activity-grid">${activities
    .map((activity) => {
      const supported = supportsActivity(activity.id, capabilities);
      return `<article class="card activity-card" data-activity="${activity.id}"><div class="activity-top"><div class="activity-symbol">${activityIllustration(activity.id)}</div><span class="badge">${actions[activity.id]}</span></div><h${headingLevel} class="activity-title">${activity.name}</h${headingLevel}><p>${activity.description}</p><p class="activity-meta">${activity.duration}<span>${activity.input}</span></p><a class="button button-outline" href="#/activity/${activity.id}">${supported ? `Play ${activity.name}` : 'See what you need'} <span aria-hidden="true">→</span></a>${!supported ? '<p class="availability">You need a mouse or trackpad for this game.</p>' : ''}</article>`;
    })
    .join('')}</div>`;
}

export function homePage() {
  return `<div class="landing-page">
    <section class="landing-hero" aria-labelledby="landing-title">
      <div class="landing-hero-copy">
        <p class="eyebrow">TraceBack</p>
        <h1 id="landing-title">Track your practice.<br>See changes over time.</h1>
        <p class="landing-lead">Play a short game at your own pace. Keep a record of how you did, and come back when you are ready.</p>
        <div class="actions landing-actions"><a class="button" href="#/activities">Choose a game <span aria-hidden="true">→</span></a><a class="button button-outline" href="#/progress">View results</a></div>
        <p class="landing-note">Your results stay in this browser. You can stop a game at any time.</p>
      </div>
      <div class="landing-spiral" aria-hidden="true"><svg viewBox="0 0 320 300" fill="none"><path d="M167 149c-12-21-42-9-35 14s54 24 74-6-1-74-43-74-81 46-71 88 61 66 109 43 59-88 17-134S83 55 57 115s8 129 71 145" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><circle cx="167" cy="149" r="8" fill="currentColor"/><circle cx="128" cy="260" r="8" fill="var(--page)" stroke="currentColor" stroke-width="4"/></svg></div>
    </section>
    <section class="landing-mission" aria-labelledby="mission-heading">
      <div><p class="eyebrow">Why we built TraceBack</p><h2 id="mission-heading">Our mission</h2></div>
      <div class="landing-mission-copy"><p>Our goal is to give people living with brain injuries a simple way to track their progress in these games.</p><p>We want you to be able to see changes in your game results and share them with the people who support you.</p><p class="landing-score-note">Game scores show how you did in a game. They do not measure recovery.</p></div>
    </section>
    <section class="landing-how" aria-labelledby="how-heading">
      <div class="landing-section-heading"><h2 id="how-heading">How it works</h2><p>Start with one game.</p></div>
      <ol class="landing-steps" role="list">
        <li><span class="landing-step-number" aria-hidden="true">1</span><div><h3>Choose a game</h3><p>Pick from seven games. Read the short instructions, then select Start game.</p></div></li>
        <li><span class="landing-step-number" aria-hidden="true">2</span><div><h3>See your result</h3><p>After a game, see how you did. Completed games are saved in this browser.</p></div></li>
        <li><span class="landing-step-number" aria-hidden="true">3</span><div><h3>Look back at your week</h3><p>See your saved results together. Download or print a weekly report to keep or share.</p><a href="#/report">Open weekly report <span aria-hidden="true">→</span></a></div></li>
      </ol>
    </section>
    <section class="landing-help" aria-labelledby="help-heading">
      <h2 id="help-heading">Help along the way</h2>
      <div class="landing-help-links"><article><h3>Learn about brain injuries</h3><p>Find short explanations and links to trusted health information.</p><a href="#/information">Visit the information center <span aria-hidden="true">→</span></a></article><article><h3>Make the page easier to use</h3><p>Choose your colors, text size, button size, and other settings.</p><a href="#/settings">Open accessibility settings <span aria-hidden="true">→</span></a></article></div>
    </section>
  </div>`;
}

export function libraryPage(capabilities) {
  return `<div class="page-intro"><h1>Choose a game</h1><p>Pick a game. Then select Start game.</p></div>${activityCards(capabilities, 2)}`;
}

export function emptyPage(page) {
  const report = page === 'report';
  return `<div class="page-intro"><h1>${report ? 'Weekly report' : 'Your results'}</h1><p>${report ? 'Your saved games from the last 7 days.' : 'See how you did in each game.'}</p></div><section class="card empty-state">${icon(report ? 'trace' : 'aim', 'empty-icon')}<h2>No saved games yet</h2><p class="muted">Finish a game to see your result here. Practice games are not saved.</p><div class="actions"><a class="button" href="#/activities">Choose a game</a></div></section>`;
}

const toggles = [
  ['highContrast', 'Stronger contrast', 'Make text and borders easier to see.'],
  ['comfortableSpacing', 'More space', 'Add room between text and controls.'],
  ['largeControls', 'Larger buttons', 'Make buttons and menu links bigger.'],
  ['reducedMotion', 'Less movement', 'Reduce page animations. Moving games still move.'],
  ['simplifiedInstructions', 'Short instructions', 'Show one step first.'],
  ['largerTargets', 'Larger game targets', 'Make targets easier to reach.'],
  ['caregiverMode', 'Caregiver help', 'Show extra help with setup.'],
];
export function settingsPage() {
  return `<div class="page-intro"><h1>Settings</h1><p>Choose what makes the page easier to use.</p></div><div class="settings-layout"><div class="stack"><form id="settings-form" class="card"><fieldset><legend>Text and appearance</legend><div class="setting-row"><label for="theme">Light or dark</label><select id="theme" name="theme"><option value="system">Use device setting</option><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="setting-row"><label for="color-scheme">Color scheme</label><select id="color-scheme" name="colorScheme" aria-describedby="color-scheme-help"><option value="lavender">Lavender</option><option value="ocean">Ocean blue</option><option value="forest">Forest green</option><option value="warm">Warm amber</option></select></div><p id="color-scheme-help" class="muted small-copy">Choose the colors that feel easiest to read. Stronger contrast takes priority when it is on.</p><div class="color-scheme-preview" aria-hidden="true"><span><i style="--swatch:#6242b5"></i>Lavender</span><span><i style="--swatch:#17617a"></i>Ocean</span><span><i style="--swatch:#376339"></i>Forest</span><span><i style="--swatch:#825307"></i>Warm</span></div><div class="setting-row"><label for="text-scale">Text size</label><select id="text-scale" name="textScale"><option value="1">Standard</option><option value="1.25">Larger</option><option value="1.5">Largest</option></select></div>${toggles.map(([key, label, help]) => `<div class="setting-row"><label class="setting-copy" for="setting-${key}"><span>${label}</span><small id="help-${key}">${help}</small></label><input id="setting-${key}" name="${key}" type="checkbox" aria-describedby="help-${key}"></div>`).join('')}</fieldset><p id="settings-status" class="form-status" role="status"></p></form><section class="card stack"><h2>Saved data</h2><p>Your results, routines and settings stay in this browser. Download a backup before changing devices or clearing browser data.</p><p class="muted small-copy">A backup is readable and includes all saved notes. Keep the file somewhere safe and share it only with people you choose.</p><div class="actions"><button type="button" class="button button-outline" id="download-backup">Download backup</button><button type="button" class="button button-outline" id="reset-settings">Reset settings</button><button type="button" class="button button-outline" id="delete-data">Delete saved data</button></div><div class="field"><label for="restore-file">Restore a backup</label><input type="file" id="restore-file" accept=".json,application/json" aria-describedby="restore-help"><small id="restore-help">Choose a TraceBack JSON backup. Restoring replaces the saved data for this site.</small></div><div class="actions"><button type="button" class="button button-outline" id="restore-backup">Restore backup</button><button type="button" class="button button-outline" id="copy-legacy-data" hidden>Copy older results</button><button type="button" class="button button-outline" id="remove-legacy-data" hidden>Remove older shared copy</button></div><p id="data-status" class="form-status" role="status"></p><p class="muted small-copy">Reset settings changes how the app looks. It keeps your results.</p></section></div><aside class="card settings-note"><h2>Before you play</h2><p>Sit comfortably. Take a break when you need one.</p><p>Use the same hand and device when you want to compare results.</p><p>Keyboard controls work for the menus. Games need a mouse, trackpad, touch screen or pen. Steady Ring needs a mouse or trackpad.</p></aside></div>`;
}

export function aboutPage() {
  return `<div class="page-intro"><h1>About TraceBack</h1><p>Short movement games with a record of your results.</p></div><article class="reading prose"><h2>How to use it</h2><p>Choose a game and select Start game. When you finish, you will see your accuracy. Your result is saved in this browser.</p><p>Open Weekly report to see your recent results. You can download them or print a copy. Practice games are not saved.</p><h2>What the scores mean</h2><p>Scores describe this game, not recovery. They cannot tell you how serious an injury is or how well treatment is working.</p><p>Results can change when you are tired, use a different device or get more practice. Compare games played with the same setup.</p><p>Spiral Trace measures how closely the line you draw follows the guide. You can finish after a short section. Target Tap counts taps that hit the circle. Drag &amp; Place gives points for placing blocks. Steady Ring measures time inside a moving ring. Number Trail asks you to tap numbers in order. Match Pairs asks you to find matching cards. Shape Pick asks you to choose a matching shape.</p><h2>Your data</h2><p>TraceBack has no account or cloud storage. It saves your results, routines, settings and any notes in this browser. Downloading a backup does not remove them.</p><p>The app does not encrypt or password-protect saved data or downloaded files. Anyone using the same browser profile can see your results and notes. Keep backups and reports somewhere safe, and share them only with people you choose.</p><p>Each TraceBack site uses its own saved-data location. Older versions used one shared copy; Settings lets you copy or remove it. Sites on somethingnewest.github.io share a hostname, so other pages on that hostname can access this browser storage. Separate storage locations prevent accidental mixing but do not provide security isolation.</p><p>Browser data can be lost if you clear it or change devices. Use Download backup in Settings to keep a copy. Backups and reports need no password. Anyone with a downloaded file can read it.</p><p>Settings lets you restore a backup or delete saved data for this site. Restoring replaces current results after you confirm. Deleting browser data does not remove downloads or copies on other devices.</p><h2>Brain injury information</h2><p>Visit the <a href="#/information">Information center</a> for short explanations and links to CDC and NIH guidance.</p><h2>Getting help</h2><p>Someone can help you choose a game or change the settings. If they play for you, choose “A caregiver” under Who is playing. Those results are labeled separately.</p><p>Skip a game if it does not work for you. Stop if you feel unwell.</p><h2>About the project</h2><p>TraceBack is a student project. The games have not been tested as medical assessments. The code and contribution information are on <a href="https://github.com/SomethingNewest/TracebackTBI">GitHub</a>.</p></article>`;
}
