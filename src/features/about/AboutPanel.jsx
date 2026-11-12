const features = [
  [
    "Tournament timer",
    "Run timed blind levels and breaks, see current and upcoming blinds, and follow countdown progress.",
  ],
  [
    "Timer controls",
    "Play and pause, reset or restart a level, jump between levels, and use fullscreen mode.",
  ],
  [
    "Chip display",
    "Track chips in use and show chip color-ups as levels change.",
  ],
  [
    "Tournament structures",
    "Create and edit buy-in, rebuy, and add-on options; chip inventories; blind schedules; and players-per-table limits.",
  ],
  [
    "Copy structures",
    "Duplicate a structure's configuration without carrying over timer state, entry counts, bustouts, or payouts.",
  ],
  [
    "Tournament tracking",
    "Record entries and bustouts, calculate prize pools and chips in play, configure payouts, and estimate table assignments.",
  ],
  [
    "Shared-folder updates",
    "Store tournament data and timer preferences in a selected JSON settings file. Open app instances check for changes about once per second, so multiple devices sharing that file can show the same tournament.",
  ],
  [
    "Alarms and announcements",
    "Configure level-change and countdown-warning sounds, spoken announcements, volume, and speech speed.",
  ],
  [
    "Keep-awake support",
    "Keep the display and system awake while the timer is visible.",
  ],
];

export default function AboutPanel() {
  return (
    <div className="about-panel">
      <header className="about-intro">
        <img
          className="about-logo"
          src="/dinkydonk-logo.png"
          alt="DinkyDonk logo"
        />
        <h2>Version {APP_VERSION}</h2>
        <p>
            DinkyDonk is a free and open-source desktop poker tournament manager and timer built with Tauri, React, and Vite.
        </p>
      </header>

      <section className="about-features">
        <h3>Features</h3>
        <ul>
          {features.map(([name, description]) => (
            <li key={name}>
              <strong>{name}:</strong> {description}
            </li>
          ))}
        </ul>
      </section>

      <section className="about-support">
        <h3>Optional support</h3>
        <p>
          If you find DinkyDonk useful, you can optionally support its author
          on{" "}
          <a
            href="https://www.buymeacoffee.com/briansayles"
            target="_blank"
            rel="noreferrer"
          >
            Buy Me a Coffee
          </a>
          .
        </p>
        <a
          href="https://www.buymeacoffee.com/briansayles"
          target="_blank"
          rel="noreferrer"
        >
          <img
            className="about-support-qr"
            src="/qr-code.png"
            alt="Scan to support DinkyDonk on Buy Me a Coffee"
          />
        </a>
      </section>

      <section className="about-development">
        <h3>Development</h3>
        <p>Please report any bugs or issues on the project's GitHub repository.</p>
        <p>
          You can find the repository{" "}
          <a
            href="https://github.com/briansayles/dinkydonk"
            target="_blank"
            rel="noreferrer"
          >
            here
          </a>
          .
        </p>
      </section>

      <section className="about-license">
        <h3>Copyright and license</h3>
        <p>Copyright © 2026 Brian Sayles.</p>
        <p>
          DinkyDonk is licensed under the{" "}
          <a
            href="https://www.gnu.org/licenses/agpl-3.0.html"
            target="_blank"
            rel="noreferrer"
          >
            GNU Affero General Public License, version 3 or later
          </a>{" "}
          (AGPL-3.0-or-later). The complete license is available in the{" "}
          <a
            href="https://github.com/briansayles/dinkydonk/blob/main/LICENSE"
            target="_blank"
            rel="noreferrer"
          >
            project repository
          </a>
          .
        </p>
      </section>

      <footer className="about-built-with">
        <h3>Built with</h3>
        <div className="about-technology-logos">
          <a href="https://tauri.app/" target="_blank" rel="noreferrer">
            <img src="/tauri.svg" alt="Tauri" />
          </a>
          <a href="https://react.dev/" target="_blank" rel="noreferrer">
            <img src="/react.svg" alt="React" />
          </a>
          <a href="https://vite.dev/" target="_blank" rel="noreferrer">
            <img src="/vite.svg" alt="Vite" />
          </a>
        </div>
      </footer>
    </div>
  );
}
