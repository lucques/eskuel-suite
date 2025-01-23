import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import BrowserPage from './BrowserPage';
import GameConsolePage from './GameConsolePage';
import GameEditorPage from './GameEditorPage';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/browser" element={<BrowserPage/>} />
        <Route path="/game-console" element={<GameConsolePage/>} />
        <Route path="/game-editor" element={<GameEditorPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
