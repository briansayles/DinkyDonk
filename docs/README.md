> A fully-functional, easy-to-use, free and open-source desktop poker tournament manager and timer built with Tauri, React and Vite
<p align="center">
  <img src="assets/dinkydonk-logo.png" alt="DinkyDonk logo" width="180">
</p>

## Screenshots

<p>
    <img src="assets/Screenshot Timer 1.png" alt="Screenshot Timer 1" width="220">
    <img src="assets/Screenshot Timer 2.png" alt="Screenshot Timer 2" width="220">
    <img src="assets/Screenshot Timer 3.png" alt="Screenshot Timer 3" width="220">
    <img src="assets/Screenshot Timer 4.png" alt="Screenshot Timer 4" width="220">
    <img src="assets/Screenshot Tournaments List.png" alt="Screenshot Tournaments List" width="220">
    <img src="assets/Screenshot Editor 1.png" alt="Screenshot Editor 1" width="220">
    <img src="assets/Screenshot Editor 2.png" alt="Screenshot Editor 2" width="220">
    <img src="assets/Screenshot Settings 1.png" alt="Screenshot Settings 1" width="220">
    <img src="assets/Screenshot Settings 2.png" alt="Screenshot Settings 2" width="220">    
</p>

## Features

- **Tournament timer:** Run timed blind levels and breaks, see current and upcoming blinds, and follow countdown progress. The rotating message includes players paid once there are entries or an active paytable override. After the final scheduled level, the display stays at zero while elapsed time continues until paused or the tournament ends.
- **Timer controls:** Play and pause, reset or restart a level, jump between levels, and use fullscreen mode. When paused, the blinds remain visible but faded, with a gently fading pause indicator over the current blinds.
- **Chip display:** Track chips in use and animate color-ups: departing chips slide out before replacement chips slide in, while retained chips move into position. The direction reverses when moving back through levels.
- **Shared-file updates:** Tournament structures, the active tournament, and timer preferences are stored together in a JSON file. Choose an existing `.json` file or enter a new filename to create a file containing the current settings. Existing files are opened rather than replaced. Multiple instances can share the same file on one or more computers, keeping their tournaments in sync. Volume controls can be adjusted per instance, and sounds can play alongside background music.
- **Tournament structures:** Create and edit buy-in, rebuy, and add-on options; chip inventories; blind schedules; and players-per-table limits. Blind levels are sorted across breaks, which retain their positions. The editor highlights levels where either blind increases by less than 25% or more than 50% from the previous blind level.
- **Level statistics:** The editor calculates statistics live below the blind schedule, excluding breaks. Starting stack in big blinds uses the first blind level, even when the schedule begins with a break; stacks below 50 or at least 200 big blinds are highlighted. Average big-blind growth is the arithmetic mean of percentage changes between consecutive blind levels. Aggressiveness is average growth divided by average blind-level duration in minutes, shown as percent big-blind growth per minute. Its evaluation uses the unrounded value: Slow at 2% or less, Balanced above 2% and below 4%, and Fast at 4% or more. The starting-stack multiple, growth, and aggressiveness are displayed as locale-formatted whole numbers; unavailable calculations are shown as not set.
- **Structure Supports:** The minimum number of buy-ins needed to reach ten times the final big blind in chips, assuming no rebuys or add-ons. The result is rounded up to a whole player and ignores trailing breaks.
- **Copy structures:** Duplicate a structure's configuration without carrying over timer state, entry counts, bustouts, or payouts.
- **Tournament tracking:** Record entries and bustouts, calculate prize pools and chips in play, configure payouts, and estimate table assignments.
- **CSV export:** Use **Export CSVs** on a tournament structure to create separate structure and results files. Results include entries, bustouts, payouts, entry costs, chipstacks, contributions by entry type, and total prize pool and chips in play. Disabled rebuys and add-ons remain in the recorded entries but do not contribute to totals.
- **Participant records:** Buy-ins, rebuys, add-ons, and bustouts are stored as individual records named `Unnamed` with Unix-millisecond timestamps. Adjust bustouts using the spinner or arrow keys rather than typing a count; each adjustment immediately records or removes the relevant bustouts, even while the control remains focused. Other valid count changes immediately update calculated values, with records added or removed when the field loses focus. Counts are limited to 100,000 per category. Update all devices sharing a settings file before editing migrated data.
- **Bustout details:** Bustouts are stored newest first. New bustouts capture the current small blind, big blind and ante, elapsed whole seconds excluding breaks, place based on buy-ins and prior bustouts, and a `null` points placeholder. During breaks, bustouts use the preceding timed blind level, if any; after the schedule ends, they use the last timed blind level and elapsed time continues to accrue. Bustouts added in one adjustment share the same time and blinds and receive consecutive places; separate adjustments record their own details. Existing bustouts have `null` details when their original information is unavailable; places are recorded at bustout time and do not change if the buy-in count changes later.
- **Bustout payouts:** Each bustout's `payout` follows the current paytable for its recorded place, including manual overrides. Unpaid places receive zero.
- **Alarms and announcements:** Configure level-change and countdown-warning sounds, spoken announcements, volume, and speech speed.
- **Keep-awake support:** Keep the display and system awake while the timer is visible.

## History

This program's developer initially created SimpleTourneyManager back in 2009. That was developed as an Excel Add-In. Although that 'program' is known to still be in use by some, it's development ceased many years ago due to the complications of running Add-Ins for many.

Since then, a handful of other timer/manager programs were developed using a variety of technologies, but none were offered to the public.

Fast forward to 2026. Tools like React, Tauri, Vite, AI-assisted programming using GitHub Copilot, and remote builds using GitHub Actions make developing and delivering a cross-platform desktop program much simpler.

Tinkering that started in early November, 2026 led to full-fledged development and the initial release of DinkyDonk a few days later, and subsequent releases on the following days.

## What's in a Name?

This program's developer plays poker (shocking, I know) with a  group of friends and acquantances who were mostly brought together by one person. Sadly, he left us way earlier than he should have. In our games, when our old tournament timer's alarm would go off, he would say "Dinky Donk! Dinky to the Donkey! The blinds are up, _____". Why? Not really sure. But it stuck and we all still say it today. So this program is named in his honor. We all miss you, Mike!

## Installation

Visit the [Releases Page](https://github.com/briansayles/DinkyDonk/releases) to find and download the compiled version for your operating system.

## Running on Windows and macOS

DinkyDonk is not yet code-signed on Windows and not yet notarized by Apple on macOS, so both may show a warning when you open the app for the first time.

Windows: You may see a Windows Defender SmartScreen warning.

Click "More info" → "Run anyway" to proceed.
macOS: macOS may block the app the first time you open it. You can allow it in one of two ways:

Go to System Settings → Privacy & Security, scroll down and click "Open Anyway" next to the DinkyDonk message. Then open the app again and confirm.
Or run this command in the Terminal:
    ```xattr -dr com.apple.quarantine /Applications/DinkyDonk.app```

Note that this project is open source, so the full source code is available at the project's [GitHub Repository](https://github.com/briansayles/DinkyDonk).

## Support Future Development

If you find DinkyDonk useful, please consider supporting its author on [Buy Me a Coffee](https://www.buymeacoffee.com/briansayles). Any donation would be greatly appreciated and would help to fuel continued development.

<p align="center">
  <a href="https://www.buymeacoffee.com/briansayles">
    <img src="assets/qr-code.png" alt="Scan to support DinkyDonk on Buy Me a Coffee" width="220">
  </a>
</p>

## License

Copyright (C) 2026 Brian Sayles.

DinkyDonk is licensed under the [GNU Affero General assets License, version 3 or later](./LICENSE) (AGPL-3.0-or-later).

## Development

Install dependencies, then run the frontend development server:

```sh
yarn install
yarn dev
```

Build the frontend:

```sh
yarn build
```

Build the desktop application and installers:

```sh
yarn tauri build
```

See the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for the platform-specific tools needed to build desktop packages.

## Built with

<p align="center">
  <a href="https://tauri.app/">
    <img src="assets/tauri.svg" alt="Tauri" height="48">
  </a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://react.dev/">
    <img src="assets/react.svg" alt="React" height="48">
  </a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://vite.dev/">
    <img src="assets/vite.svg" alt="Vite" height="48">
  </a>
</p>
