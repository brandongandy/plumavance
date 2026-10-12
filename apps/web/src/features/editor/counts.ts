import type { EditorDocument, EditorNode } from '@pluma/shared'

const blockTypes = new Set(['paragraph', 'heading', 'blockquote', 'listItem', 'horizontalRule'])

function collect(node: EditorNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak' || node.type === 'horizontalRule') return '\n'
  const separator = node.type === 'doc' ? '\n\n' : blockTypes.has(node.type) ? '' : '\n'
  return (node.content ?? []).map(collect).join(separator)
}

export function editorText(document: EditorDocument): string {
  return collect(document)
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function countText(text: string): { words: number; characters: number } {
  const trimmed = text.trim()
  return {
    words: trimmed ? trimmed.split(/\s+/u).length : 0,
    characters: text.length,
  }
}
