import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'

if (typeof globalThis.structuredClone !== 'function') {
	const v8 = require('node:v8')
	globalThis.structuredClone = (value) => v8.deserialize(v8.serialize(value))
}
