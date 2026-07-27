import nextVitals from 'eslint-config-next/core-web-vitals'

const config = [
  ...nextVitals,
  {
    ignores: ['.next', 'out', 'build', 'dist', 'node_modules'],
  },
]

export default config
