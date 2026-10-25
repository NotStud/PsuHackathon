import { ChevronRightIcon } from './Icons'

/** Browser-specific instructions remain available even when no install prompt is offered. */
export function InstallTips() {
  return (
    <section className="install-tips" aria-labelledby="install-tips-heading">
      <h2 className="section-title" id="install-tips-heading">Tips</h2>
      <details className="install-tips-card">
        <summary>
          <span className="install-tips-symbol" aria-hidden>↓</span>
          <span><strong>Install as an app</strong><span className="muted small">Add Sniped to your home screen</span></span>
          <ChevronRightIcon width={18} height={18} />
        </summary>
        <div className="install-tips-content">
          <p>Keep Sniped one tap away by adding it from your browser</p>
          <h3>Apple· Safari</h3>
          <ol>
            <li>Open this website in Safari.</li>
            <li>Tap <strong>Share</strong> (the square with an up arrow). You may need to open the page menu first.</li>
            <li>Choose <strong>Add to Home Screen</strong>. Scroll down in the share menu if needed.</li>
            <li>Leave <strong>Open as Web App</strong> on if it appears, then tap <strong>Add</strong>.</li>
          </ol>
          <h3>Android · Chrome</h3>
          <ol>
            <li>Open this website in Chrome.</li>
            <li>Tap the <strong>three-dot menu</strong>, then <strong>Install and create shortcut</strong>.</li>
            <li>Choose <strong>Install</strong> and follow the prompts. Some versions call this <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
          </ol>
          <h3>Computer · Chrome</h3>
          <ol>
            <li>Open this website in Chrome.</li>
            <li>Open the <strong>three-dot menu → Cast, save, and share → Install page as app</strong>, or click the install icon in the address bar if available.</li>
            <li>Confirm the installation, then launch Sniped from your apps.</li>
          </ol>
          <p className="install-tips-note">Open the new icon and sign in if asked. You still need an internet connection to play. Allow camera and motion access when prompted.</p>
          <p className="muted small">Can’t find the option? Open the link in Safari or Chrome directly instead of an in-app browser.</p>
          <div className="install-tips-help">
            <a href="https://support.apple.com/guide/iphone/iphea86e5236/ios" target="_blank" rel="noreferrer">Apple instructions ↗</a>
            <a href="https://support.google.com/chrome/answer/9658361" target="_blank" rel="noreferrer">Chrome instructions ↗</a>
          </div>
        </div>
      </details>
    </section>
  )
}
