/* Copyright 2021, Milkdown by Mirone. */
import { editorViewOptionsCtx, parserCtx, schemaCtx, serializerCtx } from '@milkdown/core'
import { getNodeFromSchema } from '@milkdown/prose'
import type { Node } from '@milkdown/prose/model'
import { DOMParser, DOMSerializer } from '@milkdown/prose/model'
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state'
import { $prose } from '@milkdown/utils'

type UnknownRecord = Record<string, unknown>
const isPureText = (content: UnknownRecord | UnknownRecord[] | undefined | null): boolean => {
  if (!content)
    return false
  if (Array.isArray(content)) {
    if (content.length > 1)
      return false
    return isPureText(content[0])
  }

  const child = content.content
  if (child)
    return isPureText(child as UnknownRecord[])

  return content.type === 'text'
}

export const clipboard = $prose((ctx) => {
  const schema = ctx.get(schemaCtx)

  // Set editable props for https://github.com/Saul-Mirone/milkdown/issues/190
  ctx.update(editorViewOptionsCtx, prev => ({
    ...prev,
    editable: prev.editable ?? (() => true),
  }))

  const key = new PluginKey('MILKDOWN_CLIPBOARD')
  const plugin = new Plugin({
    key,
    props: {
      handlePaste: (view, event) => {
        const parser = ctx.get(parserCtx)
        const editable = view.props.editable?.(view.state)
        const { clipboardData } = event
        if (!editable || !clipboardData)
          return false

        const currentNode = view.state.selection.$from.node()
        if (currentNode.type.spec.code)
          return false

        const text = clipboardData.getData('text/plain')

        // if is copied from vscode, try to create a code block
        const vscodeData = clipboardData.getData('vscode-editor-data')
        if (vscodeData) {
          const data = JSON.parse(vscodeData)
          const language = data?.mode
          if (text && language) {
            const { tr } = view.state
            const codeBlock = getNodeFromSchema('code_block', schema)

            tr.replaceSelectionWith(codeBlock.create({ language }))
              .setSelection(
                TextSelection.near(tr.doc.resolve(Math.max(0, tr.selection.from - 2))),
              )
              .insertText(text.replace(/\r\n?/g, '\n'))

            view.dispatch(tr)
            return true
          }
        }

        const html = clipboardData.getData('text/html')
        if (html.length === 0 && text.length === 0)
          return false

        const domParser = DOMParser.fromSchema(schema)
        let dom
        if (html.length === 0) {
          const slice = parser(text)
          if (!slice || typeof slice === 'string')
            return false

          dom = DOMSerializer.fromSchema(schema).serializeFragment(slice.content)
        }
        else {
          const template = document.createElement('template')
          template.innerHTML = html
          dom = template.content.cloneNode(true)
          template.remove()
        }

        view.dispatch(view.state.tr.replaceSelection(domParser.parseSlice(dom)))

        return true
      },
      clipboardTextSerializer: (slice) => {
        const serializer = ctx.get(serializerCtx)
        const isText = isPureText(slice.content.toJSON())
        if (isText)
          return (slice.content as unknown as Node).textBetween(0, slice.content.size, '\n\n')

        const doc = schema.topNodeType.createAndFill(undefined, slice.content)
        if (!doc)
          return ''
        const value = serializer(doc)
        return value
      },
    },
  })

  return plugin
})
