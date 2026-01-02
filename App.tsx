
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SLOTS, INITIAL_STATS_MAP } from './constants';
import { SlotStats, SlotConfig, AIInsights } from './types';
import { runBatchSimulation } from './services/simulationEngine';
import { getAIInsights } from './services/geminiService';
import SlotCard from './components/SlotCard';
import RTPChart from './components/RTPChart';

const STAKE_OPTIONS = [0.1, 0.2, 0.5, 1.0, 2.0, 5.0, 10.0, 50.0, 100.0];

const App: React.FC = () => {
  const [statsMap, setStatsMap] = useState<Record<string, SlotStats>>(INITIAL_STATS_MAP);
  const [activeSlots, setActiveSlots] = useState<Set<string>>(new Set(['book-of-dead', 'razor-shark']));
  const [selectedSlotId, setSelectedSlotId] = useState<string>('book-of-dead');
  const [aiInsights, setAiInsights] = useState<Record<string, AIInsights>>({});
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [globalStake, setGlobalStake] = useState<number>(1.0);
  
  const simulationRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleSlotTracking = (id: string) => {
    setActiveSlots(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const processSimulations = useCallback(() => {
    setStatsMap(prev => {
      const nextMap = { ...prev };
      
      activeSlots.forEach(slotId => {
        const config = SLOTS.find(s => s.id === slotId);
        if (!config) return;

        const currentStats = nextMap[slotId];
        // Pass the globalStake to the simulation engine
        const batchResults = runBatchSimulation(config, 100, globalStake); 

        const batchStakes = batchResults.reduce((sum, r) => sum + r.stake, 0);
        const batchWins = batchResults.reduce((sum, r) => sum + r.win, 0);
        const batchMaxMulti = Math.max(...batchResults.map(r => r.multiplier));

        const updatedTotalStakes = currentStats.totalStakes + batchStakes;
        const updatedTotalWins = currentStats.totalWins + batchWins;
        
        // Precise RTP calculation based on actual wagered and won amounts
        const newLiveRtp = updatedTotalStakes > 0 
          ? (updatedTotalWins / updatedTotalStakes) * 100 
          : config.rtp;

        const newHistory = [...currentStats.history, ...batchResults].slice(-100);
        const newRtpHistory = [...currentStats.recentRtpHistory, newLiveRtp].slice(-30);

        nextMap[slotId] = {
          ...currentStats,
          liveRtp: newLiveRtp,
          totalSpins: currentStats.totalSpins + batchResults.length,
          totalStakes: updatedTotalStakes,
          totalWins: updatedTotalWins,
          maxMultiplier: Math.max(currentStats.maxMultiplier, batchMaxMulti),
          history: newHistory,
          recentRtpHistory: newRtpHistory,
          trend: newLiveRtp > currentStats.liveRtp ? 'up' : 'down'
        };
      });

      return nextMap;
    });
  }, [activeSlots, globalStake]);

  useEffect(() => {
    simulationRef.current = setInterval(processSimulations, 1000);
    return () => {
      if (simulationRef.current) clearInterval(simulationRef.current);
    };
  }, [processSimulations]);

  const refreshAI = async () => {
    const config = SLOTS.find(s => s.id === selectedSlotId);
    if (!config || isAiLoading) return;

    setIsAiLoading(true);
    const insight = await getAIInsights(config.name, config, statsMap[selectedSlotId]);
    setAiInsights(prev => ({ ...prev, [selectedSlotId]: insight }));
    setIsAiLoading(false);
  };

  useEffect(() => {
    refreshAI();
  }, [selectedSlotId]);

  const currentConfig = SLOTS.find(s => s.id === selectedSlotId)!;
  const currentStats = statsMap[selectedSlotId];
  const currentAI = aiInsights[selectedSlotId];

  return (
    <div className="min-h-screen pb-20">
      <nav className="glass sticky top-0 z-50 px-6 py-4 flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-500/20">
            <i className="fas fa-chart-line text-white"></i>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white uppercase">SlotTracker AI <span className="text-blue-500">PRO</span></h1>
            <p className="text-[10px] text-slate-500 font-mono">LIVE SIMULATION ENGINE v2.5.0</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="hidden md:flex flex-col items-end">
             <span className="text-[10px] text-slate-500 uppercase font-bold">Total Network Wagered</span>
             <span className="text-sm font-bold mono text-slate-200">
               ${(Object.values(statsMap) as SlotStats[]).reduce((s, stats) => s + stats.totalStakes, 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
             </span>
          </div>
          <div className="h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
            <i className="fas fa-user-shield"></i>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 md:px-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4 overflow-y-auto max-h-[80vh] pr-2 custom-scrollbar">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest px-1">Monitored Assets</h2>
          {SLOTS.map(slot => (
            <div key={slot.id} onClick={() => setSelectedSlotId(slot.id)}>
              <SlotCard 
                config={slot} 
                stats={statsMap[slot.id]} 
                isActive={activeSlots.has(slot.id)}
                onToggle={() => toggleSlotTracking(slot.id)}
              />
            </div>
          ))}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="glass rounded-3xl p-8 relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-3xl font-black text-white">{currentConfig.name} <span className="text-sm font-medium text-slate-500 ml-2">Live Analysis</span></h2>
                <div className="flex gap-4 mt-2">
                  <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400 font-mono">ID: {currentConfig.id}</span>
                  <span className="text-xs bg-slate-800 px-2 py-1 rounded text-slate-400 font-mono">MATH: LOG_NORMAL_STAKE_V2</span>
                </div>
              </div>

              {/* Stake Selector Component */}
              <div className="bg-slate-900/60 p-2 rounded-2xl border border-slate-800 flex items-center gap-3">
                <span className="text-[10px] text-slate-500 uppercase font-bold ml-2">Stake:</span>
                <select 
                  value={globalStake}
                  onChange={(e) => setGlobalStake(Number(e.target.value))}
                  className="bg-transparent text-blue-400 font-bold mono focus:outline-none cursor-pointer"
                >
                  {STAKE_OPTIONS.map(opt => (
                    <option key={opt} value={opt} className="bg-slate-900 text-white">${opt.toFixed(2)}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <div className="text-right">
                   <p className="text-[10px] text-slate-500 uppercase font-bold">Theoretical RTP</p>
                   <p className="text-lg font-bold text-white mono">{currentConfig.rtp}%</p>
                </div>
                <div className="text-right">
                   <p className="text-[10px] text-slate-500 uppercase font-bold">Current Variance</p>
                   <p className={`text-lg font-bold mono ${(currentStats.liveRtp - currentConfig.rtp) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {(currentStats.liveRtp - currentConfig.rtp).toFixed(2)}%
                   </p>
                </div>
              </div>
            </div>

            <RTPChart 
              data={currentStats.recentRtpHistory} 
              baseRtp={currentConfig.rtp} 
              color={currentConfig.color} 
            />
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
              <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Total Wagered</p>
                <p className="text-xl font-bold text-slate-200 mono">${currentStats.totalStakes.toLocaleString(undefined, {minimumFractionDigits: 0})}</p>
              </div>
              <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Total Payout</p>
                <p className="text-xl font-bold text-green-400 mono">${currentStats.totalWins.toLocaleString(undefined, {minimumFractionDigits: 0})}</p>
              </div>
              <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Hit Freq</p>
                <p className="text-xl font-bold text-slate-200">{(currentConfig.hitFreq * 100).toFixed(0)}%</p>
              </div>
              <div className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                <p className="text-[10px] text-slate-500 uppercase font-bold">Max Multi</p>
                <p className="text-xl font-bold text-blue-400 mono">{currentStats.maxMultiplier.toFixed(0)}x</p>
              </div>
            </div>
          </div>

          <div className="glass rounded-3xl p-8 border-t-4 border-blue-500 shadow-2xl shadow-blue-500/10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center animate-pulse-slow">
                  <i className="fas fa-brain text-white"></i>
                </div>
                <div>
                  <h3 className="font-bold text-white">Gemini Neural Forecaster</h3>
                  <p className="text-[10px] text-slate-500 font-mono">Last analysis: {currentAI?.analysisTime || 'Pending'}</p>
                </div>
              </div>
              <button 
                onClick={refreshAI}
                disabled={isAiLoading}
                className="p-2 px-4 rounded-full bg-slate-800 hover:bg-slate-700 text-xs text-white font-bold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isAiLoading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync-alt"></i>}
                Refresh AI
              </button>
            </div>

            {currentAI ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className={`px-4 py-2 rounded-2xl font-black text-sm uppercase tracking-wider ${
                    currentAI.luckForecast === 'Hot' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                    currentAI.luckForecast === 'Cold' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    'bg-green-500/20 text-green-400 border border-green-500/30'
                  }`}>
                    Status: {currentAI.luckForecast}
                  </div>
                  <div className="h-[1px] flex-grow bg-slate-800"></div>
                </div>
                <p className="text-lg text-slate-300 leading-relaxed italic font-medium">
                  "{currentAI.commentary}"
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center gap-3 text-slate-500">
                  <i className="fas fa-satellite-dish fa-2x animate-bounce"></i>
                  <p className="text-sm">Initiating neural sync...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <footer className="mt-12 py-8 border-t border-slate-900 text-center">
        <p className="text-slate-600 text-[10px] uppercase tracking-widest font-bold">
          SlotTracker AI Pro &copy; 2025 • Advanced Mathematical Simulation Engine
        </p>
      </footer>
    </div>
  );
};

export default App;
