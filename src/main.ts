import './styles.css'
import { App } from './app'
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })

const root = document.querySelector<HTMLDivElement>('#app')
if (root) {
  new App(root).start()
}
