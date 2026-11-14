import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const backendRoot = path.join(projectRoot, 'backend')
const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const children = new Set()
let shuttingDown = false

function stopAll(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
  process.exitCode = exitCode
}

function startChild(name, args, cwd) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  })
  children.add(child)
  child.once('error', error => {
    console.error(`${name} failed to start: ${error.message}`)
    stopAll(1)
  })
  return child
}

function isPortAvailable(port) {
  return new Promise(resolve => {
    const probe = net.createServer()
    probe.once('error', () => resolve(false))
    probe.listen(port, () => probe.close(() => resolve(true)))
  })
}

process.once('SIGINT', () => stopAll(0))
process.once('SIGTERM', () => stopAll(0))

const requiredPorts = [4000, 5173, 5174]
const portAvailability = await Promise.all(requiredPorts.map(isPortAvailable))
const occupiedPorts = requiredPorts.filter((_, index) => !portAvailability[index])
if (occupiedPorts.length) {
  console.error(`CineBook cannot start because port${occupiedPorts.length === 1 ? '' : 's'} ${occupiedPorts.join(', ')} ${occupiedPorts.length === 1 ? 'is' : 'are'} already in use.`)
  console.error('Stop the other CineBook terminal with Ctrl+C, then run npm run dev again.')
  process.exitCode = 1
} else {
const seed = startChild('Database seed', [path.join(backendRoot, 'seed.js')], backendRoot)
seed.once('exit', (code, signal) => {
  children.delete(seed)
  if (shuttingDown) return
  if (code !== 0) {
    console.error(`Database setup stopped (${signal || `exit code ${code}`}). Fix the database settings in backend/.env, then run npm run dev again.`)
    stopAll(code || 1)
    return
  }

  console.log('Sample venues, pincodes, events, and shows are saved in MongoDB.')
  const services = [
    {
      name: 'API',
      cwd: backendRoot,
      args: [path.join(backendRoot, 'index.js')],
    },
    {
      name: 'Customer',
      cwd: projectRoot,
      args: [viteCli, 'frontend', '--config', 'frontend/vite.config.js'],
    },
    {
      name: 'Manager',
      cwd: projectRoot,
      args: [viteCli, '--config', 'admin/vite.config.js'],
    },
  ]

  for (const service of services) {
    const child = startChild(service.name, service.args, service.cwd)
    child.once('exit', (exitCode, exitSignal) => {
      children.delete(child)
      if (shuttingDown) return
      console.error(`${service.name} stopped unexpectedly (${exitSignal || `exit code ${exitCode}`}). Shutting down the other services.`)
      stopAll(exitCode || 1)
    })
  }
})
}
