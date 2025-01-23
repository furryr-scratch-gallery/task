import type { Map as ImmutableMap } from 'immutable'
;(function (Scratch) {
  if (!Scratch.extensions.unsandboxed) {
    throw new Error('Sandboxed mode is not supported')
  }

  console.groupCollapsed('🐺 Task')
  console.log(
    'Copyright (c) 2025 FurryR. Distributed under the MPL-2.0 license.'
  )
  console.log(
    "Task is a part of FurryR's gallery. See https://github.com/furryr-scratch-gallery for more information."
  )
  console.log('This feature is originally from lpp.')
  console.groupEnd()

  const vm = Scratch.vm

  const runtime = vm.runtime as VM.Runtime & {
    requestUpdateMonitor?(state: ImmutableMap<string, unknown>): boolean
  }

  function getUnsupportedAPIs() {
    const warn = console.warn
    console.warn = () => {}
    const apis = (vm.exports as any).i_will_not_ask_for_help_when_these_break()
    console.warn = warn
    return apis
  }

  const { ScriptTreeGenerator, JSGenerator } = getUnsupportedAPIs()
  const { TYPE_UNKNOWN, TYPE_BOOLEAN, TypedInput } =
    JSGenerator.unstable_exports
  const IRdescendInput = ScriptTreeGenerator.prototype.descendInput
  const IRdescendStackedBlock =
    ScriptTreeGenerator.prototype.descendStackedBlock
  ScriptTreeGenerator.prototype.descendStackedBlock = function (block: any) {
    switch (block.opcode) {
      case 'task_resolve': {
        return {
          kind: 'task.resolve',
          task: this.descendInputOfBlock(block, 'TASK'),
          value: this.descendInputOfBlock(block, 'VALUE')
        }
      }
      default:
        return IRdescendStackedBlock.call(this, block)
    }
  }
  ScriptTreeGenerator.prototype.descendInput = function (block: any) {
    switch (block.opcode) {
      case 'task_create': {
        return {
          kind: 'task.create'
        }
      }
      case 'task_await': {
        this.script.yields = true
        return {
          kind: 'task.await',
          task: this.descendInputOfBlock(block, 'TASK')
        }
      }
      case 'task_awaitNoReturn': {
        this.script.yields = true
        return {
          kind: 'task.awaitNoReturn',
          task: this.descendInputOfBlock(block, 'TASK')
        }
      }
      case 'task_status': {
        return {
          kind: 'task.status',
          task: this.descendInputOfBlock(block, 'TASK')
        }
      }
      case 'task_current': {
        return {
          kind: 'task.current'
        }
      }
      case 'task_async': {
        return {
          kind: 'task.async',
          substack: block.inputs.SUBSTACK?.block
        }
      }
      default:
        return IRdescendInput.call(this, block)
    }
  }

  const JSdescendInput = JSGenerator.prototype.descendInput
  const JSdescendStackedBlock = JSGenerator.prototype.descendStackedBlock

  JSGenerator.prototype.descendInput = function (node: any) {
    switch (node.kind) {
      case 'task.create': {
        return new TypedInput(
          '(new globalState.thread.target.runtime.Task)',
          TYPE_UNKNOWN
        )
      }
      case 'task.await': {
        return new TypedInput(
          `(yield* (executeInCompatibilityLayer, globalState.thread.target.runtime.Task.intrinsics.await)(${this.descendInput(node.task).asUnknown()}, waitPromise))`,
          TYPE_UNKNOWN
        )
      }
      case 'task.status': {
        return new TypedInput(
          `(globalState.thread.target.runtime.Task.intrinsics.status(${this.descendInput(node.task).asUnknown()}))`,
          TYPE_BOOLEAN
        )
      }
      case 'task.current': {
        return new TypedInput("(globalState.thread.task ?? '')", TYPE_UNKNOWN)
      }
      case 'task.async': {
        const substack = node.substack
        if (!substack) {
          return new TypedInput(
            "(globalState.thread.target.runtime.Task.resolve(''))",
            TYPE_UNKNOWN
          )
        }
        return new TypedInput(
          `(globalState.thread.target.runtime.Task.intrinsics.async(${JSON.stringify(substack)}, globalState.thread.target))`,
          TYPE_UNKNOWN
        )
      }
      default:
        return JSdescendInput.call(this, node)
    }
  }

  JSGenerator.prototype.descendStackedBlock = function (node: any) {
    switch (node.kind) {
      case 'task.resolve': {
        this.source += `globalState.thread.target.runtime.Task.intrinsics.resolve(${this.descendInput(node.task).asUnknown()},${this.descendInput(node.value).asUnknown()});\n`
        return
      }
      case 'task.awaitNoReturn': {
        this.source += `yield* (executeInCompatibilityLayer, globalState.thread.target.runtime.Task.intrinsics.await)(${this.descendInput(node.task).asUnknown()}, waitPromise);\n`
        return
      }
      default:
        return JSdescendStackedBlock.call(this, node)
    }
  }

  class Task {
    static resolve(value: any): Task {
      const task = new Task()
      task.resolve(value)
      return task
    }
    static readonly intrinsics = {
      async(substack: string, target: VM.Target): Task {
        const task = new Task()
        // Create a thread
        const newThread = vm.runtime._pushThread(substack, target)
        Object.assign(newThread, {
          task
        })
        let status = newThread.status
        Object.defineProperty(task, 'status', {
          get() {
            return status
          },
          set(value) {
            status = value
            if (value === VM.ThreadStatus.STATUS_DONE) {
              task.resolve('')
            }
          }
        })
        return task
      },
      *await(
        task: unknown,
        waitPromise: <T>(pm: PromiseLike<T>) => Generator<any, T, any>
      ): unknown {
        if (task instanceof Task) {
          if (task.done) return task.result
          return yield* waitPromise(task.promise)
        }
        return task
      },
      resolve(task: unknown, value: unknown): void {
        if (task instanceof Task) {
          task.resolve(value)
        }
      },
      status(task: unknown): boolean {
        if (task instanceof Task) {
          return task.done
        }
        return true
      }
    }
    private _fulfill: (value: unknown) => void
    promise: Promise<unknown>
    private _result: unknown = undefined
    private _done: boolean = false
    constructor(pm?: PromiseLike<unknown>) {
      this._fulfill = () => {
        throw new Error('Task is not initialized')
      }
      this.promise = new Promise(resolve => {
        this._fulfill = resolve
      })
      if (pm) {
        pm.then(
          value => this.resolve(value),
          err => this.resolve(err)
        )
      }
    }
    resolve(value: unknown) {
      if (this._done) return
      this._fulfill(value)
      this._result = value
      this._done = true
    }
    get result() {
      return this._result
    }
    get done() {
      return this._done
    }
    toString() {
      return this._done ? String(this._result) : ''
    }
    toLocaleString() {
      return this._done
        ? Scratch.translate('<fulfilled task with {RESULT}>', {
            RESULT: String(this._result)
          })
        : Scratch.translate('<pending task>')
    }
  }

  const cbfsb = (runtime as any)._convertBlockForScratchBlocks
  ;(runtime as any)._convertBlockForScratchBlocks = function (
    blockInfo: any,
    categoryInfo: any
  ) {
    const res = cbfsb.call(this, blockInfo, categoryInfo)
    if (typeof blockInfo.blockShape !== 'undefined') {
      res.json.outputShape = blockInfo.blockShape
    }
    return res
  }

  Object.assign(runtime, {
    Task
  })

  if (runtime.requestUpdateMonitor) {
    const requestUpdateMonitor = runtime.requestUpdateMonitor
    runtime.requestUpdateMonitor = function (state) {
      const monitorValue = state.get('value')
      if (monitorValue instanceof Task) {
        state = state.set('value', monitorValue.toLocaleString())
      }
      return requestUpdateMonitor.call(runtime, state)
    }
  }
  const visualReport = runtime.visualReport
  runtime.visualReport = function (blockId, value) {
    if (value instanceof Task) {
      value = value.toLocaleString()
    }
    return visualReport.call(runtime, blockId, value)
  }

  class TaskExt implements Scratch.Extension {
    getInfo() {
      return {
        id: 'task',
        name: Scratch.translate('Task'),
        color1: '#00a8ff',
        blocks: [
          {
            blockType: Scratch.BlockType.REPORTER,
            opcode: 'create',
            disableMonitor: true,
            text: Scratch.translate('new task')
          },
          {
            blockType: Scratch.BlockType.COMMAND,
            opcode: 'resolve',
            text: Scratch.translate('resolve [TASK] with [VALUE]'),
            arguments: {
              VALUE: {
                type: Scratch.ArgumentType.STRING,
                defaultValue: Scratch.translate('Hooray!')
              }
            }
          },
          {
            blockType: Scratch.BlockType.BOOLEAN,
            opcode: 'status',
            text: Scratch.translate('[TASK] done?')
          },
          {
            blockType: Scratch.BlockType.REPORTER,
            opcode: 'await',
            text: Scratch.translate('await [TASK]')
          },
          {
            blockType: Scratch.BlockType.COMMAND,
            opcode: 'awaitNoReturn',
            text: Scratch.translate('await [TASK]')
          },
          '---' as const,
          {
            blockType: Scratch.BlockType.REPORTER,
            branchCount: 1,
            blockShape: 3,
            opcode: 'async',
            disableMonitor: true,
            text: Scratch.translate('async')
          },
          {
            blockType: Scratch.BlockType.REPORTER,
            opcode: 'current',
            disableMonitor: true,
            text: Scratch.translate('current task')
          }
        ]
      }
    }
    create() {
      return new Task()
    }
    async(args: object, util: VM.BlockUtility) {
      const { thread } = util
      const block = this.getActiveBlockInstance(args, thread)
      if (!block.inputs.SUBSTACK) {
        return Task.resolve('')
      }
      return Task.intrinsics.async(block.inputs.SUBSTACK.block, thread.target)
    }
    resolve(args: { TASK: unknown; VALUE: unknown }) {
      Task.intrinsics.resolve(args.TASK, args.VALUE)
    }
    await(args: { TASK: unknown }) {
      const task = args.TASK
      if (task instanceof Task) {
        return task.done ? task.result : task.promise
      }
      return task
    }
    awaitNoReturn(args: { TASK: unknown }): void | Promise<void> {
      const task = args.TASK
      if (task instanceof Task && !task.done) {
        return task.promise.then(() => undefined) as Promise<void>
      }
      return
    }
    current(_: never, util: VM.BlockUtility) {
      return (util.thread as any).task ?? ''
    }
    status(args: { TASK: unknown }) {
      return Task.intrinsics.status(args.TASK)
    }
    /**
     * Get active block instance of specified thread.
     * @param args Block arguments.
     * @param thread Thread.
     * @returns Block instance.
     */
    private getActiveBlockInstance(args: object, thread: VM.Thread): VM.Block {
      const container = thread.target.blocks as VM.Blocks
      const id = thread.isCompiled
        ? thread.peekStack()
        : (container as any)._cache._executeCached[
            thread.peekStack()
          ]?._ops?.find(v => args === v._argValues)?.id
      const block = id
        ? (container.getBlock(id) ?? vm.runtime.flyoutBlocks.getBlock(id))
        : vm.runtime.flyoutBlocks.getBlock(thread.peekStack())
      if (!block) {
        throw new Error('task: cannot get active block')
      }
      return block
    }
  }
  Scratch.extensions.register(new TaskExt())
})(Scratch)
