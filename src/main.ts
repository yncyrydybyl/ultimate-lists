import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initSync } from './shared.svelte'

// Start the transport before mounting so the widget handshake begins as early
// as possible. Rendering does not wait on it: the local document is authoritative
// for first paint and remote state merges in when it arrives.
void initSync()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
