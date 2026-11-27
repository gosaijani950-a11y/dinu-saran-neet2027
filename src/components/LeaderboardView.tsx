import React, { useEffect, useState } from 'react';
import { Trophy, Users, Flame, Crown, Medal, Sparkles, UserPlus, Copy, Check } from 'lucide-react';
import type { StudentProfile } from '../types';
import type { RankedGroup, RankedStudent } from '../hooks/useStudentFeatures';

interface LeaderboardViewProps {
  currentStudent: StudentProfile | null;
  fetchLeaderboard: (timeframe?: 'today' | 'weekly') => Promise<RankedStudent[]>;
  fetchGroupLeaderboard?: (timeframe?: 'today' | 'weekly') => Promise<RankedGroup[]>;
  createOrJoinGroup?: (groupName: string, customCode?: string) => Promise<{ code: string; name: string } | null>;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  currentStudent,
  fetchLeaderboard,
  fetchGroupLeaderboard,
  createOrJoinGroup,
}) => {
  const [boardType, setBoardType] = useState<'solo' | 'groups'>('solo');
  const [timeframe, setTimeframe] = useState<'today' | 'weekly'>('today');
  const [soloStudents, setSoloStudents] = useState<RankedStudent[]>([]);
  const [groups, setGroups] = useState<RankedGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [showSquadModal, setShowSquadModal] = useState(false);
  const [squadAction, setSquadAction] = useState<'create' | 'join'>('create');
  const [squadNameInput, setSquadNameInput] = useState('');
  const [squadCodeInput, setSquadCodeInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  const mySquadCode = (currentStudent as RankedStudent | null)?.group_code;
  const mySquadName = (currentStudent as RankedStudent | null)?.group_name;

  useEffect(() => {
    let active = true;
    setLoading(true);

    if (boardType === 'solo') {
      fetchLeaderboard(timeframe)
        .then((data) => {
          if (active) {
            setSoloStudents(data);
            setLoading(false);
          }
        })
        .catch(() => active && setLoading(false));
    } else if (fetchGroupLeaderboard) {
      fetchGroupLeaderboard(timeframe)
        .then((data) => {
          if (active) {
            setGroups(data);
            setLoading(false);
          }
        })
        .catch(() => active && setLoading(false));
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, [boardType, timeframe, fetchLeaderboard, fetchGroupLeaderboard]);

  const handleSquadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createOrJoinGroup) return;
    if (squadAction === 'create' && squadNameInput.trim()) {
      await createOrJoinGroup(squadNameInput.trim());
    } else if (squadAction === 'join' && squadCodeInput.trim()) {
      await createOrJoinGroup(`Squad ${squadCodeInput.trim().toUpperCase()}`, squadCodeInput.trim().toUpperCase());
    }
    setShowSquadModal(false);
    setSquadNameInput('');
    setSquadCodeInput('');
    if (fetchGroupLeaderboard) {
      const updated = await fetchGroupLeaderboard(timeframe);
      setGroups(updated);
    }
  };

  const copySquadCode = () => {
    if (!mySquadCode) return;
    navigator.clipboard?.writeText(mySquadCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const renderRankBadge = (index: number) => {
    if (index === 0) return <Crown className="w-5 h-5 text-amber-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-slate-400" />;
    if (index === 2) return <Medal className="w-5 h-5 text-amber-700" />;
    return <span className="text-xs font-bold text-slate-500">#{index + 1}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Main Header */}
      <div className="rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-5 text-white shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="w-6 h-6 text-amber-300" />
              <h2 className="text-xl font-extrabold tracking-tight">NEET 2027 Arena</h2>
            </div>
            <p className="text-xs text-indigo-100 mt-1">
              {boardType === 'solo'
                ? 'व्यक्तिगत रैंकिंग — रोज़ क्विज़ दें और टॉप 3 में जगह बनाएं'
                : 'Groups Battle — दोस्तों की स्क्वाड बनाएं और दूसरी टीमों को हराएं'}
            </p>
          </div>
          {boardType === 'groups' && currentStudent && createOrJoinGroup && (
            <button
              onClick={() => setShowSquadModal(true)}
              className="flex items-center gap-1.5 rounded-2xl bg-white/20 hover:bg-white/30 px-3 py-2 text-xs font-bold backdrop-blur-sm transition"
            >
              <UserPlus className="w-4 h-4" />
              {mySquadCode ? 'Squad बदलें' : 'Squad बनाएं'}
            </button>
          )}
        </div>

        {/* Primary Mode Switch: Solo Leaderboard vs Groups Battle */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-black/20 p-1">
          <button
            onClick={() => setBoardType('solo')}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-extrabold transition ${
              boardType === 'solo' ? 'bg-white text-indigo-700 shadow' : 'text-white/85 hover:text-white'
            }`}
          >
            <Flame className="w-4 h-4" />
            Solo Leaderboard
          </button>
          <button
            onClick={() => setBoardType('groups')}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-extrabold transition ${
              boardType === 'groups' ? 'bg-white text-indigo-700 shadow' : 'text-white/85 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            Groups Battle
          </button>
        </div>

        {/* Sub-Filter: Today vs Weekly */}
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            onClick={() => setTimeframe('today')}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
              timeframe === 'today'
                ? 'bg-amber-400 text-slate-950 shadow'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            ⚡ Today
          </button>
          <button
            onClick={() => setTimeframe('weekly')}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
              timeframe === 'weekly'
                ? 'bg-amber-400 text-slate-950 shadow'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            📅 Weekly (7 Days)
          </button>
        </div>
      </div>

      {/* Active Squad Banner in Groups Battle */}
      {boardType === 'groups' && mySquadCode && (
        <div className="flex items-center justify-between rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              आपकी Squad
            </p>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white">
              {mySquadName} <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400">({mySquadCode})</span>
            </p>
          </div>
          <button
            onClick={copySquadCode}
            className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedCode ? 'Copied' : 'Invite Code'}
          </button>
        </div>
      )}

      {/* Squad Create / Join Modal */}
      {showSquadModal && (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-xl space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSquadAction('create')}
              className={`flex-1 rounded-xl py-2 text-xs font-bold ${
                squadAction === 'create'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              नई Squad बनाएं
            </button>
            <button
              type="button"
              onClick={() => setSquadAction('join')}
              className={`flex-1 rounded-xl py-2 text-xs font-bold ${
                squadAction === 'join'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              Code से जुड़ें
            </button>
          </div>
          <form onSubmit={handleSquadSubmit} className="space-y-2.5">
            {squadAction === 'create' ? (
              <input
                type="text"
                required
                placeholder="Squad का नाम (जैसे: Kota Warriors)"
                value={squadNameInput}
                onChange={(e) => setSquadNameInput(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm"
              />
            ) : (
              <input
                type="text"
                required
                placeholder="6-अंकों का Squad Code डालें (जैसे: KOTA412)"
                value={squadCodeInput}
                onChange={(e) => setSquadCodeInput(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm uppercase"
              />
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowSquadModal(false)}
                className="rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-500"
              >
                रद्द करें
              </button>
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white"
              >
                Save Squad
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rankings List */}
      {loading ? (
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
          {timeframe === 'today' ? 'आज की रैंकिंग लोड हो रही है...' : 'पिछले 7 दिनों की रैंकिंग लोड हो रही है...'}
        </div>
      ) : boardType === 'solo' ? (
        <div className="space-y-2.5">
          {soloStudents.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-sm text-slate-500">
              अभी इस समय अवधि में कोई स्कोर नहीं है। पहला क्विज़ देकर नंबर 1 बनें!
            </div>
          ) : (
            soloStudents.map((st, idx) => {
              const isMe = currentStudent?.id === st.id;
              const pts = st.period_points ?? 0;
              return (
                <div
                  key={st.id}
                  className={`flex items-center justify-between rounded-2xl border p-3.5 transition ${
                    isMe
                      ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                      {renderRankBadge(idx)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                          {st.full_name}
                        </p>
                        {isMe && (
                          <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            आप
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {st.period_correct ?? 0} सही / {st.period_attempted ?? 0} हल
                        {st.group_name ? ` • 🛡️ ${st.group_name}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-indigo-600 dark:text-indigo-400">{pts}</p>
                    <p className="text-[10px] font-semibold text-slate-400">PTS</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {groups.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
              <Sparkles className="w-7 h-7 text-indigo-500 mx-auto" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                अभी कोई Squad मैदान में नहीं है!
              </p>
              <p className="text-xs text-slate-500">
                ऊपर "Squad बनाएं" पर क्लिक करें, कोड दोस्तों को भेजें और Groups Battle में टॉप करें।
              </p>
            </div>
          ) : (
            groups.map((grp, idx) => {
              const isMyGroup = mySquadCode === grp.group_code;
              return (
                <div
                  key={grp.group_code}
                  className={`flex items-center justify-between rounded-2xl border p-3.5 transition ${
                    isMyGroup
                      ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                      {renderRankBadge(idx)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
                          {grp.group_name}
                        </p>
                        <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                          {grp.group_code}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        👥 {grp.member_count} सदस्य • ⭐ MVP: {grp.top_contributor}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-indigo-600 dark:text-indigo-400">
                      {grp.total_points}
                    </p>
                    <p className="text-[10px] font-semibold text-slate-400">TEAM PTS</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
