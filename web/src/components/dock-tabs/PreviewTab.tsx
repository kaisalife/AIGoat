import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { useEditor, type OpenFile } from '../../store/editor'
import { getFileExtension } from '../../shared/getFileExtension'
import { Button, Modal } from '../primitives'
import type { DockPanelProps } from '../dock/types'
import s from './PreviewTab.module.css'

/**
 * 文档预览（现 `EditorDrawer` 迁入，抽屉退役）。
 *
 * 三种渲染器先行（10 号文件 §3.2）：文本走 CodeMirror、图片直接看、
 * 二进制/超大只给「在资源管理器中打开」。
 * PDF/Office 后期评估——不引重库，那两个格式的解析器比整个终端 tab 都大。
 *
 * 相对抽屉的变化：不再有可拖动高度条（高度归右栏的拖拽把手管，
 * 两个拖拽区域叠在一起必然打架），也不再能"收起"（关 tab 就是关）。
 */
export function PreviewTab({}: DockPanelProps) {
  const openFiles = useEditor((s) => s.openFiles)
  const activeFile = useEditor((s) => s.activeFile)
  const error = useEditor((s) => s.error)
  const setActiveFile = useEditor((s) => s.setActiveFile)
  const closeFile = useEditor((s) => s.closeFile)
  const moveFile = useEditor((s) => s.moveFile)
  const updateFile = useEditor((s) => s.updateFile)
  const save = useEditor((s) => s.save)
  const reveal = useEditor((s) => s.reveal)
  // 待确认关闭的脏文件：非 null 时弹确认框，避免静默丢编辑。
  const [closing, setClosing] = useState<OpenFile | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)

  /** 关一个页签。脏文件先确认——直接 closeFile 会把未保存的编辑丢掉。 */
  const requestClose = (file: OpenFile) => {
    if (file.dirty) setClosing(file)
    else closeFile(file.path)
  }

  /** 「保存并关闭」：save 失败时不关（save 内部已把错误写进 error）。 */
  const saveAndClose = async (path: string) => {
    setClosing(null)
    await save(path)
    const file = useEditor.getState().openFiles.find((f) => f.path === path)
    if (file && !file.dirty) closeFile(path)
  }

  if (openFiles.length === 0) {
    return (
      <div className={s.empty}>
        <p>在文件树里点一个文件就能在这里预览。</p>
      </div>
    )
  }
  // 上面的守卫保证 openFiles 非空，因此 `?? openFiles[0]` 一定有值。
  const active = openFiles.find((f) => f.path === activeFile) ?? openFiles[0]!

  const dropAt = (to: number) => {
    if (dragging !== null && dragging !== to) moveFile(dragging, to)
    setDragging(null)
  }

  return (
    <div className={s.preview}>
      <div className={s.tabs} role="tablist" aria-label="打开的文件">
        {openFiles.map((f, index) => (
          <div
            key={f.path}
            role="tab"
            aria-selected={f.path === active.path}
            draggable
            onDragStart={() => setDragging(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              dropAt(index)
            }}
            onDragEnd={() => dropAt(index)}
            onMouseUp={(e) => {
              // 中键关闭（编辑器惯例）。中键在部分平台还有自动滚动的默认
              // 行为，一并拦掉。
              if (e.button === 1) {
                e.preventDefault()
                requestClose(f)
              }
            }}
            className={clsx(s.tab, f.path === active.path && s.tabOn, dragging === index && s.dragging)}
            title={f.path}
          >
            {/* 点选必须是真按钮：div+onClick 键盘够不着，Tab 键也进不来
                （与 DockTabs 同一条约定）。 */}
            <button type="button" className={s.tabMain} onClick={() => setActiveFile(f.path)}>
              <span className="truncate">{f.name}</span>
              {f.dirty && (
                <span className={s.dirty} title="有未保存的改动">
                  ●
                </span>
              )}
            </button>
            <button
              type="button"
              className={s.close}
              aria-label={`关闭 ${f.name}`}
              title="关闭（中键同）"
              onClick={(e) => {
                e.stopPropagation()
                requestClose(f)
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {error && <p className={s.error}>{error}</p>}

      <div className={s.body}>
        {active.kind === 'text' && (
          <CodeMirrorEditor
            key={active.path}
            value={active.content ?? ''}
            onChange={(text) => updateFile(active.path, text)}
            onSave={() => void save(active.path)}
          />
        )}
        {active.kind === 'image' && (
          <div className={s.image}>
            <img
              src={`data:${mimeOf(active.path)};base64,${active.content ?? ''}`}
              alt={active.name}
            />
          </div>
        )}
        {(active.kind === 'binary' || active.kind === 'tooLarge') && (
          <div className={s.empty}>
            <p>
              {active.kind === 'tooLarge'
                ? '文件太大（超过 2MB），无法在这里编辑。'
                : '二进制文件，无法在这里编辑。'}
            </p>
            <Button variant="ghost" onClick={() => void reveal(active.path)}>
              在资源管理器中打开
            </Button>
          </div>
        )}
      </div>

      {closing && (
        <Modal
          open
          onClose={() => setClosing(null)}
          size="narrow"
          title={`关闭 ${closing.name}`}
          description="这个文件有未保存的改动。"
          closeOnBackdrop={false}
          footer={
            <>
              <Button variant="ghost" onClick={() => setClosing(null)}>
                取消
              </Button>
              <Button variant="ghost" onClick={() => void saveAndClose(closing.path)}>
                保存并关闭
              </Button>
              <Button variant="danger" onClick={() => { closeFile(closing.path); setClosing(null) }}>
                放弃更改
              </Button>
            </>
          }
        >
          <p className={s.confirmText}>
            直接关闭会丢失「{closing.name}」里未保存的编辑。
          </p>
        </Modal>
      )}
    </div>
  )
}

/** 按文件挂载一次的 CodeMirror（key=path 保证切文件时重建）。 */
function CodeMirrorEditor(props: {
  value: string
  onChange: (text: string) => void
  onSave: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(props.onChange)
  const onSaveRef = useRef(props.onSave)
  onChangeRef.current = props.onChange
  onSaveRef.current = props.onSave

  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: props.value,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
            { key: 'Mod-s', run: () => (onSaveRef.current(), true) },
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
        ],
      }),
    })
    return () => view.destroy()
    // 只在挂载时建一次；value 变化靠父组件 key 重建处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={host} className="cm-host" />
}

function mimeOf(path: string): string {
  const ext = getFileExtension(path)
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    svg: 'image/svg+xml',
  }
  return map[ext] ?? 'application/octet-stream'
}