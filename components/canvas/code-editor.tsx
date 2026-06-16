'use client'

import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { json } from '@codemirror/lang-json'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

// ─── Mission Control theme ────────────────────────────────────────────────────

const missionControlTheme = EditorView.theme(
  {
    '&': {
      fontSize: '11.5px',
      fontFamily: 'JetBrains Mono, monospace',
      color: 'var(--text-secondary)',
      backgroundColor: 'var(--surface-0)',
      borderRadius: '8px',
      border: '1px solid var(--border-subtle)',
      overflow: 'hidden',
      transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
    },
    '&.cm-focused': {
      outline: 'none',
      borderColor: 'rgba(155, 138, 255, 0.4)',
      boxShadow: '0 0 0 1px rgba(155, 138, 255, 0.1)',
    },
    '.cm-content': {
      padding: '10px 12px',
      caretColor: '#9B8AFF',
      lineHeight: '1.55',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#9B8AFF',
      borderLeftWidth: '2px',
    },
    '.cm-line': { padding: '0' },
    '.cm-gutters': { display: 'none' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-scroller': { fontFamily: 'JetBrains Mono, monospace !important' },
    '.cm-placeholder': {
      color: 'var(--text-ghost)',
      fontStyle: 'normal',
    },
    '&.cm-editor ::selection': {
      backgroundColor: 'rgba(155, 138, 255, 0.25)',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(155, 138, 255, 0.25) !important',
    },
  },
  { dark: true }
)

// ─── Syntax highlight — covers markdown, python, json ─────────────────────────

const missionControlHighlight = HighlightStyle.define([
  // Markdown
  { tag: tags.heading1,                color: '#9B8AFF', fontWeight: '700' },
  { tag: tags.heading2,                color: '#9B8AFF', fontWeight: '600' },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6],
                                       color: '#C4B8FF', fontWeight: '600' },
  { tag: tags.strong,                  color: '#EEF0F6', fontWeight: '700' },
  { tag: tags.emphasis,                color: '#EEF0F6', fontStyle: 'italic' },
  { tag: tags.monospace,               color: '#00E5C3' },
  { tag: tags.link,                    color: '#5CA4FF', textDecoration: 'underline' },
  { tag: tags.url,                     color: '#5CA4FF' },
  { tag: tags.list,                    color: '#FFB547' },
  { tag: tags.quote,                   color: '#8B92A8', fontStyle: 'italic' },
  // Python / general code
  { tag: tags.keyword,                 color: '#9B8AFF' },
  { tag: tags.controlKeyword,          color: '#9B8AFF', fontWeight: '600' },
  { tag: tags.definitionKeyword,       color: '#9B8AFF', fontWeight: '600' },
  { tag: tags.function(tags.variableName), color: '#5CA4FF' },
  { tag: tags.function(tags.definition(tags.variableName)),
                                       color: '#5CA4FF', fontWeight: '600' },
  { tag: tags.className,               color: '#FFB547' },
  { tag: tags.typeName,                color: '#FFB547' },
  { tag: tags.number,                  color: '#FFB547' },
  { tag: tags.bool,                    color: '#FF6B81' },
  { tag: tags.null,                    color: '#FF6B81' },
  { tag: tags.string,                  color: '#00E5C3' },
  { tag: tags.special(tags.string),    color: '#00E5C3' },
  { tag: tags.comment,                 color: '#4A5068', fontStyle: 'italic' },
  { tag: tags.lineComment,             color: '#4A5068', fontStyle: 'italic' },
  { tag: tags.blockComment,            color: '#4A5068', fontStyle: 'italic' },
  { tag: tags.operator,                color: '#8B92A8' },
  { tag: tags.punctuation,             color: '#8B92A8' },
  { tag: tags.bracket,                 color: '#8B92A8' },
  // JSON
  { tag: tags.propertyName,            color: '#9B8AFF' },
  // Markdown meta (the # * ` markers)
  { tag: tags.meta,                    color: '#4A5068' },
  { tag: tags.processingInstruction,   color: '#4A5068' },
  { tag: tags.atom,                    color: '#FFB547' },
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
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minHeight?: string
  maxHeight?: string
  language?: CodeEditorLanguage
  readOnly?: boolean
}) {
  const extensions = useMemo(() => {
    const ext = []
    if (language === 'markdown') ext.push(markdown())
    else if (language === 'python') ext.push(python())
    else if (language === 'json') ext.push(json())
    ext.push(EditorView.lineWrapping)
    ext.push(syntaxHighlighting(missionControlHighlight))
    return ext
  }, [language])

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      extensions={extensions}
      theme={missionControlTheme}
      editable={!readOnly}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
        searchKeymap: false,
        bracketMatching: language === 'python' || language === 'json',
        closeBrackets: language === 'python' || language === 'json',
        indentOnInput: language === 'python' || language === 'json',
      }}
      style={{
        minHeight,
        maxHeight,
        overflow: 'hidden',
        fontSize: '11.5px',
      }}
    />
  )
}

// ─── Token counter helper ─────────────────────────────────────────────────────

export function approxTokenCount(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}