import { useState, useEffect } from 'react';
import { 
  ChartBarIcon, 
  UsersIcon, 
  QueueListIcon, 
  EyeSlashIcon,
  EnvelopeIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

export default function Dashboard({ stats, onRefresh, onNavigate }) {
  const [recentActivity, setRecentActivity] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      // Load recent activity
      const response = await fetch('/api/prospects/recent');
      if (response.ok) {
        const data = await response.json();
        setRecentActivity(data.slice(0, 5)); // Keep the 5 most recent
      }
    } catch (error) {
      console.error('Erreur lors du chargement du dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, trend }) => (
    <div className="bg-dark-bg-olo-secondary rounded-2xl p-6 border border-dark-border hover:border-dark-hover transition-all duration-300 group">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-dark-text-tertiary text-sm font-medium">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          {trend && (
            <div className="flex items-center mt-2 text-xs">
              <ArrowTrendingUpIcon className="h-3 w-3 text-green-400 mr-1" />
              <span className="text-green-400">+{trend}% this month</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl ${
          color === 'text-blue-400' ? 'bg-blue-400/20' : 
          color === 'text-green-400' ? 'bg-green-400/20' : 
          color === 'text-yellow-400' ? 'bg-yellow-400/20' : 
          color === 'text-purple-400' ? 'bg-purple-400/20' : 'bg-dark-bg-secondary0/20'
        } group-hover:scale-110 transition-transform duration-300`}>
          <Icon className={`h-6 w-6 ${color}`} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-dark-text-primary">
            Dashboard
          </h1>
          <p className="text-dark-text-secondary mt-1">
            Overview of your prospecting activities
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-dark-hover hover:bg-dark-tertiary text-dark-text-primary rounded-lg font-medium transition-colors duration-200 flex items-center space-x-2"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Prospects"
          value={stats.totalProspects}
          icon={UsersIcon}
          color="text-blue-400"
          trend={12}
        />
        <StatCard
          title="Active Playlists"
          value={stats.totalPlaylists}
          icon={QueueListIcon}
          color="text-green-400"
          trend={8}
        />
        <StatCard
          title="Hidden Prospects"
          value={stats.hiddenProspects}
          icon={EyeSlashIcon}
          color="text-yellow-400"
        />
        <StatCard
          title="Emails Sent"
          value={stats.emailsSent}
          icon={EnvelopeIcon}
          color="text-purple-400"
          trend={25}
        />
      </div>

      {/* Contenu principal en 2 colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="lg:col-span-2">
          <div className="bg-dark-bg-olo-secondary rounded-2xl p-6 border border-dark-border">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-dark-text-primary">Recent Activity</h2>
              <ClockIcon className="h-5 w-5 text-dark-text-tertiary" />
            </div>
            
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-dark-hover rounded-full"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-dark-hover rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-dark-hover rounded w-1/2"></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-dark-hover transition-colors duration-200">
                    <div className="w-10 h-10 bg-olo-primary/20 rounded-full flex items-center justify-center">
                      <UsersIcon className="h-5 w-5 text-olo-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-dark-text-primary font-medium">
                        {activity.business_name || activity.name || 'Prospect sans nom'}
                      </p>
                      <p className="text-dark-text-tertiary text-sm">
                        Ajouté le {new Date(activity.created_at || activity.scraped_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="text-olo-accent text-sm font-medium">
                      {activity.rating ? `${activity.rating}★` : 'Nouveau'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <MagnifyingGlassIcon className="h-12 w-12 text-dark-text-tertiary mx-auto mb-4" />
                <p className="text-dark-text-secondary">No recent activity</p>
                <p className="text-dark-text-tertiary text-sm mt-1">
                  Start by scraping your first prospects!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Actions rapides */}
        <div className="space-y-6">
          {/* Actions rapides */}
          <div className="bg-dark-bg-secondary rounded-2xl p-6 border border-dark-border">
            <h2 className="text-xl font-semibold text-dark-text-primary mb-6">Quick Actions</h2>
            <div className="space-y-3">
              <button 
                onClick={() => onNavigate('scraping')}
                className="w-full flex items-center space-x-3 p-3 text-left rounded-lg hover:bg-dark-hover hover:text-dark-text-primary transition-all duration-200 group">
                <MagnifyingGlassIcon className="h-5 w-5 text-dark-text-tertiary group-hover:text-dark-text-primary" />
                <span className="font-medium">New Scraping</span>
              </button>
              <button 
                onClick={() => onNavigate('playlists')}
                className="w-full flex items-center space-x-3 p-3 text-left rounded-lg hover:bg-dark-hover hover:text-dark-text-primary transition-all duration-200 group">
                <QueueListIcon className="h-5 w-5 text-dark-text-tertiary group-hover:text-dark-text-primary" />
                <span className="font-medium">Create Playlist</span>
              </button>
              <button 
                onClick={() => onNavigate('settings')}
                className="w-full flex items-center space-x-3 p-3 text-left rounded-lg hover:bg-dark-hover hover:text-dark-text-primary transition-all duration-200 group">
                <EnvelopeIcon className="h-5 w-5 text-dark-text-tertiary group-hover:text-dark-text-primary" />
                <span className="font-medium">Email Campaign</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
