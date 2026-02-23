import { Route, Routes } from 'react-router-dom';
import { HppHomePage } from './pages/HppHomePage.jsx';

export const App = () => {
  return (
    <Routes>
      <Route path="*" element={<HppHomePage />} />
    </Routes>
  );
};
