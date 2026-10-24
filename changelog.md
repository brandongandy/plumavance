# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-10-23

### Changed

- Save indicator placement is now on the right side of the document toolbar.

### Fixed

- Redo icon not appearing in the document toolbar.

## [0.3.0] - 2026-10-22

### Added

- Document tabs for keeping multiple documents open while writing.
- Two-pane split editing with independent document sessions and resizable panes.
- Snapshot viewing and restoration in a dedicated split pane.

### Changed

- Save status and controls now appear in the document toolbar.

### Fixed

- Compile dialog styling now follows the active theme.
- Text added while a snapshot was being restored is no longer overwritten.
- Unsaved changes could be lost when creating or trashing Binder items while a document save was still in progress.

## [0.2.0] - 2026-10-20

### Added

- Theme settings.
- Tooltips for interface controls.

### Fixed

- Snapshot pane icons not appearing.
- Snapshot action tooltips.
- Snapshot modal sizing and theme styling.

## [0.1.1] - 2026-10-16

### Fixed

- Chapter and scene title editing failures caused by debounced search updates.

## [0.1.0] - 2026-10-16

### Added

- Project library with hierarchical binders and a compact three-pane writing workspace.
- Rich-text editing with explicit, conflict-safe saves.
- Manual document snapshots with inspection and comparison tools.
- Local compilation with selection word counts and downloadable output.
- Focus mode, typewriter mode, and keyboard shortcuts.
- Project word-count goals, daily writing activity, and live progress tracking.
- Self-hosting configuration and verification.

### Fixed

- Writing progress reconciliation across tabs, saves, and recovered activity.
- Stale workspace state and navigation when switching projects.
- Editor focus after entering Focus mode.
- Shared source resolution in clean test runs.

[Unreleased]: https://github.com/brandongandy/plumavance/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/brandongandy/plumavance/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/brandongandy/plumavance/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/brandongandy/plumavance/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/brandongandy/plumavance/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/brandongandy/plumavance/releases/tag/v0.1.0
