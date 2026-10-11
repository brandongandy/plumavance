import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import type { Extensions } from '@tiptap/vue-3'

export function documentExtensions(): Extensions {
  return [
    StarterKit.configure({
      code: false,
      codeBlock: false,
      link: false,
      underline: false,
      heading: { levels: [1, 2, 3] },
    }),
    Underline,
  ]
}
