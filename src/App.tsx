import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Compare from './pages/Compare';
import Environments from './pages/Environments';
import EnvironmentDetail from './pages/EnvironmentDetail';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import Branches from './pages/Branches';
import Import from './pages/Import';
import LocalEnvironments from './pages/LocalEnvironments';
import Settings from './pages/Settings';
import Login from './pages/Login';
import AppLoadingSkeleton from './components/AppLoadingSkeleton';

function FullPageSkeleton() {
  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar skeleton */}
      <aside className="w-[68px] bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="h-16 flex items-center justify-center border-b border-gray-800">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
        </div>
        <div className="flex-1 py-4 px-2 space-y-2">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-10 w-10 mx-auto rounded-lg bg-gray-800 animate-pulse" />
          ))}
        </div>
      </aside>
      {/* Content skeleton */}
      <main className="flex-1 p-8 max-w-7xl mx-auto">
        <AppLoadingSkeleton />
      </main>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullPageSkeleton />;
  }

  if (!user) return <Login />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/compare/:name" element={<Compare />} />
          <Route path="/environments" element={<Environments />} />
          <Route path="/environments/:name" element={<EnvironmentDetail />} />
          <Route path="/local-environments" element={<LocalEnvironments />} />
          <Route path="/local-environments/:id" element={<LocalEnvironments />} />
          <Route path="/logs" element={<Jobs />} />
          <Route path="/logs/:id" element={<JobDetail />} />
          <Route path="/branches" element={<Branches />} />
          <Route path="/import" element={<Import />} />
          <Route path="/import/:planId" element={<Import />} />
          <Route path="/import/:planId/run/:jobId" element={<Import />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
