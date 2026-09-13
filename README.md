# Proxmox VE Manager UX Enhancements

A collection of practical UI and workflow improvements for **Proxmox VE Manager**, focused on making everyday VM/LXC administration faster, easier, and more convenient.

The goal of this work is not to redesign Proxmox VE Manager, but to improve common workflows while reusing the existing Proxmox architecture, APIs, permissions, task handling, and UI components wherever possible.

## Features

### Guest Hostname & OS Information

The VM/LXC summary can now show useful guest information such as:

* Guest hostname
* Operating system
* OS version information
* Kernel information where available

For QEMU guests, the information is obtained through the **QEMU Guest Agent**. LXC information uses the existing container configuration/API.

If guest-agent information is unavailable, the UI fails gracefully instead of breaking the summary panel.

---

### Open Console in New Tab

Console access is now more convenient.

You can:

* Open a VM/LXC console in a new browser tab
* Use middle-click where supported
* Keep the normal Proxmox console workflow unchanged

The existing Proxmox console URL generation and permission model are reused.

SPICE consoles retain the existing Proxmox fallback behavior where a direct new-tab workflow is not applicable.

---

### One-Click Copy Information

Common guest information can now be copied directly from the UI.

Supported information includes:

* IP address
* Hostname
* Operating system
* Connection information

The implementation uses the browser Clipboard API when available and falls back to the existing browser-compatible copy mechanism when necessary.

This avoids manually selecting addresses and information from the UI.

---

### Custom Resource Grid Columns

The Resource Grid has been improved to make it easier to control the information displayed in the table.

The implementation builds on Proxmox's existing:

* Column configuration
* Resource Grid
* Saved grid state
* Search/filter mechanisms

No separate configuration system was introduced.

---

### Bulk VM/LXC Actions

Multiple guests can now be selected from the Resource Grid and managed together.

Supported operations include:

* Start
* Shutdown
* Reboot
* Stop

The implementation respects the existing Proxmox permission model and confirmation dialogs.

Bulk operations also provide feedback about individual guest results, making it easier to identify successful and failed operations.

---

### Task Duration

The existing Tasks view now provides better visibility into how long completed operations took.

This makes it easier to understand operations such as:

* VM start/stop
* Shutdown
* Reboot
* Other Proxmox tasks

The existing Proxmox task infrastructure is reused rather than creating another task-tracking mechanism.

---

### Resource Usage Warnings

The resource UI now provides visual warnings when usage becomes high.

The implementation covers:

* CPU usage
* Memory usage
* Disk usage

Existing Proxmox progress/status components are reused so the new warnings remain consistent with the rest of the interface.

Values outside the expected range are also handled safely.

---

### Improved Tag Filtering

Proxmox's existing tag functionality has been extended with better interaction through resource searching/filtering.

Existing tag rendering and override mechanisms are reused instead of creating a new tag system.

This makes it easier to find resources when a cluster contains a large number of VMs and containers.

---

### Command Palette / Quick Actions

Keyboard-driven administration has been added to make common actions faster.

The global search can be used with keyboard shortcuts, and command-style actions can be entered using the `>` prefix.

Examples:

```text
> start <vm>
> shutdown <vm>
> reboot <vm>
> stop <vm>
> console <vm>
> snapshot <vm>
```

The command palette uses the existing Proxmox actions where possible, including:

* Permission checks
* Confirmation dialogs
* Existing task handling
* Existing VM/LXC commands

Empty or ambiguous commands are prevented from accidentally operating on the wrong resource.

---

## Security & Reliability

The implementation was reviewed with particular attention to Proxmox's existing security model.

Key points include:

* Existing authentication is preserved.
* Existing API permissions are respected.
* Bulk actions use the normal Proxmox permission checks.
* Guest-agent information is safely HTML-encoded before being displayed.
* User-controlled guest information is not inserted into the UI as trusted HTML.
* Async callbacks check component lifecycle state before updating the UI.
* Clipboard operations do not expose additional sensitive information.
* Console URLs continue to use Proxmox's existing console URL generation.
* No command execution is introduced from the frontend.
* No backend permission bypass is introduced.
* No new external dependencies are required.

## Implementation Approach

A major goal of this work was to keep the changes close to the existing Proxmox architecture.

Where possible, the implementation reuses:

* `PVE.Utils`
* Existing `CmdMenu` actions
* `ResourceStore`
* `ResourceGrid`
* `UpdateStore`
* `TaskViewer`
* Existing API endpoints
* Existing permission checks
* Existing tag rendering
* Existing Proxmox UI components
* Existing gettext/i18n infrastructure

No new backend API was added for these features.

## Main Files

The current feature pack touches the following areas:

```text
www/manager6/Utils.js
www/manager6/button/ConsoleButton.js
www/manager6/qemu/CmdMenu.js
www/manager6/lxc/CmdMenu.js
www/manager6/node/CmdMenu.js
www/manager6/panel/IPView.js
www/manager6/panel/GuestAgentInfo.js
www/manager6/panel/GuestStatusView.js
www/manager6/grid/ResourceGrid.js
www/manager6/data/ResourceStore.js
www/manager6/dc/Tasks.js
www/manager6/form/GlobalSearchField.js
www/manager6/Makefile
```

`GuestAgentInfo.js` is the new component introduced for displaying guest-agent information.

## Validation

The implementation has gone through a code-level production-readiness audit.

The audit covered:

* API verification
* Permission checks
* XSS protection
* ExtJS lifecycle handling
* Async callback safety
* Bulk-action safety
* Command-palette safety
* Clipboard handling
* Resource warning handling
* i18n
* Existing Proxmox code patterns
* Whitespace and line-ending consistency
* Introduced symbol verification
* Diff/artifact checks

Several issues were found during the audit and fixed, including an incorrect HTTP-method assumption, speculative QGA field parsing, duplicated command-palette logic, an i18n issue, and an async callback lifecycle issue.

### Host-side validation still required

The final audit intentionally does **not** claim full production readiness because the environment used for the code review did not contain the complete Proxmox build toolchain or a live Proxmox/browser environment.

The following still need to be run on a proper Proxmox development/build host:

```bash
git diff --check
git diff --stat

make -C www/manager6 lint
make check
```

A live browser/PVE test should also cover different VM/LXC states, permissions, consoles, bulk operations, command-palette actions, and failure cases.

## Maintenance Mode

A Maintenance Mode button was intentionally **not implemented**.

During the backend/API review, no suitable node-maintenance API was found that could support a proper implementation. Rather than creating a frontend-only button that would give the impression that a node was actually in maintenance mode, the feature was left out.

This keeps the implementation honest and avoids introducing behavior that is not backed by the Proxmox API.

## Scope

The feature pack currently contains approximately:

```text
13 modified files
~1,450 lines added
~60 lines removed
1 new UI component
0 new external dependencies
0 backend API changes
```

The changes are primarily focused on improving the **day-to-day Proxmox administrator experience** without changing the underlying virtualization architecture.

## Goals

The overall idea behind this project is simple:

> **Make common Proxmox administration tasks take fewer clicks without making the UI more complicated.**

The improvements focus on information visibility, faster actions, keyboard workflows, bulk management, and better feedback while keeping the existing Proxmox look, architecture, permissions, and behavior intact.

## Current Status

```text
Code-level audit:        PASS
Security review:         PASS
API review:              PASS
Lifecycle review:        PASS
i18n review:             PASS
Build/lint validation:   Pending
Live PVE testing:        Pending
Production readiness:    Pending host-side validation
```

Once the build, lint, and live Proxmox/browser tests pass, the feature pack can be considered ready for final review and upstream contribution.
