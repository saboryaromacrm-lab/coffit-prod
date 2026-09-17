import { useState } from 'react';
import { Send, Truck, Scale } from 'lucide-react';
import TabCoffitASya from './reportes-sya/TabCoffitASya';
import TabSyaACoffit from './reportes-sya/TabSyaACoffit';
import TabResultados from './reportes-sya/TabResultados';

type TabType = 'coffit-sya' | 'sya-coffit' | 'resultados';

export default function ReportesSya() {
  const [activeTab, setActiveTab] = useState<TabType>('coffit-sya');

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'coffit-sya', label: 'Coffit → SyA', icon: <Send size={18} /> },
    { key: 'sya-coffit', label: 'SyA → Coffit', icon: <Truck size={18} /> },
    { key: 'resultados', label: 'Resultados', icon: <Scale size={18} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'bg-white text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'coffit-sya' && <TabCoffitASya />}
      {activeTab === 'sya-coffit' && <TabSyaACoffit />}
      {activeTab === 'resultados' && <TabResultados />}
    </div>
  );
}
