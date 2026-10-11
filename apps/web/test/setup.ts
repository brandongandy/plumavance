import { config } from '@vue/test-utils'
import { afterEach } from 'vitest'

config.global.renderStubDefaultSlot = true

class ResizeObserverStub implements ResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: () => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
})
Object.defineProperty(window, 'ResizeObserver', { configurable: true, value: ResizeObserverStub })
Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeObserverStub })
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: () => null,
})

afterEach(() => {
  document.body.innerHTML = ''
})
