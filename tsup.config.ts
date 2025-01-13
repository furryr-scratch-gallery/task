import { defineConfig } from 'tsup'

export default defineConfig({
  name: 'task', // Replace it with your extension name
  entry: ['src/index.ts', 'src/index.js'],
  target: ['esnext'],
  format: ['iife'],
  outDir: 'dist',
  banner: {
    // Replace it with your extension's metadata
    js: `// Name: Task
// ID: task
// Description: Dealing with stuffs that don't respond immediately.
// By: FurryR
// License: MPL-2.0
`
  },
  platform: 'browser',
  clean: true
})
