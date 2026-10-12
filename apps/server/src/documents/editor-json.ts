import type { EditorDocument, EditorNode } from '@pluma/shared'

const blockTypes = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'horizontalRule',
])

function collect(node: EditorNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'horizontalRule') return '\n'

  const separator = node.type === 'doc' ? '\n\n' : blockTypes.has(node.type) ? '' : '\n'
  return (node.content ?? []).map(collect).join(separator)
}

export function extractDocumentText(document: EditorDocument): string {
  return collect(document)
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
