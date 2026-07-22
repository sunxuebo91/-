import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { unstableSetRender } from 'antd-mobile'
import './index.css'
import App from './App.tsx'

// antd-mobile v5 的静态 API（Toast / Dialog 等）默认使用 React 18 的渲染方式。
// 当前项目使用 React 19，必须注册 createRoot 适配器，否则 Toast.show 不会挂载到 DOM。
unstableSetRender((node, container) => {
  const root = createRoot(container)
  root.render(node)
  return async () => {
    root.unmount()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
