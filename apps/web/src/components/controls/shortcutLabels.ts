const APPLE_PLATFORM = /Mac|iPhone|iPad|iPod/

export function shortcutLabel(
  shortcut: string,
  nonAppleShortcut = shortcut,
  platform = window.navigator.platform,
): string {
  const selected = APPLE_PLATFORM.test(platform) ? shortcut : nonAppleShortcut
  return selected.replace('Mod', APPLE_PLATFORM.test(platform) ? 'Cmd' : 'Ctrl')
}
