import { getRandomValues } from 'expo-crypto'

if (!globalThis.crypto) {
  globalThis.crypto = {} as Crypto
}
if (typeof globalThis.crypto.getRandomValues !== 'function') {
  globalThis.crypto.getRandomValues = getRandomValues as unknown as Crypto['getRandomValues']
}
