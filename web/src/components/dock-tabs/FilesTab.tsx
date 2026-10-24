import { useEffect } from 'react'
import clsx from 'clsx'
import { useEditor } from '../../store/editor'
import { useShell } from '../../store/shell'
import { useComposerBridge } from '../../store/composerBridge'
import { relativeToWorkspace } from '../../shared/relativePath'
import { writeClipboard } from '../primitives/clipboard'
import type { FsEntry } from '../../bridge/client'
import { Button, Menu, type MenuGroupSpec } from '../primitives'
import type { DockPanelProps } from '../dock/types'
import s from './FilesTab.module.css'

/**
 * 文件树（现 `Explorer` 迁入，Explorer 本身已退役）。
 *
 * 懒加载不变：目录只在展开时拉一层。`bridge_fs_*` 是本地实现——
 * 协议那 9 个 `fs/*` 方法明确不接（17 号文件 §2），双通道只会让
 * "到底谁的路径解析生效"变成长期谜题。
 *
 * 点文件不再开抽屉，而是切到「预览」tab：抽屉是消息流底下的一条，
 * 文件树在右栏，两者互相牵制没有意义。
 *
 * 右键行 = 上下文菜单：**添加相对路径到对话**（写入工作区相对路径，
 * 与左键的打开/展开互不影响）。路径相对工作区根、正斜杠——模型对
 * 工程内相对路径的引用比对绝对路径稳得多。
 */
export function FilesTab({}: DockPanelProps) {
  const treeRoot = useEditor((s) => s.treeRoot)
  const tree = useEditor((s) => s.tree)
  const expanded = useEditor((s) => s.expanded)
  const showAll = useEditor((s) => s.showAll)
  const activeFile = useEditor((s) => s.activeFile)
  const error = useEditor((s) => s.error)
  const reset = useEditor((s) => s.reset)
  const loadTree = useEditor((s) => s.loadTree)
  const toggleDir = useEditor((s) => s.toggleDir)
  const openFile = useEditor((s) => s.openFile)
  const setShowAll = useEditor((s) => s.setShowAll)
  const cwd = useShell((s) => s.cwd)
  const insertIntoComposer = useComposerBridge((s) => s.requestInsert)

  useEffect(() => {
    if (cwd) void reset(cwd)
  }, [cwd, reset])

  const renderRow = (entry: FsEntry, depth: number) => {
    const isOpen = Boolean(expanded[entry.path])
    const relPath = relativeToWorkspace(cwd ?? treeRoot, entry.path)
    const menuGroups: MenuGroupSpec[] = [
      {
        items: [
          {
            id: 'add-to-conversation',
            label: '添加相对路径到对话',
            hint: relPath,
            onSelect: () => insertIntoComposer(relPath),
          },
          {
            id: 'copy-relative',
            label: '复制相对路径',
            onSelect: () => void writeClipboard(relPath),
          },
        ],
      },
    ]
    return (
      <div key={entry.path}>
        <Menu
          openOn="contextmenu"
          width={260}
          trigger={
            <button
              className={clsx(
                s.row,
                entry.isDir && s.rowDir,
                activeFile === entry.path && s.rowActive,
              )}
              style={{ paddingLeft: 6 + depth * 14 }}
              onClick={() => {
                // 没有子项（或子项全被忽略）的目录不展开——否则点开是个空列表，
                // 而箭头本身也是假的。`hasChildren` 由后端按同一套过滤算出。
                if (!entry.isDir) void openFile(entry.path)
                else if (entry.hasChildren) void toggleDir(entry.path)
              }}
              title={entry.path}
            >
              {entry.isDir && entry.hasChildren ? (
                <span className={clsx(s.caret, isOpen && s.caretOpen)}>{isOpen ? '▾' : '▸'}</span>
              ) : (
                <span className={clsx(s.caret, s.caretSpacer)} />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
          }
          groups={menuGroups}
        />
        {entry.isDir &&
          isOpen &&
          (expanded[entry.path] ?? []).map((child) => renderRow(child, depth + 1))}
      </div>
    )
  }

  return (
    <div className={s.files}>
      <div className={s.head}>
        <label className={s.toggle} title="显示 node_modules 等被忽略的目录">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          全部
        </label>
        <span className="truncate" title={cwd}>
          {cwd || '未打开工作区'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => treeRoot && void loadTree(treeRoot)}
          disabled={!treeRoot}
          title="刷新文件树"
        >
          刷新
        </Button>
      </div>

      <div className={s.tree}>
        {!treeRoot && !error && <p className={s.empty}>打开工作区后显示文件树。</p>}
        {error && <p className={s.error}>{error}</p>}
        {tree.map((entry) => renderRow(entry, 0))}
      </div>
    </div>
  )
}