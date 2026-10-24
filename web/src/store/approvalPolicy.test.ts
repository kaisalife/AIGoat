import { describe, expect, it } from 'vitest'
import {
  approvalPolicyFor,
  knownProfileIds,
  profileHint,
  sandboxPolicyFor,
} from './approvalPolicy'

describe('approvalPolicyFor', () => {
  it('沙箱可写档位 → on-request（最常用的默认）', () => {
    expect(approvalPolicyFor('workspace-write')).toBe('on-request')
  })

  it('只读档位也是 on-request：沙箱内不问、越权的才问', () => {
    expect(approvalPolicyFor('read-only')).toBe('on-request')
  })

  it('完全访问 → never（不再逐个审批）', () => {
    expect(approvalPolicyFor('danger-full-access')).toBe('never')
  })

  it('只读+网络 → untrusted：门槛没变，联网操作一律先问', () => {
    expect(approvalPolicyFor('read-only-with-network')).toBe('untrusted')
  })

  it('未知档位返回 null（调用方据此**不发**这个键）', () => {
    expect(approvalPolicyFor('some-future-profile')).toBeNull()
    expect(approvalPolicyFor('readOnly')).toBeNull()
  })

  it('null / undefined / 空串 → null', () => {
    expect(approvalPolicyFor(null)).toBeNull()
    expect(approvalPolicyFor(undefined)).toBeNull()
    expect(approvalPolicyFor('')).toBeNull()
  })

  it('granular 档位返回 null —— 压成字符串会丢掉用户配的粒度', () => {
    expect(approvalPolicyFor('granular:strict')).toBeNull()
    expect(approvalPolicyFor('granular')).toBeNull()
  })

  it('大小写敏感：档位 id 是协议给的原样字符串', () => {
    expect(approvalPolicyFor('Workspace-Write')).toBeNull()
  })
})

describe('knownProfileIds', () => {
  it('覆盖文档里列出的四个档位', () => {
    expect(knownProfileIds().sort()).toEqual(
      ['danger-full-access', 'read-only', 'read-only-with-network', 'workspace-write'].sort(),
    )
  })
})

describe('profileHint', () => {
  it('把"这个档位意味着什么"说清，尤其 never 的代价', () => {
    expect(profileHint('danger-full-access')).toContain('不逐个审批')
    expect(profileHint('never')).toContain('不逐个审批')
    expect(profileHint('on-request')).toContain('越权的才问')
    expect(profileHint('untrusted')).toContain('先问你')
  })

  it('granular 明确说"不压成字符串"', () => {
    expect(profileHint('granular:x')).toContain('不压成字符串')
  })

  it('未知档位也返回文案，不出现 undefined', () => {
    expect(profileHint('whatever')).toContain('granular')
  })
})

describe('sandboxPolicyFor（与 approvalPolicyFor 成对）', () => {
  it('workspace-write 档 → workspace-write 沙箱', () => {
    expect(sandboxPolicyFor('workspace-write')).toEqual({ type: 'workspaceWrite' })
  })
  it('只读档 → read-only；带网络档 → networkAccess: true', () => {
    expect(sandboxPolicyFor('read-only')).toEqual({ type: 'readOnly' })
    expect(sandboxPolicyFor('read-only-with-network')).toEqual({
      type: 'readOnly',
      networkAccess: true,
    })
  })
  it('完全访问档 → danger-full-access（真全自动）', () => {
    expect(sandboxPolicyFor('danger-full-access')).toEqual({ type: 'dangerFullAccess' })
  })
  it('表外/空档位返回 null（不发该字段）', () => {
    expect(sandboxPolicyFor(null)).toBeNull()
    expect(sandboxPolicyFor('some-future-profile')).toBeNull()
  })
})
