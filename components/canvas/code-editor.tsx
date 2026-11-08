'use client'

import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

// ─── Theme: every color is a CSS token, so the editor follows light/dark ──────

const afTheme = EditorView.theme({
  '&': {
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text)',
    backgroundColor: 'var(--surface-2)',
    borderRadius: '6px',
    border: '1px solid var(--line)',
    overflow: 'hidden',
  },
  '&.cm-focused': { outline: 'none', borderColor: 'var(--accent)' },
  '.cm-content': { padding: '8px 10px', caretColor: 'var(--accent)', lineHeight: '1.55' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-line': { padding: '0' },
  '.cm-gutters': { backgroundColor: 'var(--surface-2)', color: 'var(--text-3)', border: 'none', borderRight: '1px solid var(--line)' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-scroller': { fontFamily: 'var(--font-mono) !important' },
  '.cm-placeholder': { color: 'var(--text-3)', fontStyle: 'normal' },
  '&.cm-editor ::selection, .cm-selectionBackground': { backgroundColor: 'var(--accent-soft) !important' },
})

const afHighlight = HighlightStyle.define([
  { tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6], color: 'var(--t-agent)', fontWeight: '600' },
  { tag: [tags.strong], fontWeight: '700' },
  { tag: [tags.emphasis], fontStyle: 'italic' },
  { tag: [tags.monospace, tags.string, tags.special(tags.string)], color: 'var(--t-tool)' },
  { tag: [tags.link, tags.url], color: 'var(--accent)' },
  { tag: [tags.list, tags.number, tags.atom, tags.className, tags.typeName], color: 'var(--t-router)' },
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.propertyName], color: 'var(--t-memory)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.definition(tags.variableName))], color: 'var(--accent)' },
  { tag: [tags.bool, tags.null], color: 'var(--t-gate)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.meta, tags.processingInstruction, tags.quote], color: 'var(--text-3)', fontStyle: 'italic' },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: 'var(--text-2)' },
])

// ─── Component ────────────────────────────────────────────────────────────────

export type CodeEditorLanguage = 'markdown' | 'python' | 'json' | 'plain'

export function CodeEditor({
  value,
  onChange,
  placeholder,
  minHeight = '120px',
  maxHeight = '300px',
  language = 'markdown',
  readOnly = false,
  lineNumbers = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: string
  maxHeight?: string
  language?: CodeEditorLanguage
  readOnly?: boolean
  lineNumbers?: boolean
}) {
  const extensions = useMemo(() => {
    const ext = []
    if (language === 'markdown') ext.push(markdown())
    else if (language === 'python') ext.push(python())
    else if (language === 'json') ext.push(json())
    if (!lineNumbers) ext.push(EditorView.lineWrapping)
    ext.push(syntaxHighlighting(afHighlight))
    return ext
  }, [language, lineNumbers])

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      extensions={extensions}
      theme={afTheme}
      editable={!readOnly}
      basicSetup={{
        lineNumbers,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
        searchKeymap: false,
        bracketMatching: language === 'python' || language === 'json',
        closeBrackets: language === 'python' || language === 'json',
        indentOnInput: language === 'python' || language === 'json',
      }}
      // The library applies these to the editor, so long content scrolls inside it.
      minHeight={minHeight}
      maxHeight={maxHeight === 'none' ? undefined : maxHeight}
    />
  )
}

// ─── Token counter helper ─────────────────────────────────────────────────────

export function approxTokenCount(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}