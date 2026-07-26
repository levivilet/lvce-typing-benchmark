import { readFile } from 'node:fs/promises'

export interface BrowserProcessInfo {
  readonly id: number
  readonly type: string
}

export interface BrowserProcessMemory {
  readonly gpuBytes: number | null
  readonly rendererBytes: number | null
}

const parseResidentSetSize = (status: string): number | null => {
  const match = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status)
  return match?.[1] ? Number(match[1]) * 1024 : null
}

const sumProcessMemory = async (
  processes: readonly BrowserProcessInfo[],
  type: string,
  readStatus: (pid: number) => Promise<string>,
): Promise<number | null> => {
  const values = await Promise.all(
    processes
      .filter((browserProcess) => browserProcess.type.toLowerCase() === type)
      .map(async (browserProcess) => parseResidentSetSize(await readStatus(browserProcess.id).catch(() => ''))),
  )
  const measured = values.filter((value): value is number => value !== null)
  return measured.length === 0 ? null : measured.reduce((total, value) => total + value, 0)
}

export const getBrowserProcessMemory = async (
  processes: readonly BrowserProcessInfo[],
  readStatus: (pid: number) => Promise<string> = (pid) => readFile(`/proc/${pid}/status`, 'utf8'),
  platform = process.platform,
): Promise<BrowserProcessMemory> => {
  if (platform !== 'linux') {
    return {
      gpuBytes: null,
      rendererBytes: null,
    }
  }
  const [gpuBytes, rendererBytes] = await Promise.all([
    sumProcessMemory(processes, 'gpu', readStatus),
    sumProcessMemory(processes, 'renderer', readStatus),
  ])
  return {
    gpuBytes,
    rendererBytes,
  }
}
