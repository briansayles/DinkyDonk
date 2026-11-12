> A fully-functional yet easy-to-use poker tournament timer and manager

<p align="center">
  <img src="assets/dinkydonk-logo.png" alt="DinkyDonk logo" width="180">
</p>

DinkyDonk is a free and open-source desktop poker tournament timer and manager built with Tauri, React, and Vite.

## License

Copyright (C) 2026 Brian Sayles.

DinkyDonk is licensed under the [GNU Affero General Public License, version 3 or later](./LICENSE) (AGPL-3.0-or-later).

## Optional support

If you find DinkyDonk useful, you can optionally support its author on [Buy Me a Coffee](https://www.buymeacoffee.com/briansayles):

<p align="center">
  <a href="https://www.buymeacoffee.com/briansayles">
    <img src="assets/qr-code.png" alt="Scan to support DinkyDonk on Buy Me a Coffee" width="220">
  </a>
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

- **Tournament timer:** Run timed blind levels and breaks, see current and upcoming blinds, and follow countdown progress. After the final scheduled level, the display stays at zero while elapsed time continues until paused or the tournament ends.
- **Timer controls:** Play and pause, reset or restart a level, jump between levels, and use fullscreen mode.
- **Chip display:** Track chips in use and animate color-ups: departing chips slide out before replacement chips slide in, reversing direction when moving back through levels.
- **Shared-file updates:** Tournament structures, the active tournament, and timer preferences are stored together in a JSON file. Choose an existing settings file or enter a new filename to create a file containing the current settings. Existing files are opened rather than replaced. Multiple instances can share the same file on one or more computers, keeping their tournaments in sync. Volume controls can be adjusted per instance, and sounds can play alongside background music.
- **Tournament structures:** Create and edit buy-in, rebuy, and add-on options; chip inventories; blind schedules; and players-per-table limits. The editor shows the starting stack and its big-blind multiple using locale-based formatting, and highlights short stacks below 50 or deep stacks of at least 200 big blinds. Blind levels are sorted across breaks, which retain their positions. The editor highlights blind levels where either blind increases by less than 25% or more than 50% from the previous blind level.
- **Level statistics:** Below the blind schedule, the editor shows the starting stack in big blinds and averages percentage changes between consecutive big blinds and blind-level duration, excluding breaks. Aggressiveness is average growth divided by average minutes per level, expressed as a percentage per minute: slow at 2% or less, balanced above 2% and below 4%, and fast at 4% or more. Incomplete values are shown as not set.
- **Copy structures:** Duplicate a structure's configuration without carrying over timer state, entry counts, bustouts, or payouts.
- **Tournament tracking:** Record entries and bustouts, calculate prize pools and chips in play, configure payouts, and estimate table assignments.
- **Results export:** CSV results include entry costs, chipstacks, contributions by entry type, and total prize pool and chips in play. Disabled rebuys and add-ons remain in the recorded entries but do not contribute to totals.
- **Participant records:** Buy-ins, rebuys, add-ons, and bustouts are stored as individual records named `Unnamed` with Unix-millisecond timestamps. Adjust bustouts using the spinner or arrow keys rather than typing a count; each change immediately records or removes the relevant bustouts. Other valid count changes immediately update calculated values, with records added or removed when the field loses focus. Counts are limited to 100,000 per category. Update all devices sharing a settings directory before editing migrated data.
- **Bustout details:** Bustouts are stored newest first. New bustouts capture the current small blind, big blind and ante, elapsed whole seconds excluding breaks, place based on buy-ins and prior bustouts, and a `null` points placeholder. During breaks, bustouts use the preceding timed blind level, if any; after the schedule ends, they use the last timed blind level and elapsed time continues to accrue. Multiple bustouts added together share the same time and blinds and receive consecutive places. Existing bustouts have `null` details when their original information is unavailable; places are recorded at bustout time and do not change if the buy-in count changes later.
- **Bustout payouts:** Each bustout's `payout` follows the current paytable for its recorded place, including manual overrides. Unpaid places receive zero.
- **Alarms and announcements:** Configure level-change and countdown-warning sounds, spoken announcements, volume, and speech speed.
- **Keep-awake support:** Keep the display and system awake while the timer is visible.

## Installation

Visit the [Releases Page](https://github.com/briansayles/DinkyDonk/Releases) to find and download the compiled version for your operating system.

DinkyDonk is not (yet) a signed/trusted application on any platform. The full source code is available at the project's [GitHub Repository](https://github.com/briansayles/DinkyDonk). As a result:

1. Your browser may complain when you try to download the app. You will likely need to acknowledge a warning message or two from your browser.
2. On MacOS, you will need to remove the quarantine flag that MacOS will put on the file in order to run it. This can be done by running the following command in your terminal app:

    ```xattr -dr com.apple.quarantine /Applications/DinkyDonk.app```

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
