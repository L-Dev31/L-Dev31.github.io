import { useState, useEffect } from 'react';
import { 
  HomeIcon, 
  MagnifyingGlassIcon, 
  QueueListIcon, 
  EyeSlashIcon, 
  CogIcon,
  ChartBarIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  UsersIcon
} from '@heroicons/react/24/outline';

// Page components
import Dashboard from './components/Dashboard';
import Scraping from './components/Scraping';
import Playlists from './components/Playlists';
import Hidden from './components/Hidden';
import Settings from './components/Settings';

const navigation = [
  { name: 'Dashboard', icon: HomeIcon, id: 'dashboard', badge: null },
  { name: 'Scraping', icon: MagnifyingGlassIcon, id: 'scraping', badge: null },
  { name: 'Playlists', icon: QueueListIcon, id: 'playlists', badge: null },
  { name: 'Hidden', icon: EyeSlashIcon, id: 'hidden', badge: null },
  { name: 'Settings', icon: CogIcon, id: 'settings', badge: null }
];

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [stats, setStats] = useState({
    totalProspects: 0,
    totalPlaylists: 0,
    hiddenProspects: 0,
    emailsSent: 0
  });

  // Load initial stats
  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      // Load stats from API
      const [prospectsRes, playlistsRes] = await Promise.all([
        fetch('/api/prospects/stats'),
        fetch('/api/playlists/stats')
      ]);
      
      if (prospectsRes.ok && playlistsRes.ok) {
        const prospectsData = await prospectsRes.json();
        const playlistsData = await playlistsRes.json();
        
        setStats({
          totalProspects: prospectsData.total || 0,
          totalPlaylists: playlistsData.total || 0,
          hiddenProspects: prospectsData.hidden || 0,
          emailsSent: prospectsData.emailsSent || 0
        });
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard stats={stats} onRefresh={loadStats} onNavigate={setCurrentPage} />;
      case 'scraping':
        return <Scraping onProspectsAdded={loadStats} />;
      case 'playlists':
        return <Playlists onPlaylistsChanged={loadStats} />;
      case 'hidden':
        return <Hidden onHiddenChanged={loadStats} />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard stats={stats} onRefresh={loadStats} onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg-secondary text-dark-text-primary">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-dark-bg-olo-secondary border-r border-dark-border transition-all duration-300 ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}>
        {/* Logo */}
        <div className="flex items-center justify-center h-16 bg-dark-bg-olo-secondary px-3">
          <div className="flex items-center space-x-4">
            <img 
              src="/icon.png" 
              alt="Icon" 
              className="w-12 h-12 object-contain flex-shrink-0"
            />
            {!sidebarCollapsed && (
              <img 
                src="/logo.png" 
                alt="Seal the Deal Logo" 
                className="h-8 object-contain"
              />
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`
                  w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200
                  ${isActive 
                    ? 'bg-dark-hover text-dark-text-primary' 
                    : 'text-dark-text-secondary hover:bg-dark-hover hover:text-dark-text-primary'
                  }
                  ${sidebarCollapsed ? 'justify-center' : 'justify-start'}
                `}
              >
                <item.icon className={`h-5 w-5 ${!sidebarCollapsed && 'mr-3'}`} />
                {!sidebarCollapsed && (
                  <span className="truncate">{item.name}</span>
                )}
                {!sidebarCollapsed && item.badge && (
                  <span className="ml-auto bg-dark-hover text-dark-text-primary px-2 py-0.5 rounded-full text-xs font-bold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Quick stats */}
        {!sidebarCollapsed && (
          <div className="p-4 border-t border-dark-border">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-dark-text-tertiary">
                <span>Prospects:</span>
                <span className="text-blue-400 font-semibold">{stats.totalProspects}</span>
              </div>
              <div className="flex justify-between text-dark-text-tertiary">
                <span>Playlists:</span>
                <span className="text-green-400 font-semibold">{stats.totalPlaylists}</span>
              </div>
              <div className="flex justify-between text-dark-text-tertiary">
                <span>Hidden:</span>
                <span className="text-yellow-400 font-semibold">{stats.hiddenProspects}</span>
              </div>
            </div>
          </div>
        )}

        {/* Toggle sidebar */}
        <div className="p-4 border-t border-dark-border">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center p-2 text-dark-text-secondary hover:text-dark-text-primary hover:bg-dark-hover rounded-lg transition-colors duration-200"
          >
            <svg className={`h-5 w-5 transition-transform duration-300 ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        <main className="p-6">
          {renderCurrentPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
