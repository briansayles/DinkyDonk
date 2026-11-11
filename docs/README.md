> A fully-functional yet easy-to-use poker tournament timer and manager

<p align="center">
  <img src="/docs/assets/dinkydonk-logo.png" alt="DinkyDonk logo" width="180">
</p>

DinkyDonk is a free and open-source desktop poker tournament timer and manager built with Tauri, React, and Vite.

## License

Copyright (C) 2026 Brian Sayles.

DinkyDonk is licensed under the [GNU Affero General Public License, version 3 or later](./LICENSE) (AGPL-3.0-or-later).

## Optional support

If you find DinkyDonk useful, you can optionally support its author on [Buy Me a Coffee](https://www.buymeacoffee.com/briansayles):

<p align="center">
  <a href="https://www.buymeacoffee.com/briansayles">
    <img src="/docs/asssets/qr-code.png" alt="Scan to support DinkyDonk on Buy Me a Coffee" width="220">
  </a>
</p>

## Features

- **Tournament timer:** Run timed blind levels and breaks, see current and upcoming blinds, and follow countdown progress.
- **Timer controls:** Play and pause, reset or restart a level, jump between levels, and use fullscreen mode.
- **Chip display:** Track chips in use and show chip color-ups as levels change.
- **Tournament structures:** Create and edit buy-in, rebuy, and add-on options; chip inventories; blind schedules; and players-per-table limits.
- **Copy structures:** Duplicate a structure's configuration without carrying over timer state, entry counts, bustouts, or payouts.
- **Tournament tracking:** Record entries and bustouts, calculate prize pools and chips in play, configure payouts, and estimate table assignments.
- **Participant records:** Buy-ins, rebuys, add-ons, and bustouts are stored as individual records named `Unnamed` with Unix-millisecond timestamps. Valid count changes immediately update calculated values; records are added or the most recently added records removed when the field loses focus. Counts are limited to 100,000 per category. Update all devices sharing a settings directory before editing migrated data.
- **Bustout details:** Bustouts are stored newest first. New bustouts capture the current small blind, big blind and ante, elapsed whole seconds excluding breaks, place based on buy-ins and prior bustouts, and a `null` points placeholder. Blinds are `null` during breaks or after the timer ends. Multiple bustouts added together share the same time and blinds and receive consecutive places. Existing bustouts have `null` details when their original information is unavailable; places are recorded at bustout time and do not change if the buy-in count changes later.
- **Bustout payouts:** Each bustout's `payout` follows the current paytable for its recorded place, including manual overrides. Unpaid places receive zero.
- **Shared-folder updates:** Store tournament structures, the active tournament, and timer preferences together in `DinkyDonk.JSON` in a selected settings directory. Open app instances check for changes about once per second, making it possible to display the same tournament on multiple devices when they share that directory.
- **Alarms and announcements:** Configure level-change and countdown-warning sounds, spoken announcements, volume, and speech speed.
- **Keep-awake support:** Keep the display and system awake while the timer is visible.

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
    <img src="../public/tauri.svg" alt="Tauri" height="48">
  </a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://react.dev/">
    <img src="../public/react.svg" alt="React" height="48">
  </a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://vite.dev/">
    <img src="../public/vite.svg" alt="Vite" height="48">
  </a>
</p>
