import { Route, BrowserRouter, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import BoardPage from './pages/BoardPage';
import AddCharacterPage from './pages/AddCharacterPage';
import PlayPage from './pages/PlayPage';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/boards/:boardId" element={<BoardPage />} />
          <Route path="/boards/:boardId/add" element={<AddCharacterPage />} />
          <Route path="/boards/:boardId/edit/:characterId" element={<AddCharacterPage />} />
          <Route path="/boards/:boardId/play" element={<PlayPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
