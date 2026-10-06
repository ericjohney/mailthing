import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initializeTheme, ThemeProvider } from './design-system';
import './styles.css';

initializeTheme();
createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
