import fs from "fs"
import chokidar from "chokidar"
import AsyncLock from "async-lock"
import debounce from "lodash.debounce"
import spawn from "cross-spawn"
import { Package } from "@manypkg/get-packages"

import { LOCK_NAME } from "../helpers/consts"
import Logger, { LoggerType } from "../helpers/logger"
import { convertPath, isAsync } from "src/helpers/utils"

import type { WatcherConfig, ActionOpts, InternalConfig } from "../types"
import { StdioOptions } from "child_process"

abstract class Events {
	public instance: chokidar.FSWatcher
	protected root: string
	protected config: InternalConfig
	protected logger: LoggerType
	private packages: Package[]
	private lock: AsyncLock

	constructor(opts: WatcherConfig) {
		this.instance = chokidar.watch(opts.include, {
			...opts.config.options,
			ignoreInitial: true,
		})
		this.root = opts.root
		this.config = opts.config
		this.logger = Logger()
		this.packages = opts.packages
		this.lock = new AsyncLock()
	}

	protected setup(): void {
		this.onError()
		this.onAdd()
		this.onAddDir()
		this.onChange()
		this.onUnlink()
		this.onUnlinkDir()
	}

	protected onError(): void {
		this.instance.on("error", (error) => {
			this.logger.LineBreak()
			this.logger.Custom(
				(c) =>
					c`${this.logger.raw({ message: "Error", spaceContent: true }, "error")} - ${
						error.message
					}.\n Stack - ${error.stack}`
			)
		})
	}

	protected onAdd(): void {
		this.instance.on("add", (filePath, stats) => {
			const add = this.config?.actions?.add
			const { currentPkg, packagePath } = this.getPackage(filePath)

			/* Add file to watch list */
			this.instance.add(filePath)

			/* Run user function */
			this.runUserFn("Add", { currentPkg, filePath, packagePath, stats }, add)
		})
	}

	protected onAddDir(): void {
		this.instance.on("addDir", (filePath, stats) => {
			const addDir = this.config?.actions?.addDir
			const { currentPkg, packagePath } = this.getPackage(filePath)

			/* Add dir to watch list */
			this.instance.add(filePath)

			/* Run user function */
			this.runUserFn("Add Dir", { currentPkg, filePath, packagePath, stats }, addDir)
		})
	}

	protected onUnlink(): void {
		this.instance.on("unlink", (filePath) => {
			const unlink = this.config?.actions?.unlink
			const { currentPkg, packagePath } = this.getPackage(filePath)

			/* Remove File from watch list */
			this.instance.unwatch(filePath)

			/* Run user function */
			this.runUserFn("Remove", { currentPkg, filePath, packagePath }, unlink)
		})
	}

	protected onUnlinkDir(): void {
		this.instance.on("unlinkDir", (filePath) => {
			const unlinkDir = this.config?.actions?.unlinkDir
			const { currentPkg, packagePath } = this.getPackage(filePath)

			/* Remove Dir from watch list */
			this.instance.unwatch(filePath)

			/* Run user function */
			this.runUserFn("Remove Dir", { currentPkg, filePath, packagePath }, unlinkDir)
		})
	}

	protected onChange(): void {
		//prettier-ignored
		this.instance.on(
			"change",
			debounce(
				(filePath, stats) => {
					const change = this.config?.actions?.change
					const { currentPkg, packagePath } = this.getPackage(filePath)

					stats = stats ?? fs.statSync(filePath)

					this.logger.log({ message: "Performing Action\n", clr: true, spaceContent: false }, "log")
					this.logger.Custom(
						(c) =>
							c`${this.logger.raw(
								{ message: "File Changed", spaceContent: true },
								"info"
							)} - ${this.logger.raw(convertPath(this.root, filePath), "log")}\n`
					)

					/* Run user function */
					this.lock.acquire(LOCK_NAME, () => {
						this.runUserFn("Change", { currentPkg, filePath, packagePath, stats }, change)
					})
				},
				2000,
				{ maxWait: 3000, leading: true }
			)
		)
	}

	private getPackage(path: string): {
		currentPkg: string
		packagePath: string
	} {
		let currentPkg = ""
		let packagePath = ""
		this.packages.forEach((pkg) => {
			const match = path.includes(pkg.dir)

			if (match) {
				currentPkg = pkg.dir.split("/").pop() as string
				packagePath = pkg.dir
			}
		})

		return { currentPkg, packagePath }
	}

	private runUserFn(
		eventName: string,
		options: ActionOpts,
		fn?: (opts: ActionOpts) => Promise<void>
	): void {
		const relativePath = convertPath(this.root, options.filePath)
		if (fn && isAsync(fn) === true) {
			fn({ ...options }).then(() => {
				this.EndLogger(eventName, relativePath)
			})
		} else {
			const stdio: StdioOptions = this.config.noChildProcessLogs
				? "ignore"
				: ["inherit", "pipe", process.stderr]

			//INFO: Experimental
			process.env.FORCE_COLOR = "true"

			const cp = spawn.sync(this.config.runScripts[0], this.config.runScripts.slice(1), {
				env: process.env,
				cwd: options.packagePath,
				stdio,
			})

			if (cp.error) throw cp.error
			else if (cp.stderr) throw new Error(String(cp.stderr))

			this.EndLogger(eventName, relativePath)
		}
	}

	private EndLogger(eventName: string, path: string): void {
		this.logger.log("Action Completed\n", "log")
		this.logger.Custom(
			(c) =>
				c`${this.logger.raw(
					{ message: eventName, spaceContent: true },
					"success"
				)} - ${this.logger.raw(path, "log")}\n`
		)
	}
}

export default Events
